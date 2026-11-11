import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { FullscreenEditor } from '../../src/components/BlinkoCard/FullscreenEditor';
import { BlinkoEditor } from '../../src/components/BlinkoEditor';
import { LoadingAndEmpty } from '../../src/components/Common/LoadingAndEmpty';
import { RootStore } from '../../src/store';
import { BlinkoStore } from '../../src/store/blinkoStore';
import { eventBus } from '../../src/lib/event';
import '../../src/styles/globals.css';

const params = new URLSearchParams(location.search);
const surface = params.get('surface') || 'loader';
const content = Array.from({ length: 180 }, (_, i) => `Paragraph ${i + 1}: **long Markdown** for real application scrolling.`).join('\n\n');
const note = {
  id: 42, content, attachments: [], references: [], referencedBy: [], tags: [],
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const blinko = RootStore.Get(BlinkoStore);
blinko.curSelectedNote = note as any;

const state = {
  note,
  getEditor() {
    return Array.from(document.querySelectorAll('*'))
      .map((element: any) => element.__storeInstance)
      .find((store: any) => store?.handleSend && store?.vditor);
  },
  setViewMode(mode: string) { eventBus.emit('editor:setViewMode', mode); },
};
(window as any).__layout = state;
document.documentElement.style.setProperty('--doc-height', '100vh');

function Loader() {
  const [props, setProps] = useState({ isLoading: false, isEmpty: false, isAbsolute: true, emptyMessage: '' });
  (window as any).renderLoader = (next: typeof props) => flushSync(() => setProps(next));
  return <div id="loader" className="relative w-full" style={{ height: 300 }}>
    <LoadingAndEmpty {...props} className="fixture-class" />
  </div>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="light">
    <MemoryRouter>
      {surface === 'loader' ? <Loader /> : surface === 'fullscreen'
        ? <FullscreenEditor blinkoItem={note as any} isOpen={true} onClose={() => {}} />
        : <BlinkoEditor mode="edit" />}
    </MemoryRouter>
  </ThemeProvider>
);
