// Real AI page/input and application CSS; fixtures stay on loopback, no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'blinko-ai-input-'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.AI_INPUT_BASELINE;
const source = 'app/src/components/BlinkoAi/aiInput.tsx';
const result = { baseline: baseline || null, cases: [], errors: [], requests: [] };
const vite = await createServer({
  configFile: false, root: DIR, cacheDir: path.join(OUT, '.vite'),
  publicDir: path.join(REPO, 'app/public'),
  plugins: [{
    name: 'ai-input-fixtures', enforce: 'pre',
    load(id) {
      if (baseline && path.relative(REPO, id.split('?')[0]) === source) {
        return execFileSync('git', ['show', `${baseline}:${source}`], { cwd: REPO, encoding: 'utf8' });
      }
    },
    configureServer(server) {
      server.middlewares.use('/api/trpc', async (req, res) => {
        for await (const _ of req) { /* drain fixture requests */ }
        const url = new URL(req.originalUrl || req.url, 'http://localhost');
        const names = url.pathname.split('/').at(-1).split(',');
        const values = names.map(name => {
          result.requests.push({ name, method: req.method });
          if (req.method !== 'GET') result.errors.push(`Unexpected mutation: ${name}`);
          let json;
          if (name === 'config.list') json = {};
          else if (name === 'conversation.detail') json = { id: 1, messages: [] };
          else if (['notes.list', 'tags.list', 'ai.getAllProviders', 'ai.getAllModels'].includes(name)) json = [];
          else { result.errors.push(`Unexpected API: ${name}`); json = null; }
          return { result: { data: { json } } };
        });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(url.searchParams.has('batch') ? values : values[0]));
      });
    },
  }, react(), tailwindcss()],
  resolve: { alias: { '@': path.join(REPO, 'app/src'), '@shared': path.join(REPO, 'shared') } },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [REPO, OUT] } }, logLevel: 'error',
});

async function measure(input) {
  return input.evaluate(element => {
    const field = element.parentElement;
    const available = field.parentElement;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height, fieldWidth: field.getBoundingClientRect().width,
      availableWidth: available.getBoundingClientRect().width,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth,
      borderWidth: style.borderWidth, boxShadow: style.boxShadow, overflowY: style.overflowY,
      rows: element.rows, lineHeight: style.lineHeight,
    };
  });
}
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const viewport of [{ width: 1920, height: 985 }, { width: 3497, height: 1600 }, { width: 390, height: 844 }]) {
    for (const mode of ['card', 'inline']) {
      const context = await browser.newContext({ viewport });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => result.errors.push(String(error.stack || error)));
      const record = { viewport, mode };
      result.cases.push(record);
      try {
        // Measure the actual page with its actual responsive container and autofocus.
        await page.goto(`${origin}/?surface=page&mode=${mode}`);
        const input = page.getByRole('textbox');
        await input.waitFor();
        await page.waitForTimeout(700);
        record.page = await measure(input);
        await page.screenshot({ path: path.join(OUT, `${viewport.width}-${mode}.png`) });
        if (baseline) {
          assert.ok(record.page.width < record.page.availableWidth * 0.85, 'baseline reproduces narrow input');
          continue;
        }
        assert.ok(record.page.width >= record.page.availableWidth * 0.95, 'input fills available width');
        assert.equal(record.page.borderWidth, '0px');
        assert.equal(record.page.outlineStyle, 'none');
        assert.equal(record.page.boxShadow, 'none');
        assert.ok(record.page.height <= (mode === 'card' ? 170 : 90), 'empty input stays compact');
        // Exercise the actual AiInput handlers through its supported onSubmit prop.
        await page.goto(`${origin}/?mode=${mode}`);
        const isolated = page.getByRole('textbox');
        await isolated.waitFor();
        await page.waitForTimeout(400);
        await isolated.fill('First line');
        await isolated.press('Shift+Enter');
        await isolated.pressSequentially('Second line');
        assert.equal(await isolated.inputValue(), 'First line\nSecond line');
        assert.equal(await page.evaluate(() => window.__aiInput.submissions.length), 0);
        await isolated.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.__aiInput.submissions), ['First line\nSecond line']);
        await isolated.fill('IME composition');
        await isolated.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
        assert.equal(await page.evaluate(() => window.__aiInput.submissions.length), 1);
        await isolated.fill(Array.from({ length: 65 }, (_, i) => `Line ${i + 1}`).join('\n'));
        record.long = await measure(isolated);
        assert.ok(record.long.height > record.page.height, 'input grows for multiline content');
        assert.equal(record.long.overflowY, 'auto');
        assert.ok(record.long.scrollHeight > record.long.clientHeight, 'content beyond row limit scrolls');
        await isolated.fill('');
        record.cleared = await measure(isolated);
        assert.ok(record.cleared.height <= (mode === 'card' ? 170 : 90), 'clearing restores compact input');
        console.log(`PASS ${viewport.width}/${mode}: full width, no nested frame, autosize, keyboard and IME`);
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(result.errors, []);
  result.passed = true;
} finally {
  await browser?.close();
  await vite.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(result, null, 2));
  console.log(`Artifacts: ${OUT}`);
}
