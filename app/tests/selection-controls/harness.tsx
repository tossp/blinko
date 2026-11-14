import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Analytics from "../../src/pages/analytics";
import FilterPop from "../../src/components/Common/PopoverFloat/filterPop";
import { ExportSetting } from "../../src/components/BlinkoSettings/ExportSetting";
import { AiPostProcessingSection } from "../../src/components/BlinkoSettings/AiSetting/AiPostProcessingSection";
import { DefaultModelsSection } from "../../src/components/BlinkoSettings/AiSetting/DefaultModelsSection";
import { TextSelectionToolbarSettings } from "../../src/components/BlinkoSettings/TextSelectionToolbarSettings";
import { createHotkeyFixture } from "./hotkey.fixtures";
import { RootStore } from "../../src/store";
import { BlinkoStore } from "../../src/store/blinkoStore";
import i18n from "../../src/lib/i18n";
import "../../src/styles/globals.css";

await i18n.changeLanguage("en");
const mode = new URLSearchParams(location.search).get("mode");
if (mode === "filter") await RootStore.Get(BlinkoStore).tagList.call();
function HotkeyHarness() {
  const [config, setConfig] = React.useState(createHotkeyFixture);
  const [saved, setSaved] = React.useState({});
  return (
    <>
      <TextSelectionToolbarSettings
        config={config.textSelectionToolbar}
        onSave={async (next) => {
          setSaved(next);
          setConfig((previous) => ({ ...previous, ...next }));
        }}
      />
      <output data-testid="hotkey-saved">{JSON.stringify(saved)}</output>
      <output data-testid="hotkey-current">{JSON.stringify(config)}</output>
    </>
  );
}

const surfaces: Record<string, React.ReactNode> = {
  hotkeys: <HotkeyHarness />,
  analytics: <Analytics />,
  filter: <FilterPop />,
  export: <ExportSetting />,
  postprocessing: <AiPostProcessingSection />,
  defaults: <DefaultModelsSection />,
};

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light">
    <MemoryRouter>
      <main>{surfaces[mode || "analytics"]}</main>
    </MemoryRouter>
  </ThemeProvider>,
);
