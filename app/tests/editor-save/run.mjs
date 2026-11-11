// Run with Node 26.13; supply PLAYWRIGHT_MODULE and CHROMIUM_PATH if not installed locally.
// Only the loopback fixture API is used. No production server, credentials, or model calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../..');
const OUT = process.env.EDITOR_SAVE_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'blinko-editor-save-'));
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let behavior = 'success';
let requests = [];
let uploads = 0;
let writes = [];
let notes = new Map();
let nextId = 1000;
let saveGate;
let releaseSave;
const results = [];

function fixtures() {
  return {
    name: 'isolated-editor-fixtures', enforce: 'pre',
    load(id) {
      // Compare real baseline sources without switching branches or changing the worktree.
      const relative = path.relative(REPO, id);
      if (process.env.EDITOR_BASELINE && [
        'app/src/components/BlinkoEditor/index.tsx',
        'app/src/components/Common/Editor/editorStore.tsx',
      ].includes(relative)) {
        return execFileSync('git', ['show', `${process.env.EDITOR_BASELINE}:${relative}`], { cwd: REPO, encoding: 'utf8' });
      }
    },
    configureServer(server) {
      server.middlewares.use('/dist/js/', (req, res) => {
        const asset = path.join(REPO, 'node_modules/vditor/dist/js', new URL(req.url, 'http://localhost').pathname);
        if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('content-type', asset.endsWith('.css') ? 'text/css' : 'application/javascript');
        fs.createReadStream(asset).pipe(res);
      });
      server.middlewares.use('/api/file/upload', async (req, res) => {
        for await (const _ of req) { /* drain actual multipart upload */ }
        uploads++;
        res.setHeader('content-type', 'application/json');
        const name = uploads === 1 ? 'draft.txt' : 'pending.txt';
        res.end(JSON.stringify({ fileName: name, filePath: `/isolated/${name}`, type: 'text/plain' }));
      });
      server.middlewares.use('/api/trpc', async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const url = req.originalUrl || req.url;
        if (!url.includes('notes.upsert')) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify([{ result: { data: { json: [] } } }]));
          return;
        }
        const outcome = behavior;
        requests.push({ outcome, body });
        if (outcome === 'network') { req.socket.destroy(); return; }
        if (outcome.startsWith('pending')) await saveGate;
        // Allow real UI interaction and duplicate send attempts while a request is pending.
        await new Promise(resolve => setTimeout(resolve, outcome === '502' ? 800 : 200));
        if (outcome === '502') { res.statusCode = 502; res.end('isolated upstream failure'); return; }
        const input = JSON.parse(body)[0].json;
        const id = input.id == null ? nextId++ : input.id;
        const saved = { ...input, id };
        writes.push(saved);
        notes.set(id, saved);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([{ result: { data: { json: saved } } }]));
      });
    },
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const t = window.__test;
    const editor = t.getEditor();
    return {
      editorValue: editor?.vditor?.getValue(),
      files: editor?.files.map(file => ({ name: file.name, path: file.uploadPromise.value })),
      metadata: editor?.metadata, references: editor?.references.slice(),
      clearEvents: t.clearEvents, draftOperations: t.draftOperations.slice(),
      contentDraft: localStorage.getItem('createModeNote'),
      attachmentDraft: localStorage.getItem('createModeAttachments'),
      editDrafts: t.blinko.editContentStorage.list.slice(),
      editAttachmentDrafts: t.blinko.editAttachmentsStorage.list.slice(),
      createContentValue: t.blinko.createContentStorage.value,
      noteContent: t.blinko.noteContent,
      selectedContent: t.blinko.curSelectedNote?.content,
      offlineNotes: t.blinko.offlineNotes.slice(),
      offlineStorage: localStorage.getItem(t.blinko.offlineNoteStorage.key),
      onSended: t.onSended, dialogOpen: t.dialog.isOpen,
      upsertReturns: t.upsertReturns.slice(),
      online: t.base.isOnline, navigatorOnline: navigator.onLine,
      loading: t.blinko.upsertNote.loading.value, sending: editor?.isSending,
    };
  });
}

async function send(page, concurrent = process.env.DUPLICATE_SENDS !== 'false') {
  await page.locator('#global-editor [class*="w-[60px]"]').click();
  if (concurrent) {
    await page.evaluate(async () => {
      const editor = window.__test.getEditor();
      if (editor) await Promise.all(Array.from({ length: 4 }, () => editor.handleSend()));
    });
  }
  await page.waitForFunction(() => {
    const t = window.__test;
    return t.upsertReturns.length > 0 && !t.blinko.upsertNote.loading.value && !t.getEditor()?.isSending;
  }, null, { timeout: 10000 });
}

async function runCase(browser, origin, mode, outcome, surface) {
  behavior = outcome;
  saveGate = new Promise(resolve => { releaseSave = resolve; });
  requests = []; writes = []; uploads = 0;
  notes = new Map(mode === 'edit' ? [[42, { id: 42, content: 'server-original' }]] : []);
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('blinko-editor-view-mode', 'raw'));
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error.stack || error)));
  const record = { case: `${mode}/${outcome}/${surface}`, failures: [], pageErrors, external };
  const check = (fn) => { try { fn(); } catch (error) { record.failures.push(error.message); } };
  try {
    await page.goto(`${origin}/?mode=${mode}&dialog=${surface === 'dialog'}`, { waitUntil: 'domcontentloaded' });
    if (surface === 'dialog') await page.getByText('Open editor', { exact: true }).click();
    await page.waitForFunction(() => window.__test?.getEditor()?.vditor);
    const editable = page.locator(`#vditor-${mode} textarea.vditor-sv`);
    let input = `${mode}-${outcome}-${surface}-draft`;
    await editable.fill(input);
    await page.waitForFunction(({ mode, input }) => localStorage.getItem(mode === 'create' ? 'createModeNote' : 'editModeNotes')?.includes(input), { mode, input });
    // Actual file input -> uploadFiles -> axios multipart -> fixture HTTP response -> persistent attachment draft.
    await page.locator('#global-editor input[type=file]').setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft attachment') });
    await page.waitForFunction(() => window.__test.getEditor().files.some(file => file.uploadPromise?.value === '/isolated/draft.txt'));
    await page.waitForFunction(() => document.querySelector('.attachment-container')?.textContent.includes('draft'));
    await page.evaluate(() => { window.__test.getEditor().metadata = { regression: 'preserve' }; });
    if (outcome === 'offline') {
      await context.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine && !window.__test.base.isOnline);
    }
    await page.evaluate(() => { window.__test.draftOperations.length = 0; });
    record.before = await snapshot(page);
    if (outcome.startsWith('pending')) {
      const pending = send(page);
      await page.waitForFunction(() => window.__test.blinko.upsertNote.loading.value);
      if (outcome === 'pending-text') {
        input = 'changed-start-' + input + '-changed-end';
        await editable.fill(input);
      } else if (outcome === 'pending-file') {
        await page.locator('#global-editor input[type=file]').setInputFiles({ name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('new attachment') });
        await page.waitForFunction(() => window.__test.getEditor().files.some(file => file.uploadPromise?.value === '/isolated/pending.txt'));
      } else {
        await page.evaluate(() => {
          const editor = window.__test.getEditor();
          editor.references.push(73);
          editor.metadata.regression = 'changed-while-saving';
        });
      }
      record.during = await snapshot(page);
      releaseSave();
      await pending;
    } else if (outcome === '502') {
      // Input remains editable during save; failure must retain this newer text too.
      const pending = send(page);
      await page.waitForFunction(() => window.__test.blinko.upsertNote.loading.value);
      input += '-typed-while-saving';
      await editable.fill(input);
      await pending;
    } else {
      await send(page);
    }
    record.after = await snapshot(page);
    const succeeds = outcome === 'success' || outcome.startsWith('pending') || (outcome === 'offline' && mode === 'create');
    const after = record.after;
    if (outcome.startsWith('pending')) {
      check(() => assert.equal(writes.length, 1));
      check(() => assert.equal(requests.length, 1));
      check(() => assert.equal(writes[0].content, record.before.editorValue));
      check(() => assert.equal(writes[0].attachments.length, 1));
      check(() => assert.deepEqual(writes[0].references, []));
      check(() => assert.deepEqual(writes[0].metadata, { regression: 'preserve' }));
      check(() => assert.equal(after.onSended, 0));
      check(() => assert.equal(after.clearEvents, 0));
      check(() => assert.equal(after.editorValue.trim(), input));
      check(() => assert.equal(after.files.length, outcome === 'pending-file' ? 2 : 1));
      check(() => assert.ok(after.draftOperations.every(op => op.value !== null)));
      if (surface === 'dialog') check(() => assert.equal(after.dialogOpen, true));
      if (mode === 'create') check(() => assert.equal(JSON.parse(after.contentDraft).content.trim(), input));
      else check(() => assert.equal(after.editDrafts.find(note => note.id === 42)?.content.trim(), input));
      if (outcome === 'pending-file') {
        const files = mode === 'create' ? JSON.parse(after.attachmentDraft) : after.editAttachmentDrafts;
        check(() => assert.ok(files.some(file => file.path === '/isolated/pending.txt')));
      }
      if (outcome === 'pending-details') {
        check(() => assert.deepEqual(after.references, [73]));
        check(() => assert.equal(after.metadata.regression, 'changed-while-saving'));
      }
      await page.screenshot({ path: path.join(OUT, `${mode}-${outcome}-${surface}-retained.png`) });
      // Explicit second manual send: create remains create, edit retains its original id.
      behavior = 'success';
      await send(page);
      record.manuallyResent = await snapshot(page);
      check(() => assert.equal(writes.length, 2));
      check(() => assert.equal(writes[1].content.trim(), input));
      check(() => assert.equal(notes.size, mode === 'create' ? 2 : 1));
      if (mode === 'edit') check(() => assert.equal(writes[1].id, 42));
    } else if (!succeeds) {
      check(() => assert.equal(after.editorValue.trim(), input));
      check(() => assert.equal(after.onSended, 0));
      check(() => assert.equal(after.files[0]?.path, '/isolated/draft.txt'));
      check(() => assert.deepEqual(after.metadata, { regression: 'preserve' }));
      if (surface === 'dialog') check(() => assert.equal(after.dialogOpen, true));
      check(() => assert.equal(writes.length, 0));
      if (mode === 'create') {
        check(() => assert.equal(JSON.parse(after.contentDraft).content.trim(), input));
        check(() => assert.ok(after.attachmentDraft.includes('/isolated/draft.txt')));
      } else {
        check(() => assert.equal(after.editDrafts.find(note => note.id === 42)?.content.trim(), input));
        check(() => assert.equal(after.editAttachmentDrafts.filter(file => file.id === 42).length, 2));
      }
      await page.screenshot({ path: path.join(OUT, `${mode}-${outcome}-${surface}-retained.png`) });
      record.failedPhaseRequests = requests.slice();
      // Retry the same visible editor without reloading or replacing application logic.
      behavior = 'success';
      await context.setOffline(false);
      await page.waitForFunction(() => window.__test.base.isOnline && navigator.onLine);
      await send(page);
      record.retried = await snapshot(page);
      check(() => assert.equal(writes.length, 1));
      check(() => assert.equal(writes[0]?.content.trim(), input));
    } else if (outcome === 'offline') {
      check(() => assert.equal(requests.length, 0));
      check(() => assert.equal(writes.length, 0));
      check(() => assert.equal(after.offlineNotes.length, 1));
      check(() => assert.equal(after.offlineNotes[0].content.trim(), input));
      check(() => assert.equal(after.offlineNotes[0].pendingSync, true));
      check(() => assert.ok(after.offlineStorage.includes(input)));
      check(() => assert.equal(after.offlineNotes[0].attachments[0]?.path, '/isolated/draft.txt'));
    } else {
      check(() => assert.equal(writes.length, 1));
    }
    const final = record.manuallyResent || record.retried || after;
    check(() => assert.equal(final.onSended, 1));
    if (surface === 'dialog') check(() => assert.equal(final.dialogOpen, false));
    else {
      check(() => assert.equal(final.editorValue.trim(), ''));
      check(() => assert.deepEqual(final.files, []));
    }
    if (mode === 'create') {
      check(() => assert.equal(final.contentDraft, null));
      check(() => assert.equal(final.attachmentDraft, null));
      check(() => assert.equal(final.noteContent, ''));
      check(() => assert.equal(final.createContentValue.content, ''));
    } else {
      check(() => assert.ok(!final.editDrafts.some(note => note.id === 42)));
      check(() => assert.ok(!final.editAttachmentDrafts.some(file => file.id === 42)));
    }
    check(() => assert.equal(final.editDrafts.find(note => note.id === 99)?.content, 'unrelated-draft'));
    check(() => assert.equal(final.editAttachmentDrafts.filter(file => file.id === 99).length, 1));
    check(() => assert.deepEqual(pageErrors, []));
    check(() => assert.equal(uploads, outcome === 'pending-file' ? 2 : 1));
  } catch (error) {
    record.failures.push(String(error.stack || error));
    try { record.atError = await snapshot(page); } catch { /* failed before render */ }
    await page.screenshot({ path: path.join(OUT, `${mode}-${outcome}-${surface}-error.png`) }).catch(() => {});
    fs.writeFileSync(path.join(OUT, `${mode}-${outcome}-${surface}-error.html`), await page.content());
  } finally {
    Object.assign(record, { requests: requests.slice(), writes: writes.slice(), notes: [...notes.values()], uploads });
    results.push(record);
    console.log(`${record.failures.length ? 'FAIL' : 'PASS'} ${record.case}: writes=${writes.length}, requests=${requests.length}`);
    if (record.failures.length) console.log(record.failures.join('\n'));
    releaseSave();
    await context.close();
  }
}

const vite = await createServer({
  configFile: false, root: DIR, cacheDir: path.join(OUT, '.vite-cache'),
  plugins: [fixtures(), react()],
  resolve: { alias: { '@': path.join(REPO, 'app/src'), '@shared': path.join(REPO, 'shared') } },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [REPO, OUT] } }, logLevel: 'error',
});
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const surface of ['inline', 'dialog']) for (const mode of ['create', 'edit']) {
    for (const outcome of ['network', '502', 'success', 'offline', 'pending-text', 'pending-file', 'pending-details']) {
      if (process.env.ONLY && !`${mode}/${outcome}/${surface}`.includes(process.env.ONLY)) continue;
      await runCase(browser, origin, mode, outcome, surface);
    }
  }
} finally {
  await browser?.close();
  await vite.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ baseline: process.env.EDITOR_BASELINE || null, results }, null, 2));
  console.log(`Artifacts: ${OUT}`);
}
if (!results.length || results.some(result => result.failures.length)) process.exitCode = 1;
