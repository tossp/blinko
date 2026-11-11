import type { Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { bindPreparedAttachments, type PreparedAttachment } from './attachmentBinding';
import type { NoteWriteGuard } from './noteWriteGuard';

export async function updateNoteWithHistory(
  db: Pick<PrismaClient, '$transaction'>,
  { id, accountId, content, update, preparedAttachments, guard }: {
    id: number;
    accountId: number;
    content: string | null;
    update: Prisma.notesUpdateInput;
    preparedAttachments: PreparedAttachment[];
    guard?: NoteWriteGuard;
  },
) {
  const constraint = guard?.noteId === id ? guard : undefined;
  if (constraint?.error) throw constraint.error;
  let nextVersion: string | undefined;
  const note = await db.$transaction(async (tx) => {
    if (constraint) {
      // Atomic compare-and-swap, NOT a preflight SELECT. A conditional no-op
      // update claims this row version within the existing write transaction.
      // PostgreSQL rechecks xmin after any concurrent writer commits. The
      // following ORM update retains all existing permission/data semantics.
      const [claimed] = await tx.$queryRaw<Array<{ version: string }>>`
        UPDATE notes SET content = content
        WHERE id = ${id} AND xmin::text = ${constraint.version}
        RETURNING xmin::text AS version
      `;
      if (!claimed) throw new TRPCError({
        code: 'CONFLICT',
        message: 'Note changed during AI post-processing; the newer edit was kept',
      });
      nextVersion = claimed.version;
    }
    const existingNote = await tx.notes.findUnique({
      where: { id },
      select: {
        content: true, accountId: true, type: true,
        isArchived: true, isTop: true, isShare: true, isRecycle: true,
      },
    });
    if (existingNote && content != null && content !== existingNote.content) {
      const latestVersion = await tx.noteHistory.findFirst({
        where: { noteId: id }, orderBy: { version: 'desc' }, select: { version: true },
      });
      await tx.noteHistory.create({
        data: {
          noteId: id, content: existingNote.content,
          version: (latestVersion?.version || 0) + 1, accountId,
          metadata: {
            type: existingNote.type, isArchived: existingNote.isArchived,
            isTop: existingNote.isTop, isShare: existingNote.isShare,
            isRecycle: existingNote.isRecycle,
          },
        },
      });
    }
    // Recheck live edit permission, including a concurrently revoked share.
    const saved = await tx.notes.update({
      where: {
        id,
        OR: [
          { accountId },
          { internalShares: { some: { accountId, canEdit: true } } },
        ],
      },
      data: update,
    });
    await bindPreparedAttachments(tx, preparedAttachments, accountId, saved.id, id);
    return saved;
  });
  // Never advance on rollback or fetch a version AFTER commit: an external
  // edit in that gap must not accidentally become part of this AI run.
  if (constraint && nextVersion) constraint.version = nextVersion;
  return note;
}
