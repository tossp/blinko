import { expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

it('emits the exact streaming wire union without private Mastra SDK references', () => {
  const directory = mkdtempSync(join(tmpdir(), 'blinko-ai-public-types-'));
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  try {
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(join(directory, 'wire.ts'), readFileSync(new URL('../../streamProtocol.ts', import.meta.url)));
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        declaration: true, emitDeclarationOnly: true, noEmitOnError: true,
        outDir: './out', strict: true, skipLibCheck: true,
        module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2024', types: ['node'],
      },
      files: ['./wire.ts'],
    }));
    const result = spawnSync('node', [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(directory, 'tsconfig.json'), '--pretty', 'false'], { encoding: 'utf8', timeout: 30_000 });
    expect({ status: result.status, output: result.stdout + result.stderr, error: result.error?.message }).toEqual({ status: 0, output: '', error: undefined });
    const declaration = readFileSync(join(directory, 'out/wire.d.ts'), 'utf8');
    expect(declaration).toContain('export type LegacyAiChunk');
    expect(declaration).toContain('AsyncGenerator<LegacyAiChunk, void, unknown>');
    expect(declaration).not.toContain('/_types/');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 40_000);
