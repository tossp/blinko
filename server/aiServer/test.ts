import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Like test:security, isolate process-wide Bun module mocks. Never include the
// opt-in MiniMax paid-endpoint integration suite in local upgrade regressions.
const cwd = fileURLToPath(new URL('..', import.meta.url));
for (const suite of [
  'providers/__tests__/litellm-provider.test.ts',
  'providers/__tests__/minimax-provider.test.ts',
  'providers/__tests__/sdk7-transport.test.ts',
  'providers/__tests__/mastra-model.test.ts',
  'providers/__tests__/public-types.test.ts',
  'providers/__tests__/tool-context.test.ts',
  'providers/__tests__/scheduled-job.test.ts',
  'providers/__tests__/file-content.test.ts',
  'providers/__tests__/vector-storage.test.ts',
  'mcp/__tests__/bridge.test.ts',
]) {
  const result = Bun.spawnSync([process.execPath, 'test', path.join('aiServer', suite)], {
    cwd, stdout: 'inherit', stderr: 'inherit',
  });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}
