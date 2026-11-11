// Node 26.13; same PLAYWRIGHT_MODULE/CHROMIUM_PATH interface as editor-save/run.mjs.
// Real application components/CSS, loopback fixtures only; never sends notes or calls models.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, '../../..');
const OUT = process.env.LAYOUT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'blinko-frontend-layout-'));
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.LAYOUT_BASELINE;
const comparison = process.env.LAYOUT_COMPARE ? JSON.parse(fs.readFileSync(process.env.LAYOUT_COMPARE, 'utf8')) : null;
const result = {
  baseline: baseline || null,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
  versions: Object.fromEntries(['react', 'react-dom', 'vditor'].map(name => [name, require(`${name}/package.json`).version])),
  network: 'new browser/context; loopback only; no mutations or model calls',
  loader: {}, editors: [], errors: [], external: [], mutations: [],
};
const changedSources = ['app/src/components/Common/LoadingAndEmpty.tsx', 'app/src/styles/vditor.css'];
function fixtures() {
  return {
    name: 'frontend-layout-fixtures', enforce: 'pre',
    load(id) {
      const relative = path.relative(REPO, id.split('?')[0]);
      if (baseline && changedSources.includes(relative)) {
        return execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: REPO, encoding: 'utf8' });
      }
    },
    configureServer(server) {
      server.middlewares.use('/dist/js/', (req, res) => {
        const asset = path.join(REPO, 'node_modules/vditor/dist/js', new URL(req.url, 'http://localhost').pathname);
        if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('content-type', asset.endsWith('.css') ? 'text/css' : 'application/javascript');
        fs.createReadStream(asset).pipe(res);
      });
      server.middlewares.use('/api/trpc', async (req, res) => {
        for await (const _ of req) { /* drain request */ }
        const url = new URL(req.originalUrl || req.url, 'http://localhost');
        const names = url.pathname.split('/').at(-1).split(',');
        const data = names.map(name => {
          if (name === 'notes.detail') return {
            id: 42,
            content: Array.from({ length: 180 }, (_, i) => `Paragraph ${i + 1}: **long Markdown** for real application scrolling.`).join('\n\n'),
            attachments: [], references: [], referencedBy: [], tags: [],
          };
          if (name.includes('upsert') || name.includes('upload')) result.mutations.push(name);
          return [];
        });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(data.map(json => ({ result: { data: { json } } }))));
      });
    },
  };
}

async function loaderSnapshot(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#loader > div');
    const svgs = [...host.querySelectorAll('svg')];
    const spinner = svgs.find(svg => svg.querySelector('animate[attributeName="r"]'));
    const empty = host.querySelector('.select-none');
    const rect = node => {
      if (!node) return null;
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      svgCount: svgs.length, spinner: !!spinner,
      animations: spinner?.querySelectorAll('animate').length || 0,
      indefinite: spinner ? [...spinner.querySelectorAll('animate')].every(node => node.getAttribute('repeatCount') === 'indefinite') : false,
      spinnerRect: rect(spinner), hostRect: rect(host), emptyRect: rect(empty),
      emptyPosition: empty ? getComputedStyle(empty).position : null,
      emptyText: empty?.textContent || '', className: host.className,
    };
  });
}

async function checkLoader(page, context) {
  await page.goto(`${origin}/?surface=loader`);
  await page.waitForFunction(() => window.renderLoader);
  await page.waitForTimeout(1200);
  result.loader.initial = await loaderSnapshot(page);
  assert.equal(result.loader.initial.spinner, !!baseline);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
  const sample = async () => {
    const before = await metrics();
    await page.waitForTimeout(3000);
    const after = await metrics();
    return { intervalMs: 3000, delta: Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'TaskDuration'].map(key => [key, after[key] - before[key]])) };
  };
  const checkIdle = ({ delta }) => {
    if (baseline) assert.ok(delta.LayoutCount > 30, 'baseline hidden SMIL still causes layout');
    else assert.equal(delta.LayoutCount, 0, 'settled nonloading component has no recurring layout');
  };
  result.loader.idle = [];
  for (let i = 0; i < 3; i++) {
    const measurement = await sample();
    result.loader.idle.push(measurement);
    checkIdle(measurement);
  }
  const states = [
    { isLoading: true, isEmpty: false, isAbsolute: true, emptyMessage: '' },
    { isLoading: true, isEmpty: true, isAbsolute: true, emptyMessage: 'Isolated empty message' },
    { isLoading: false, isEmpty: true, isAbsolute: true, emptyMessage: 'Isolated empty message' },
    { isLoading: false, isEmpty: true, isAbsolute: false, emptyMessage: 'Isolated empty message' },
    { isLoading: false, isEmpty: true, isAbsolute: true, emptyMessage: '' },
    { isLoading: false, isEmpty: false, isAbsolute: true, emptyMessage: '' },
  ];
  result.loader.states = [];
  for (const props of states) {
    await page.evaluate(props => window.renderLoader(props), props);
    await page.waitForTimeout(350);
    const snap = await loaderSnapshot(page);
    result.loader.states.push({ props, snap });
    assert.equal(snap.spinner, !!baseline || props.isLoading);
    assert.equal(snap.svgCount, (baseline || props.isLoading ? 1 : 0) + (props.isEmpty ? 1 : 0));
    if (props.isLoading) {
      assert.equal(snap.animations, 3);
      assert.equal(snap.indefinite, true);
      assert.equal(snap.spinnerRect.height, 30);
      if (!props.isEmpty) {
        result.loader.active = await sample();
        assert.ok(result.loader.active.delta.LayoutCount > 30, 'loading SMIL still runs');
        await page.screenshot({ path: path.join(OUT, 'loader-active.png') });
      }
    }
    assert.ok(snap.className.includes('fixture-class'));
    assert.equal(!!snap.emptyRect, props.isEmpty);
    if (props.isEmpty) {
      assert.equal(snap.emptyPosition, props.isAbsolute ? 'absolute' : 'static');
      if (props.emptyMessage) assert.equal(snap.emptyText, props.emptyMessage);
      else assert.ok(snap.emptyText.length > 0);
    }
  }
  if (comparison) {
    const closeRect = (actual, expected) => {
      assert.equal(!!actual, !!expected);
      if (actual) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) < 0.1, `${key}: ${actual[key]} vs ${expected[key]}`);
    };
    closeRect(result.loader.initial.hostRect, comparison.loader.initial.hostRect);
    result.loader.states.forEach(({ props, snap }, i) => {
      const old = comparison.loader.states[i].snap;
      closeRect(snap.hostRect, old.hostRect);
      closeRect(snap.emptyRect, old.emptyRect);
      if (props.isLoading) closeRect(snap.spinnerRect, old.spinnerRect);
    });
  }
  result.loader.afterTransition = await sample();
  checkIdle(result.loader.afterTransition);
  await page.screenshot({ path: path.join(OUT, 'loader-idle.png') });
  console.log('PASS loader: idle performance + six loading/empty/layout transitions');
}

async function dimensions(locator) {
  return locator.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      className: element.className, overflowY: style.overflowY, maxHeight: style.maxHeight,
      x, y, width, height, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  });
}
async function wheel(page, locator) {
  await locator.hover();
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(400);
}
async function checkEditor(browser, surface, mode) {
  const context = await isolatedContext(browser);
  try {
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error.stack || error)));
    await page.goto(`${origin}/?surface=${surface}`);
    if (surface === 'fullscreen') {
      // Actual application preview -> double click -> edit mode, not fabricated Vditor markup.
      await page.locator('.fixed p').first().dblclick();
    }
    await page.waitForFunction(() => window.__layout?.getEditor()?.vditor);
    await page.evaluate(mode => window.__layout.setViewMode(mode), mode);
    await page.waitForFunction(mode => {
      const editor = window.__layout.getEditor();
      return editor?.viewMode === mode && editor?.vditor?.getValue().includes('Paragraph 180:');
    }, mode);
    const selector = mode === 'raw' || mode === 'sv' ? '.vditor-sv' : `.vditor-${mode} .vditor-reset`;
    const target = page.locator(`#vditor-edit ${selector}`);
    await target.waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    const record = { surface, mode, before: await dimensions(target) };
    result.editors.push(record);
    assert.equal(await page.locator('#vditor-edit').evaluate(node => node.classList.contains('fullscreen-editor')), surface === 'fullscreen');
    await target.evaluate(node => { node.scrollTop = 0; });
    record.before.scrollTop = await target.evaluate(node => node.scrollTop);
    await wheel(page, target);
    record.after = await dimensions(target);
    const knownBroken = !!baseline && surface === 'fullscreen' && ['raw', 'sv'].includes(mode);
    assert.ok(record.before.scrollHeight > record.before.clientHeight, 'long document really overflows');
    assert.ok(record.before.height > (surface === 'fullscreen' ? 100 : 20), 'editor keeps its existing height');
    if (knownBroken) {
      assert.equal(record.after.overflowY, 'hidden');
      assert.equal(record.after.scrollTop, 0);
    } else {
      assert.equal(record.after.overflowY, 'auto');
      assert.ok(record.after.scrollTop > 0, 'actual wheel scrolls the editor');
    }
    const preview = page.locator('#vditor-edit .vditor-preview');
    record.previewVisible = await preview.isVisible();
    assert.equal(record.previewVisible, mode === 'sv');
    if (mode === 'sv') {
      record.previewBefore = await dimensions(preview);
      assert.ok(record.before.x + record.before.width <= record.previewBefore.x + 2, 'SV remains side by side');
      assert.ok(record.before.width > 100 && record.previewBefore.width > 100);
      const previewContent = preview.locator('.vditor-reset');
      record.previewContent = await dimensions(previewContent);
      await previewContent.evaluate(node => { node.scrollTop = 0; });
      await wheel(page, previewContent);
      record.previewAfter = await dimensions(previewContent);
      assert.ok(record.previewAfter.scrollTop > 0, 'SV preview wheel also scrolls');
    }
    if (surface === 'inline') assert.equal(record.after.maxHeight, '560px', 'nonfullscreen keeps 70vh cap');
    if (comparison) {
      const old = comparison.editors.find(item => item.surface === surface && item.mode === mode);
      for (const key of ['x', 'y', 'width', 'height', 'clientHeight', 'scrollHeight']) {
        assert.ok(Math.abs(record.before[key] - old.before[key]) < 0.1, `${surface}/${mode} ${key} layout unchanged`);
      }
      assert.equal(record.previewVisible, old.previewVisible);
    }
    assert.ok(await page.evaluate(() => window.__layout.getEditor().vditor.getValue().includes('Paragraph 180:')));
    await page.screenshot({ path: path.join(OUT, `${surface}-${mode}.png`) });
    console.log(`PASS ${surface}/${mode}: wheel ${record.before.scrollTop} -> ${record.after.scrollTop}${knownBroken ? ' (confirmed baseline bug)' : ''}`);
  } finally { await context.close(); }
}

async function isolatedContext(browser) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('blinko-editor-view-mode', 'raw'));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    result.external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  return context;
}
const vite = await createServer({
  configFile: false, root: DIR, cacheDir: path.join(OUT, '.vite-cache'),
  plugins: [fixtures(), react(), tailwindcss()],
  resolve: { alias: { '@': path.join(REPO, 'app/src'), '@shared': path.join(REPO, 'shared') } },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [REPO, OUT] } }, logLevel: 'error',
});
let browser;
let origin;
try {
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  result.browser = browser.version();
  const context = await isolatedContext(browser);
  try {
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error.stack || error)));
    await checkLoader(page, context);
  } finally { await context.close(); }
  for (const surface of ['fullscreen', 'inline']) for (const mode of ['raw', 'sv', 'ir', 'wysiwyg']) {
    await checkEditor(browser, surface, mode);
  }
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.mutations, []);
  result.passed = true;
} finally {
  await browser?.close();
  await vite.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(result, null, 2));
  console.log(`Artifacts: ${OUT}`);
}
