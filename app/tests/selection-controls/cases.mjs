import assert from "node:assert/strict";

async function switchTagStatus(page, status) {
  await page.locator('[data-slot="select-trigger"]').click();
  await page.getByRole("option", { name: status, exact: true }).click();
}

export const cases = [
  {
    name: "hotkeys",
    mode: "hotkeys",
    async run(page) {
      const current = page.getByTestId("hotkey-current");
      const saved = page.getByTestId("hotkey-saved");
      await current.waitFor();
      const initial = JSON.parse(await current.textContent());
      let expected = initial;
      const changes = [
        {
          field: "translationFromLang",
          value: "de",
          index: 1,
          label: "German",
          typed: "g",
        },
        {
          field: "triggerModifier",
          value: "shift",
          index: 0,
          label: "Shift + `",
        },
        { field: "translationToLang", value: "fr", index: 2, label: "French" },
        { field: "enabled", value: true },
      ];
      for (const change of changes) {
        if (change.field === "enabled") {
          await page
            .getByRole("switch", { name: "Enable Text Selection Toolbar" })
            .press("Space");
        } else {
          await page
            .locator('[data-slot="select-trigger"]')
            .nth(change.index)
            .click();
          if (change.typed) {
            await page.keyboard.press("Home");
            await page.keyboard.press(change.typed);
            const focused = await page
              .getByRole("option")
              .evaluateAll((nodes) =>
                nodes
                  .filter((n) => n.hasAttribute("data-focused"))
                  .map((n) => n.textContent),
              );
            assert.deepEqual(focused, [change.label]);
            await page.keyboard.press("Enter");
          } else {
            await page
              .getByRole("option", { name: change.label, exact: true })
              .click();
          }
        }
        expected = {
          ...expected,
          textSelectionToolbar: {
            ...expected.textSelectionToolbar,
            [change.field]: change.value,
          },
        };
        assert.deepEqual(JSON.parse(await saved.textContent()), {
          textSelectionToolbar: expected.textSelectionToolbar,
        });
        assert.deepEqual(JSON.parse(await current.textContent()), expected);
      }
    },
  },
  {
    name: "analytics",
    mode: "analytics",
    async run(page, state) {
      const button = page.locator("main button").first();
      await button.waitFor();
      const month = (await button.innerText()).trim();
      // Clicking the already selected month must retain the mandatory selection.
      await button.click();
      await page
        .getByRole("menuitemradio", { name: month, exact: true })
        .click();
      await page.getByRole("menu").waitFor({ state: "hidden" });
      assert.equal((await button.innerText()).trim(), month);
      assert.ok(
        state.calls
          .filter((c) => c.name === "analytics.monthlyStats")
          .every((c) => /^\d{4}-\d{2}$/.test(c.input?.month)),
      );
      // A different month must still update the real analytics request.
      await button.click();
      const previous = page.getByRole("menuitemradio").nth(1);
      const previousMonth = (await previous.innerText()).trim();
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("analytics.monthlyStats")),
        previous.click(),
      ]);
      assert.equal((await button.innerText()).trim(), previousMonth);
      assert.equal(
        state.calls.filter((c) => c.name === "analytics.monthlyStats").at(-1)
          .input.month,
        previousMonth,
      );
    },
  },
  ...["All", "Without Tags", "With Tags"].map((status) => ({
    name: `filter-${status.toLowerCase().replaceAll(" ", "-")}`,
    mode: "filter",
    async run(page, state) {
      await page.locator("main button").first().click();
      await switchTagStatus(page, "With Tags");
      const tag = page.getByRole("combobox");
      await tag.click();
      await page
        .getByRole("option", { name: "Tag seven", exact: true })
        .click();
      await switchTagStatus(page, status === "With Tags" ? "All" : status);
      if (status === "With Tags") await switchTagStatus(page, "With Tags");
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("notes.list")),
        page.getByRole("button", { name: /Apply Filter/ }).click(),
      ]);
      const input = state.calls
        .filter((c) => c.name === "notes.list")
        .at(-1).input;
      assert.equal(input.tagId, status === "With Tags" ? 7 : null);
      assert.equal(input.withoutTag, status === "Without Tags");
    },
  })),
  ...[
    { name: "keyboard-export", mode: "export", typed: "c", target: "CSV" },
    {
      name: "keyboard-postprocessing",
      mode: "postprocessing",
      typed: "s",
      target: "Smart Edit",
    },
  ].map((test) => ({
    ...test,
    async run(page, state) {
      const trigger = page.locator('[data-slot="select-trigger"]');
      await trigger.waitFor();
      await trigger.click();
      await page.getByRole("option").first().waitFor();
      await page.keyboard.press("Home");
      await page.keyboard.press(test.typed);
      const names = await page
        .getByRole("option")
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => n.hasAttribute("data-focused"))
            .map((n) => n.textContent),
        );
      assert.deepEqual(names, [test.target]);
      await page.keyboard.press("Enter");
      await page.getByRole("listbox").waitFor({ state: "hidden" });
      assert.equal((await trigger.innerText()).trim(), test.target);
      if (test.mode === "postprocessing") {
        assert.equal(state.config.aiPostProcessingMode, "smartEdit");
      }
    },
  })),
  {
    name: "default-models",
    mode: "defaults",
    async run(page, state) {
      const triggers = page.locator('[data-slot="select-trigger"]');
      await triggers.nth(3).waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-slot="select-trigger"]')].every(
          (node) => node.textContent.includes("Fixture model 1"),
        ),
      );
      const fields = [
        "mainModelId",
        "embeddingModelId",
        "voiceModelId",
        "imageModelId",
      ];
      for (let index = 0; index < fields.length; index++) {
        await triggers.nth(index).click();
        await page.getByRole("option", { name: /Fixture model 2/ }).click();
        await page.waitForFunction(
          (i) =>
            document
              .querySelectorAll('[data-slot="select-trigger"]')
              [i]?.textContent.includes("Fixture model 2"),
          index,
        );
        assert.equal(state.config[fields[index]], 2);
      }
    },
  },
];
