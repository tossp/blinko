import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { RootStore } from "../../src/store";
import { AiSettingStore } from "../../src/store/aiSettingStore";
import { DialogStore } from "../../src/store/module/Dialog";
import DialogProvider from "../../src/store/module/Dialog/Provider";
import ModelDialogContent from "../../src/components/BlinkoSettings/AiSetting/ModelDialogContent";
import i18n from "../../src/lib/i18n";
import "../../src/styles/globals.css";

await i18n.changeLanguage("en");
await RootStore.Get(AiSettingStore).aiProviders.call();
const params = new URLSearchParams(location.search);
const dialog = RootStore.Get(DialogStore);
function Harness() {
  return (
    <>
      <button
        onClick={() =>
          dialog.setData({
            isOpen: true,
            title: "Add Model to Fixture Provider",
            size: "2xl",
            content: (
              <ModelDialogContent
                model={{
                  id: params.has("edit") ? 42 : 0,
                  providerId: 1,
                  title: params.has("edit") ? "Existing model" : "",
                  modelKey: params.has("edit") ? "model-alpha" : "",
                  capabilities: {
                    inference: true,
                    tools: false,
                    image: false,
                    imageGeneration: false,
                    video: false,
                    audio: false,
                    embedding: false,
                    rerank: false,
                  },
                  sortOrder: 0,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }}
              />
            ),
          })
        }
      >
        Open model dialog
      </button>
      <DialogProvider />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light">
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  </ThemeProvider>,
);
