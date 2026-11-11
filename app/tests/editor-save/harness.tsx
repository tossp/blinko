import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { RootStore } from '../../src/store';
import { BlinkoStore } from '../../src/store/blinkoStore';
import { BaseStore } from '../../src/store/baseStore';
import { BlinkoEditor } from '../../src/components/BlinkoEditor';
import { ShowEditBlinkoModel } from '../../src/components/BlinkoRightClickMenu';
import { DialogStore } from '../../src/store/module/Dialog';
import DialogProvider from '../../src/store/module/Dialog/Provider';
import { eventBus } from '../../src/lib/event';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'edit' ? 'edit' : 'create';
const inDialog = params.get('dialog') === 'true';
const blinko = RootStore.Get(BlinkoStore);
const base = RootStore.Get(BaseStore);
const dialog = RootStore.Get(DialogStore);

// Deliberately different draft indexes and multiple attachments for one note.
blinko.editContentStorage.push({ id: 99, content: 'unrelated-draft' });
blinko.editAttachmentsStorage.push({ id: 42, name: 'old.txt', path: '/old.txt', type: 'text/plain', size: 3 });
blinko.editAttachmentsStorage.push({ id: 99, name: 'other.txt', path: '/other.txt', type: 'text/plain', size: 5 });
if (mode === 'edit') {
  blinko.curSelectedNote = {
    id: 42, content: 'server-original', attachments: [], references: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as any;
}

const state = {
  blinko, base, dialog, onSended: 0, upsertReturns: [] as any[],
  clearEvents: 0, draftOperations: [] as { key: string; value: string | null }[],
  getEditor() {
    return Array.from(document.querySelectorAll('*'))
      .map((element: any) => element.__storeInstance)
      .find((store: any) => store?.handleSend && store?.vditor);
  },
};
(window as any).__test = state;
eventBus.on('editor:clear', () => { state.clearEvents++; });
for (const method of ['setItem', 'removeItem'] as const) {
  const original = Storage.prototype[method];
  Storage.prototype[method] = function (key: string, value?: string) {
    if (['createModeNote', 'createModeAttachments', 'editModeNotes', 'editModeAttachments'].includes(key)) {
      state.draftOperations.push({ key, value: method === 'removeItem' ? null : value! });
    }
    return original.call(this, key, value!);
  };
}

// Transparent observers: no replacement of application save/upload/storage logic.
const realCall = blinko.upsertNote.call;
blinko.upsertNote.call = async function (...args: Parameters<typeof realCall>) {
  try {
    const result = await realCall.apply(this, args);
    state.upsertReturns.push(result === undefined ? { type: 'undefined' } : { type: 'value', value: result });
    return result;
  } catch (error) {
    state.upsertReturns.push({ type: 'throw' });
    throw error;
  }
};
const realClose = dialog.close;
dialog.close = function () {
  state.onSended++;
  return realClose.apply(this);
};

function Harness() {
  // Real application's online/offline event handling, not a manually assigned flag.
  base.useInitApp();
  return inDialog ? <>
    <button onClick={() => ShowEditBlinkoModel('2xl', mode)}>Open editor</button>
    <DialogProvider />
  </> : <BlinkoEditor mode={mode} onSended={() => { state.onSended++; }} />;
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="light">
    <MemoryRouter initialEntries={['/']}><Harness /></MemoryRouter>
  </ThemeProvider>
);
