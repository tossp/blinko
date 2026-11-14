import { describe, expect, test } from "bun:test";
import { DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG } from "../../../shared/lib/types";
import { updateTextSelectionToolbarConfig } from "../../src/components/BlinkoSettings/textSelectionToolbarConfig";
import { createHotkeyFixture, HOTKEY_TOOLBAR_CHANGES } from "./hotkey.fixtures";

describe("text selection toolbar config updates used by all four controls", () => {
  for (const { field, value } of HOTKEY_TOOLBAR_CHANGES) {
    test(`${field}: preserves every other customized field and feature`, () => {
      const hotkeys = createHotkeyFixture();
      const original = structuredClone(hotkeys);
      const defaults = structuredClone(DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG);
      Object.freeze(hotkeys.textSelectionToolbar.features);
      Object.freeze(hotkeys.textSelectionToolbar);
      const toolbar = updateTextSelectionToolbarConfig(
        hotkeys.textSelectionToolbar,
        { [field]: value },
      );
      const saved = { ...hotkeys, textSelectionToolbar: toolbar };

      expect(saved).toEqual({
        ...original,
        textSelectionToolbar: {
          ...original.textSelectionToolbar,
          [field]: value,
        },
      });
      expect(hotkeys).toEqual(original);
      expect(DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG).toEqual(defaults);
      expect(toolbar).not.toBe(hotkeys.textSelectionToolbar);
      expect(toolbar.features).toBe(hotkeys.textSelectionToolbar.features);
    });

    test(`${field}: fills defaults when no toolbar config was saved`, () => {
      expect(
        updateTextSelectionToolbarConfig(undefined, { [field]: value }),
      ).toEqual({
        ...DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG,
        [field]: value,
      });
    });

    test(`${field}: fills missing properties without replacing saved ones`, () => {
      const partial = { enabled: false, translationFromLang: "ja" };
      expect(
        updateTextSelectionToolbarConfig(partial, { [field]: value }),
      ).toEqual({
        ...DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG,
        ...partial,
        [field]: value,
      });
    });
  }

  test("sequential saves retain all earlier changes and unrelated hotkeys", () => {
    const original = createHotkeyFixture();
    let saved = original;
    for (const { field, value } of HOTKEY_TOOLBAR_CHANGES) {
      saved = {
        ...saved,
        textSelectionToolbar: updateTextSelectionToolbarConfig(
          saved.textSelectionToolbar,
          { [field]: value },
        ),
      };
    }
    expect(saved).toEqual({
      ...original,
      textSelectionToolbar: {
        enabled: true,
        triggerModifier: "shift",
        translationFromLang: "de",
        translationToLang: "fr",
        features: original.textSelectionToolbar.features,
      },
    });
  });
});
