import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export async function queryVisibleNoteReferences(noteId: number, type: 'references' | 'referencedBy', accountId: number) {
  // Same visibility as notes.detail: owning a note or receiving an internal
  // share permits reading it. Sharing an anchor does not share its neighbours.
  const visible: Prisma.notesWhereInput = {
    OR: [{ accountId }, { internalShares: { some: { accountId } } }],
  };
  const include = {
    attachments: true,
    tags: { include: { tag: true } },
    references: { select: { toNoteId: true } },
    referencedBy: { select: { fromNoteId: true } },
  } satisfies Prisma.notesInclude;
  const where = { fromNote: visible, toNote: visible };

  if (type === 'references') {
    const references = await prisma.noteReference.findMany({
      where: { ...where, fromNoteId: noteId },
      include: { toNote: { include } },
      orderBy: { createdAt: 'desc' },
    });
    return references.map(ref => ({ ...ref.toNote, referenceCreatedAt: ref.createdAt }));
  }

  const referencedBy = await prisma.noteReference.findMany({
    where: { ...where, toNoteId: noteId },
    include: { fromNote: { include } },
    orderBy: { createdAt: 'desc' },
  });
  return referencedBy.map(ref => ({ ...ref.fromNote, referenceCreatedAt: ref.createdAt }));
}
