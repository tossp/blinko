import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from '../../../../prisma/connection';
import { readNoteForPostProcessing, type NoteWriteGuard } from '../../../lib/noteWriteGuard';
import { updateNoteWithHistory } from '../../../lib/noteUpdate';
import { prepareAttachmentBindings } from '../../../lib/attachmentBinding';
import { deferred, postProcessFixture } from './post-process-fixture';

// Explicitly opt in with a disposable migrated PostgreSQL DATABASE_URL. Never
// fall back to a developer/production DB for normal AI regression execution.
if (process.env.BLINKO_TEST_POST_PROCESS_PG !== '1') {
  test.skip('real PostgreSQL post-processing regression (requires explicit disposable DB opt-in)', () => {});
} else {
  const db = new PrismaClient({ adapter: createPrismaAdapter() });
  const { control, caller, updateTool, run } = await postProcessFixture(db);
  const prefix = `post-process-cas-${crypto.randomUUID()}`;
  let accountId: number;
  let otherAccountId: number;
  let noteId: number;
  const noteIds: number[] = [];
  const saved = () => db.notes.findUniqueOrThrow({ where: { id: noteId } });
  const history = () => db.noteHistory.findMany({ where: { noteId }, orderBy: { version: 'asc' } });
  const snapshot = async () => {
    const note = await readNoteForPostProcessing(db, noteId);
    return { noteId, version: note.version } satisfies NoteWriteGuard;
  };

  beforeAll(async () => {
    accountId = (await db.accounts.create({ data: { name: `${prefix}-owner`, role: 'user' } })).id;
    otherAccountId = (await db.accounts.create({ data: { name: `${prefix}-other`, role: 'user' } })).id;
  });
  beforeEach(async () => {
    noteId = (await db.notes.create({ data: { accountId, content: 'original', type: 1, isTop: true, metadata: { test: prefix } } })).id;
    noteIds.push(noteId);
    control.accountId = accountId;
    control.mode = 'both';
    control.enabled = true;
    control.commentFactory = async () => {};
    control.commentGenerate = async () => ({ text: 'summary' });
    control.tagGenerate = async () => ({ text: '#tag' });
    control.baseFactory = async () => {};
    control.baseGenerate = async (_messages, { requestContext }) => {
      await updateTool(noteId, 'smart result #tag', requestContext, 'note');
      return { text: 'smart success' };
    };
    control.commentsSent.length = 0;
    control.webhooks.length = 0;
  });
  afterAll(async () => {
    try {
      await db.comments.deleteMany({ where: { noteId: { in: noteIds } } });
      await db.tagsToNote.deleteMany({ where: { noteId: { in: noteIds } } });
      await db.noteReference.deleteMany({ where: { OR: [{ fromNoteId: { in: noteIds } }, { toNoteId: { in: noteIds } }] } });
      await db.attachments.deleteMany({ where: { accountId: { in: [accountId, otherAccountId] } } });
      await db.notes.deleteMany({ where: { id: { in: noteIds } } });
      await db.tag.deleteMany({ where: { accountId: { in: [accountId, otherAccountId] } } });
      await db.accounts.deleteMany({ where: { id: { in: [accountId, otherAccountId] } } });
    } finally { await db.$disconnect(); }
  });

  describe('actual notes.upsert / update tool / PostgreSQL transactions', () => {
    test('both mode writes tags then smartEdit, preserving type, metadata, flags, history and delivery', async () => {
      control.baseGenerate = async (messages, { requestContext }) => {
        expect(messages[0].content).toContain('original\n#tag');
        expect((await saved()).content).toBe('original\n#tag');
        await updateTool(noteId, 'smart result #tag', requestContext, 'note');
        return { text: 'smart success' };
      };
      expect((await run(noteId)).success).toBe(true);
      expect(await saved()).toMatchObject({ content: 'smart result #tag', type: 1, isTop: true, metadata: { test: prefix } });
      expect((await history()).map(row => row.content)).toEqual(['original', 'original\n#tag']);
      expect((await history())[0].metadata).toMatchObject({ type: 1, isTop: true });
      expect(control.webhooks.map(row => row.event)).toEqual(['update', 'update']);
      const tags = await db.tagsToNote.findMany({ where: { noteId }, include: { tag: true } });
      expect(tags.map(row => row.tag.name)).toEqual(['tag']);
    });

    test('editing immediately after the read but before generation is not overwritten', async () => {
      control.commentFactory = async () => { await caller().upsert({ id: noteId, content: 'early user edit' }); };
      expect((await run(noteId)).success).toBe(false);
      expect((await saved()).content).toBe('early user edit');
      expect((await history()).map(row => row.content)).toEqual(['original']);
    });

    test('a user edit during tag generation wins and no stale history/tag delivery is added', async () => {
      const entered = deferred();
      const release = deferred();
      control.tagGenerate = async () => { entered.resolve(); await release.promise; return { text: '#stale' }; };
      const processing = run(noteId);
      await entered.promise;
      try { await caller().upsert({ id: noteId, content: 'user edit during tags' }); }
      finally { release.resolve(); }
      expect((await processing).success).toBe(false);
      expect((await saved()).content).toBe('user edit during tags');
      expect((await history()).map(row => row.content)).toEqual(['original']);
      expect(control.webhooks).toHaveLength(1);
      expect(await db.tagsToNote.count({ where: { noteId } })).toBe(0);
    });

    test.each(['smartEdit', 'custom'])('%s preserves edits during model wait even if the model hides its tool error', async mode => {
      control.mode = mode;
      const entered = deferred();
      const release = deferred();
      control.baseGenerate = async (_messages, { requestContext }) => {
        entered.resolve();
        await release.promise;
        try { await updateTool(noteId, 'stale generated content', requestContext); } catch {}
        return { text: 'falsely claimed success' };
      };
      const processing = run(noteId);
      await entered.promise;
      try { await caller().upsert({ id: noteId, content: 'user edit during smart/custom' }); }
      finally { release.resolve(); }
      expect((await processing).success).toBe(false);
      expect((await saved()).content).toBe('user edit during smart/custom');
      expect((await history()).map(row => row.content)).toEqual(['original']);
      expect(await db.comments.count({ where: { noteId, content: 'falsely claimed success' } })).toBe(0);
    });

    test('a user edit between tags and smartEdit invalidates the advanced run version', async () => {
      control.baseFactory = async () => { await caller().upsert({ id: noteId, content: 'user edit after tags' }); };
      expect((await run(noteId)).success).toBe(false);
      expect((await saved()).content).toBe('user edit after tags');
      expect((await history()).map(row => row.content)).toEqual(['original', 'original\n#tag']);
    });

    test('multiple sequential custom tool updates advance only this run version', async () => {
      control.mode = 'custom';
      control.baseGenerate = async (_messages, { requestContext }) => {
        await updateTool(noteId, 'custom first', requestContext, 'note');
        await updateTool(noteId, 'custom second', requestContext, 'note');
        return { text: 'done' };
      };
      expect((await run(noteId)).success).toBe(true);
      expect((await saved()).content).toBe('custom second');
      expect((await history()).map(row => row.content)).toEqual(['original', 'custom first']);
    });

    test('MVCC rejects ABA edits even when an external writer restores content and updatedAt', async () => {
      control.mode = 'tags';
      control.tagGenerate = async () => {
        const original = await saved();
        await db.notes.update({ where: { id: noteId }, data: { content: 'intermediate', updatedAt: original.updatedAt } });
        await db.notes.update({ where: { id: noteId }, data: { content: 'original', updatedAt: original.updatedAt } });
        return { text: '#stale' };
      };
      expect((await run(noteId)).success).toBe(false);
      expect((await saved()).content).toBe('original');
      expect(await history()).toHaveLength(0);
    });

    test('the conditional UPDATE rechecks its predicate after waiting for a concurrent PostgreSQL writer', async () => {
      control.mode = 'tags';
      const generating = deferred();
      const finishGeneration = deferred();
      const userHolding = deferred();
      const commitUser = deferred();
      control.tagGenerate = async () => { generating.resolve(); await finishGeneration.promise; return { text: '#stale' }; };
      const processing = run(noteId);
      await generating.promise;
      const editing = db.$transaction(async tx => {
        await tx.notes.update({ where: { id: noteId }, data: { content: 'concurrent committed user edit' } });
        userHolding.resolve();
        await commitUser.promise;
      }, { timeout: 10000 });
      await userHolding.promise;
      finishGeneration.resolve();
      let waiting = false;
      try {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const [state] = await db.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock'
                AND query LIKE '%UPDATE notes SET content = content%'
            ) AS waiting
          `;
          if (state.waiting) { waiting = true; break; }
          await Bun.sleep(10);
        }
      } finally { commitUser.resolve(); }
      await editing;
      expect((await processing).success).toBe(false);
      expect(waiting).toBe(true);
      expect((await saved()).content).toBe('concurrent committed user edit');
      expect(await history()).toHaveLength(0);
    }, 15000);

    test('failed attachment binding rolls back the CAS, history and note without advancing the guard', async () => {
      const file = await db.attachments.create({ data: { accountId, name: prefix, path: `/api/file/${prefix}.png`, type: 'image/png' } });
      const preparedAttachments = await prepareAttachmentBindings(db, [file.path], accountId, noteId);
      const guard = await snapshot();
      const initialVersion = guard.version;
      await db.attachments.update({ where: { id: file.id }, data: { accountId: otherAccountId } });
      const write = () => updateNoteWithHistory(db, { id: noteId, accountId, content: 'AI update', update: { content: 'AI update' }, preparedAttachments, guard });
      await expect(write()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(guard.version).toBe(initialVersion);
      expect((await snapshot()).version).toBe(initialVersion);
      expect((await saved()).content).toBe('original');
      expect(await history()).toHaveLength(0);
      await db.attachments.update({ where: { id: file.id }, data: { accountId } });
      await write();
      expect(guard.version).not.toBe(initialVersion);
      expect((await saved()).content).toBe('AI update');
      expect((await db.attachments.findUniqueOrThrow({ where: { id: file.id } })).noteId).toBe(noteId);
    });

    test('the live permission check rolls back CAS and history for an unauthorized writer', async () => {
      const guard = await snapshot();
      const initialVersion = guard.version;
      await expect(updateNoteWithHistory(db, {
        id: noteId, accountId: otherAccountId, content: 'unauthorized',
        update: { content: 'unauthorized' }, preparedAttachments: [], guard,
      })).rejects.toMatchObject({ code: 'P2025' });
      expect(guard.version).toBe(initialVersion);
      expect((await snapshot()).version).toBe(initialVersion);
      expect((await saved()).content).toBe('original');
      expect(await history()).toHaveLength(0);
    });
  });
}
