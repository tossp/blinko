// Run with Node and an existing Playwright installation. All API calls use fixtures.
// SELECTION_BASELINE=HEAD checks that the same cases expose the original bugs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createFixtures } from "./fixtures.mjs";
import { cases } from "./cases.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../../..");
const OUT = fs.mkdtempSync(
  path.join(os.tmpdir(), "blinko-selection-controls-"),
);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseline = process.env.SELECTION_BASELINE;
const originals = new Set([
  "app/src/pages/analytics.tsx",
  "app/src/components/Common/PopoverFloat/filterPop.tsx",
  "app/src/components/BlinkoSettings/ExportSetting.tsx",
  "app/src/components/BlinkoSettings/AiSetting/AiPostProcessingSection.tsx",
]);
const expectedFailures = new Set([
  "analytics",
  "filter-all",
  "filter-without-tags",
  "keyboard-export",
  "keyboard-postprocessing",
]);
const fixtures = createFixtures();
const result = { baseline: baseline || null, cases: [], errors: [] };
const vite = await createServer({
  configFile: false,
  root: DIR,
  publicDir: path.join(REPO, "app/public"),
  cacheDir: path.join(OUT, ".vite"),
  plugins: [
    {
      name: "isolated-selection-fixtures",
      enforce: "pre",
      load(id) {
        const source = path.relative(REPO, id.split("?")[0]);
        if (baseline && originals.has(source)) {
          return execFileSync("git", ["show", `${baseline}:${source}`], {
            cwd: REPO,
            encoding: "utf8",
          });
        }
      },
      configureServer(server) {
        server.middlewares.use("/api/trpc", fixtures.middleware);
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.join(REPO, "app/src"),
      "@shared": path.join(REPO, "shared"),
    },
  },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [REPO, OUT] } },
  logLevel: "error",
});
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const selected = process.env.SELECTION_CASES?.split(",");
  for (const test of cases.filter(
    (c) => !selected || selected.includes(c.name),
  )) {
    fixtures.reset();
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1100 },
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error.stack || error)));
    const record = { name: test.name, passed: false };
    try {
      await page.goto(`${origin}/?mode=${test.mode}`);
      await test.run(page, fixtures.state);
      assert.deepEqual(errors, []);
      assert.deepEqual(fixtures.state.unexpected, []);
      record.passed = true;
      await page.screenshot({ path: path.join(OUT, `${test.name}.png`) });
    } catch (error) {
      record.error = String(error.stack || error);
      record.assertionFailure = error.code === "ERR_ASSERTION";
      await page.screenshot({
        path: path.join(OUT, `${test.name}-failed.png`),
      });
    } finally {
      record.calls = [...fixtures.state.calls];
      result.cases.push(record);
      result.errors.push(...errors);
      await context.close();
    }
    const expected = baseline && expectedFailures.has(test.name);
    const ok = expected
      ? !record.passed && record.assertionFailure
      : record.passed;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${test.name}${expected ? ": original regression reproduced" : ""}`,
    );
    if (!ok)
      result.errors.push(
        `${test.name}: ${record.error || "expected original regression was not reproduced"}`,
      );
  }
  assert.ok(result.cases.length > 0);
  assert.deepEqual(result.errors, []);
  result.passed = true;
} finally {
  await browser?.close();
  await vite.close();
  fs.writeFileSync(
    path.join(OUT, "results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(`Artifacts: ${OUT}`);
}
