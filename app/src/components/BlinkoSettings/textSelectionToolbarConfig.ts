import {
  DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG,
  type TextSelectionToolbarConfig,
} from "@/../../shared/lib/types";

export function updateTextSelectionToolbarConfig(
  current: Partial<TextSelectionToolbarConfig> | undefined,
  changes: Partial<TextSelectionToolbarConfig>,
): TextSelectionToolbarConfig {
  return {
    ...DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG,
    ...current,
    ...changes,
  };
}
