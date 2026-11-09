import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdfFixture, docxFixture } from './fixtures/attachments';
import { loadFileContent } from '../../fileContent';

let directory: string;
beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), 'blinko-loaders-')); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function fixture(name: string, data: string | Buffer) {
  const path = join(directory, name);
  await writeFile(path, data);
  return path;
}

describe('maintained attachment parsers', () => {
  it('retains UTF-8 text and CSV header/value + quoted newline handling', async () => {
    expect(await loadFileContent(await fixture('note.txt', '你好\ntext'))).toBe('你好\ntext');
    const path = await fixture('notes.csv', 'title,body\n"A,B","line 1\nline 2"\n');
    expect(await loadFileContent(path)).toBe('title: A,B\nbody: line 1\nline 2');
  });

  it('extracts PDF with pdf-parse 2 and releases its parser', async () => {
    expect(await loadFileContent(await fixture('note.pdf', pdfFixture()))).toContain('Local PDF regression');
  });

  it('extracts DOCX through the same Mammoth parser as the old wrapper', async () => {
    expect(await loadFileContent(await fixture('note.docx', docxFixture()))).toContain('Local DOCX regression');
  });

  it('preserves Unstructured fallback request and filters text elements locally', async () => {
    const path = await fixture('note.rtf', '{\\rtf1 local}');
    const transport: NonNullable<Parameters<typeof loadFileContent>[1]> = async (url, init) => {
      expect(String(url)).toBe(process.env.UNSTRUCTURED_API_URL ?? 'https://api.unstructured.io/general/v0/general');
      expect(init?.method).toBe('POST');
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      if (!(form instanceof FormData)) throw new Error('Expected multipart body');
      expect(form.get('strategy')).toBe('hi_res');
      expect(form.get('overlap_all')).toBe('false');
      const file = form.get('files');
      expect(file).toBeInstanceOf(Blob);
      return Response.json([{ text: 'one' }, { text: 123 }, { text: '' }, { text: 'two' }]);
    };
    expect(await loadFileContent(path, transport)).toBe('one\ntwo');
  });

  it('does not silently turn a failed parser or HTTP response into successful text', async () => {
    const invalid = await fixture('invalid.docx', 'not a ZIP');
    await expect(loadFileContent(invalid)).rejects.toThrow('can not load file');
    const path = await fixture('error.rtf', 'local');
    await expect(loadFileContent(path, async () => new Response('failed', { status: 500 }))).rejects.toThrow('can not load file');
  });
});
