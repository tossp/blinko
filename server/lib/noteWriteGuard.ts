import type { PrismaClient } from '@prisma/client';

// Only server-created contexts can carry this constraint; never a public input
// or a JWT claim. Mastra's RequestContext carries the same run-local object.
const AI_NOTE_WRITE_GUARD = Symbol('ai-note-write-guard');
export const AI_NOTE_WRITE_GUARD_CONTEXT_KEY = 'aiNoteWriteGuard';
export interface NoteWriteGuard {
  noteId: number;
  version: string;
  error?: unknown;
}

// Keep the private symbol out of public Context and inferred router/plugin
// declarations. The enumerable runtime property survives middleware spreads.
export function withNoteWriteGuard<T extends object>(context: T, guard: NoteWriteGuard | undefined): T {
  return { ...context, [AI_NOTE_WRITE_GUARD]: guard };
}

export function getNoteWriteGuard(context: object): NoteWriteGuard | undefined {
  return (context as { [AI_NOTE_WRITE_GUARD]?: NoteWriteGuard })[AI_NOTE_WRITE_GUARD];
}

export async function readNoteForPostProcessing(db: Pick<PrismaClient, '$queryRaw'>, noteId: number) {
  // Read content and MVCC version in ONE statement. updatedAt has microsecond
  // precision in PostgreSQL but only milliseconds in JS, and may be supplied
  // by callers. xmin also detects edits that preserve content/timestamps (ABA).
  const [note] = await db.$queryRaw<Array<{
    id: number; content: string; accountId: number | null; type: number; version: string;
  }>>`
    SELECT id, content, "accountId", type, xmin::text AS version
    FROM notes WHERE id = ${noteId}
  `;
  return note;
}
