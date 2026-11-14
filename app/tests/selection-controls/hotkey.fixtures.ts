import {
  DEFAULT_HOTKEY_CONFIG,
  type HotkeyConfig,
  type TextSelectionToolbarConfig,
} from "../../../shared/lib/types";

// Shared by the pure regression and the isolated browser harness.
export function createHotkeyFixture(): HotkeyConfig {
  return {
    ...DEFAULT_HOTKEY_CONFIG,
    quickNote: "Alt+Shift+B",
    quickAI: "F1",
    enabled: false,
    aiEnabled: false,
    textSelectionToolbar: {
      enabled: false,
      triggerModifier: "alt",
      translationFromLang: "ja",
      translationToLang: "en",
      features: { translation: false, copy: true, qna: false, bookmark: false },
    },
  };
}

export const HOTKEY_TOOLBAR_CHANGES = [
  { field: "enabled", value: true },
  { field: "triggerModifier", value: "shift" },
  { field: "translationFromLang", value: "de" },
  { field: "translationToLang", value: "fr" },
] as const satisfies ReadonlyArray<{
  field: keyof TextSelectionToolbarConfig;
  value: TextSelectionToolbarConfig[keyof TextSelectionToolbarConfig];
}>;
