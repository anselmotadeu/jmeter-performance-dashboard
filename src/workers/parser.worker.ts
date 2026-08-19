/// <reference lib="webworker" />
import { parseAndAnalyze } from '@/lib/parsers';
import { createStreamParser, type StreamMeta } from '@/lib/parsers/stream';
import type { AnalysisResult } from '@/lib/parsers';

type StartMsg = { kind: 'start'; meta: StreamMeta & { detectorConfirmed?: boolean } };
type DataMsg = { kind: 'data'; text?: string; buffer?: ArrayBuffer };
type EndMsg = { kind: 'end' };
type BufferMsg = { kind: 'buffer'; buffer: ArrayBuffer };
type Incoming = StartMsg | DataMsg | EndMsg | BufferMsg;

let handle: ReturnType<typeof createStreamParser> | null = null;

self.onmessage = (event: MessageEvent<Incoming>) => {
  try {
    const message = event.data;
    if (!message) return;
    if (message.kind === 'buffer') {
      const content = new TextDecoder().decode(message.buffer);
      self.postMessage({ ok: true, result: parseAndAnalyze(content) });
      return;
    }
    if (message.kind === 'start') {
      handle = createStreamParser(message.meta);
      return;
    }
    if (message.kind === 'data') {
      if (!handle) throw new Error('Streaming não iniciado.');
      if (message.text !== undefined) {
        handle.ingest(message.text);
      } else if (message.buffer) {
        handle.ingest(new TextDecoder().decode(message.buffer));
      }
      return;
    }
    if (message.kind === 'end') {
      if (!handle) throw new Error('Streaming não iniciado.');
      const result: AnalysisResult = handle.end();
      handle = null;
      self.postMessage({ ok: true, result });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível analisar o arquivo.';
    self.postMessage({ ok: false, error: message });
  }
};
export {};