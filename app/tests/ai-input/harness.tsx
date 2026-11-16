import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import AIPage from '../../src/pages/ai';
import { AiInput } from '../../src/components/BlinkoAi/aiInput';
import { RootStore } from '../../src/store';
import { AiStore } from '../../src/store/aiStore';
import i18n from '../../src/lib/i18n';
import '../../src/styles/globals.css';

await i18n.changeLanguage('en');
const params = new URLSearchParams(location.search);
const ai = RootStore.Get(AiStore);
ai.isChatting = params.get('mode') === 'inline';
const submissions: string[] = [];
(window as any).__aiInput = { ai, submissions };
document.documentElement.style.setProperty('--doc-height', '100vh');

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="light">
    <MemoryRouter>
      <main style={{ height: '100vh', width: '100%', display: 'flex', justifyContent: 'center' }}>
        {params.get('surface') === 'page' ? <AIPage /> : (
          <div style={{ width: '90%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AiInput onSubmit={(value) => submissions.push(value)} />
          </div>
        )}
      </main>
    </MemoryRouter>
  </ThemeProvider>,
);
