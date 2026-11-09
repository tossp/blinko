import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

/** Attachment extraction without the sunset @langchain/community wrappers. */
export async function loadFileContent(filePath: string, transport: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> = fetch): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    switch (true) {
      case filePath.endsWith('.pdf'): {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const result = await parser.getText();
          return result.pages.map(page => page.text).filter(text => text.trim()).join('\n');
        } finally {
          await parser.destroy();
        }
      }
      case filePath.endsWith('.docx'): {
        const { extractRawText } = await import('mammoth');
        return (await extractRawText({ buffer })).value;
      }
      case filePath.endsWith('.doc'): {
        const { default: WordExtractor } = await import('word-extractor');
        return (await new WordExtractor().extract(buffer)).getBody();
      }
      case filePath.endsWith('.txt'):
        return buffer.toString('utf8');
      case filePath.endsWith('.csv'): {
        const { csvParse } = await import('d3-dsv');
        return csvParse(buffer.toString('utf8').trim())
          .map(row => Object.keys(row).map(key => `${key.trim()}: ${row[key]?.trim()}`).join('\n'))
          .join('\n');
      }
      default: {
        // Keep the previous Unstructured API contract, environment variables,
        // and defaults; do not silently replace unsupported types with raw text.
        const form = new FormData();
        form.append('files', new Blob([new Uint8Array(buffer)]), basename(filePath));
        form.append('strategy', 'hi_res');
        form.append('overlap_all', 'false');
        const response = await transport(
          process.env.UNSTRUCTURED_API_URL ?? 'https://api.unstructured.io/general/v0/general',
          {
            method: 'POST',
            body: form,
            headers: { 'UNSTRUCTURED-API-KEY': process.env.UNSTRUCTURED_API_KEY ?? '' },
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to partition file with error ${response.status}: ${await response.text()}`);
        }
        const elements: unknown = await response.json();
        if (!Array.isArray(elements)) throw new Error('Expected Unstructured partition elements');
        return elements
          .filter((element): element is { text: string } =>
            typeof element === 'object' && element !== null && 'text' in element && typeof element.text === 'string' && element.text !== '')
          .map(element => element.text)
          .join('\n');
      }
    }
  } catch (error) {
    console.error('File loading error:', error);
    throw new Error(`can not load file: ${filePath}`);
  }
}
