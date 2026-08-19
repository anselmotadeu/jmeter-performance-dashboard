import { createAnalysisAccumulator } from './ingest';
import { buildJtlColumns, jtlLineToPoint } from './jmeter';
import type { AnalysisCapabilities, AnalysisResult } from './types';

export const STREAMABLE_PARSERS = new Set(['jmeter']);

export type StreamMeta = {
  name: string;
  displayName: string;
  sourceFormat: string;
  capabilities: Partial<AnalysisCapabilities>;
  dataQuality: 'certified' | 'beta';
};

export type StreamParseHandle = {
  ingest(text: string): void;
  end(): AnalysisResult;
};

const MAX_PENDING = 2 * 1024 * 1024;

function createLinesProcessor(meta: StreamMeta): StreamParseHandle {
  const accumulator = createAnalysisAccumulator(meta.displayName, meta.sourceFormat, meta.capabilities, meta.dataQuality);
  let pending = '';
  let sawHeader = false;
  let columns: Record<string, number> | null = null;

  function pushLine(raw: string) {
    const line = raw.length && raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!sawHeader) {
      columns = buildJtlColumns(line);
      sawHeader = true;
      if (!columns) throw new Error('Cabeçalho JTL não reconhecido.');
      return;
    }
    if (!line.trim()) return;
    const point = jtlLineToPoint(columns!, line);
    if (point) accumulator.add(point);
  }

  return {
    ingest(text) {
      pending += text;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        pushLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      if (pending.length > MAX_PENDING) {
        pushLine(pending);
        pending = '';
      }
    },
    end() {
      if (pending.length) pushLine(pending);
      pending = '';
      return accumulator.finalize();
    },
  };
}

export function createStreamParser(meta: StreamMeta): StreamParseHandle {
  if (!STREAMABLE_PARSERS.has(meta.name)) {
    throw new Error('Formato não suportado para streaming.');
  }
  return createLinesProcessor(meta);
}