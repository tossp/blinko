import { ListBox, Select, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG,
  type HotkeyConfig,
  type TextSelectionToolbarConfig,
} from "@/../../shared/lib/types";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { Item, ItemWithTooltip } from "./Item";
import { updateTextSelectionToolbarConfig } from "./textSelectionToolbarConfig";

interface TextSelectionToolbarSettingsProps {
  config: HotkeyConfig["textSelectionToolbar"] | undefined;
  onSave: (config: Partial<HotkeyConfig>) => Promise<void>;
}

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "es", label: "Spanish" },
];
const SOURCE_LANGUAGES = [{ id: "auto", label: "Auto" }, ...LANGUAGES];
const MODIFIERS = [
  { id: "ctrl", label: "Ctrl + `" },
  { id: "shift", label: "Shift + `" },
  { id: "alt", label: "Alt + `" },
];

export function TextSelectionToolbarSettings({
  config,
  onSave,
}: TextSelectionToolbarSettingsProps) {
  const { t } = useTranslation();
  const current = { ...DEFAULT_TEXT_SELECTION_TOOLBAR_CONFIG, ...config };
  const save = (changes: Partial<TextSelectionToolbarConfig>) =>
    onSave({
      textSelectionToolbar: updateTextSelectionToolbarConfig(config, changes),
    });

  return (
    <CollapsibleCard
      icon="material-symbols:select-all"
      title={t("text-selection-toolbar")}
      className="w-full my-6"
    >
      <div className="flex flex-col gap-4">
        <Item
          leftContent={
            <ItemWithTooltip
              content="Enable Text Selection Toolbar"
              toolTipContent="Show toolbar when text is selected globally on desktop"
            />
          }
          rightContent={
            <Switch
              aria-label="Enable Text Selection Toolbar"
              isSelected={current.enabled}
              onChange={(enabled) => save({ enabled })}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          }
        />
        <Item
          leftContent={t("trigger-modifier")}
          rightContent={
            <Select
              aria-label={t("trigger-modifier")}
              className="w-32"
              value={current.triggerModifier}
              onChange={(value) =>
                save({
                  triggerModifier:
                    value as TextSelectionToolbarConfig["triggerModifier"],
                })
              }
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {MODIFIERS.map(({ id, label }) => (
                    <ListBox.Item key={id} id={id} textValue={label}>
                      {label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          }
          type="col"
        />
        <Item
          leftContent={t("translation-languages")}
          rightContent={
            <div className="flex gap-2">
              <Select
                aria-label="Translation source language"
                className="w-24"
                value={current.translationFromLang}
                onChange={(value) =>
                  save({ translationFromLang: value as string })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {SOURCE_LANGUAGES.map(({ id, label }) => (
                      <ListBox.Item key={id} id={id} textValue={label}>
                        {label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <span className="text-sm text-gray-500 self-center">→</span>
              <Select
                aria-label="Translation target language"
                className="w-24"
                value={current.translationToLang}
                onChange={(value) =>
                  save({ translationToLang: value as string })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {LANGUAGES.map(({ id, label }) => (
                      <ListBox.Item key={id} id={id} textValue={label}>
                        {label}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          }
          type="col"
        />
      </div>
    </CollapsibleCard>
  );
}
