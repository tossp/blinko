// Uses the existing frontend browser-harness setup; API data stays on loopback.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH may point to an existing installation.
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

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../../..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "blinko-model-dialog-"));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseline = process.env.MODEL_DIALOG_BASELINE;
const result = {
  baseline: baseline || null,
  cases: [],
  errors: [],
  writes: [],
};
let providers;
let refreshed;
function resetFixtures() {
  refreshed = false;
  providers = [1, 2].map((id) => ({
    id,
    title: `Fixture Provider ${id}`,
    provider: "openai",
    baseURL: "",
    config: {
      models: [
        { id: "model-alpha", name: "Alpha Friendly Name" },
        { id: "model-beta", name: "Beta Friendly Name" },
      ],
    },
    models: [],
  }));
}
const vite = await createServer({
  configFile: false,
  root: DIR,
  publicDir: path.join(REPO, "app/public"),
  cacheDir: path.join(OUT, ".vite-cache"),
  plugins: [
    {
      name: "model-dialog-fixtures",
      enforce: "pre",
      load(id) {
        if (
          baseline &&
          path.relative(REPO, id.split("?")[0]) ===
            "app/src/components/BlinkoSettings/AiSetting/ModelDialogContent.tsx"
        ) {
          return execFileSync(
            "git",
            [
              "show",
              `${baseline}:app/src/components/BlinkoSettings/AiSetting/ModelDialogContent.tsx`,
            ],
            { cwd: REPO, encoding: "utf8" },
          );
        }
      },
      configureServer(server) {
        server.middlewares.use("/api/trpc", async (req, res) => {
          let body = "";
          for await (const chunk of req) body += chunk;
          const names = new URL(
            req.originalUrl || req.url,
            "http://localhost",
          ).pathname
            .split("/")
            .at(-1)
            .split(",");
          const inputs = body ? JSON.parse(body) : {};
          const data = names.map((name, i) => {
            if (name === "ai.getAllProviders") return providers;
            if (name === "ai.fetchProviderModels") {
              refreshed = true;
              providers
                .find((p) => p.id === inputs[i].json.providerId)
                .config.models.push({
                  id: "model-gamma",
                  name: "Gamma Friendly Name",
                });
              return [];
            }
            if (["ai.createModel", "ai.updateModel"].includes(name)) {
              result.writes.push({ name, input: inputs[i].json });
              return { id: 42, ...inputs[i].json };
            }
            if (name === "ai.getAllModels") return [];
            throw new Error(`Unexpected fixture API: ${name}`);
          });
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify(
              data.map((json) => ({ result: { data: { json } } })),
            ),
          );
        });
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
  for (const mode of baseline ? ["create"] : ["create", "edit", "manual"]) {
    resetFixtures();
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1000 },
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) =>
      result.errors.push(String(error.stack || error)),
    );
    try {
      await page.goto(`${origin}/${mode === "edit" ? "?edit" : ""}`);
      await page.getByRole("button", { name: "Open model dialog" }).click();
      const trigger = page.locator('[data-slot="select-trigger"]');
      const input = page.getByRole("combobox", { name: "Model", exact: true });
      const record = { mode, initialProvider: await trigger.innerText() };
      result.cases.push(record);
      await trigger.click();
      record.providerOptions = await page.getByRole("option").allTextContents();
      await page.getByRole("option", { name: /Fixture Provider 2/ }).click();
      record.selectedProvider = await trigger.innerText();
      await input.click();
      record.modelOptions = await page.getByRole("option").allTextContents();
      await page.getByRole("option", { name: /Alpha Friendly Name/ }).click();
      await page.getByRole("textbox").click();
      await page.getByRole("listbox").waitFor({ state: "hidden" });
      record.selectedModel = await input.inputValue();
      await page.screenshot({ path: path.join(OUT, `${mode}.png`) });
      if (baseline) {
        assert.ok(
          !record.selectedProvider.includes("Fixture Provider 2"),
          "baseline reproduces provider selection failure",
        );
        assert.notEqual(
          record.selectedModel,
          "model-alpha",
          "baseline reproduces model selection failure",
        );
        console.log(
          "PASS baseline: both selection failures reproduced",
          record,
        );
        continue;
      }
      assert.ok(record.initialProvider.includes("Fixture Provider 1"));
      assert.ok(record.selectedProvider.includes("Fixture Provider 2"));
      assert.equal(record.selectedModel, "model-alpha");
      // Selecting an already selected model and tabbing away must keep the API ID.
      await input.click();
      await page.getByRole("option", { name: /Alpha Friendly Name/ }).click();
      await input.press("Tab");
      assert.equal(await input.inputValue(), "model-alpha");
      // Keyboard selection updates the ID even when its display name differs.
      await input.fill("model-beta");
      await input.press("ArrowDown");
      await input.press("Enter");
      await input.press("Tab");
      assert.equal(await input.inputValue(), "model-beta");
      if (mode === "manual") {
        await input.fill("custom-model-id");
        await input.press("Tab");
        assert.equal(await input.inputValue(), "custom-model-id");
        await page.getByRole("textbox").fill("Custom model");
      } else {
        await Promise.all([
          page.waitForResponse((response) =>
            response.url().includes("ai.getAllProviders"),
          ),
          page.getByRole("button", { name: /obtain model list/i }).click(),
        ]);
        assert.ok(refreshed);
        await page.locator('[data-slot="combo-box-trigger"]').click();
        await page.getByRole("option", { name: /Gamma Friendly Name/ }).click();
        await input.press("Tab");
        assert.equal(await input.inputValue(), "model-gamma");
      }
      const writeCount = result.writes.length;
      await page
        .getByRole("button", {
          name: mode === "edit" ? /^update$/i : /^create$/i,
        })
        .click();
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
      );
      assert.equal(result.writes.length, writeCount + 1);
      const write = result.writes.at(-1);
      assert.equal(
        write.name,
        mode === "edit" ? "ai.updateModel" : "ai.createModel",
      );
      assert.equal(write.input.providerId, 2);
      assert.equal(
        write.input.modelKey,
        mode === "manual" ? "custom-model-id" : "model-gamma",
      );
      assert.equal(
        write.input.title,
        mode === "manual" ? "Custom model" : "Gamma Friendly Name",
      );
      console.log(
        `PASS ${mode}: provider/model selection, blur, keyboard, fixture save`,
      );
    } catch (error) {
      await page.screenshot({ path: path.join(OUT, `${mode}-failed.png`) });
      result.failure = await page
        .locator(
          '[data-slot="combo-box-popover"], [data-slot="modal-backdrop"]',
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            html: node.outerHTML.slice(0, 2500),
            zIndex: getComputedStyle(node).zIndex,
            pointerEvents: getComputedStyle(node).pointerEvents,
          })),
        );
      throw error;
    } finally {
      await context.close();
    }
  }
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
