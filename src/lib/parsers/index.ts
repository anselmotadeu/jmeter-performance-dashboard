import { jmeterParser } from './jmeter';
import { k6JsonParser } from './k6';
import { k6CsvParser } from './k6-csv';
import { k6SummaryParser } from './k6-summary';
import { locustParser } from './locust';
import { artilleryParser } from './artillery';
import { newmanParser } from './newman';
import { gatlingParser } from './gatling';
import { vegetaParser } from './vegeta';
import type {
  AnalysisCapabilities, AnalysisResult, NormalizedPoint, PerformanceParser,
} from './types';
import { createAnalysisAccumulator } from './ingest';

export type {
  AggregateReportItem, AnalysisCapabilities, AnalysisResult, ErrorDetail, Heatmap, HeatmapBin,
  HttpPhase, MetricStats, NormalizedPoint, PerformanceParser, TimeSeriesEntry,
} from './types';
export type { AnalysisAccumulator } from './ingest';
export { HTTP_PHASES, HEATMAP_BINS } from './ingest-constants';

const PARSERS: PerformanceParser[] = [
  jmeterParser,
  k6SummaryParser,
  k6JsonParser,
  k6CsvParser,
  locustParser,
  artilleryParser,
  newmanParser,
  gatlingParser,
  vegetaParser,
];

export function detectParser(content: string): PerformanceParser | null {
  const sample = content.slice(0, 16_384).replace(/^\uFEFF/, '');
  return PARSERS.find((parser) => parser.detect(sample)) ?? null;
}

export function getParserByName(name: string) {
  return PARSERS.find((parser) => parser.name === name) ?? null;
}

export function listParsers() {
  return PARSERS.map((parser) => ({
    name: parser.name,
    displayName: parser.displayName,
    extensions: parser.supportedExtensions,
    dataQuality: parser.dataQuality ?? 'beta',
  }));
}

export function computeAnalysis(
  points: NormalizedPoint[],
  framework: string,
  sourceFormat = 'unknown',
  capabilities: Partial<AnalysisCapabilities> = {},
  dataQuality: 'certified' | 'beta' = 'beta',
): AnalysisResult {
  const accumulator = createAnalysisAccumulator(framework, sourceFormat, capabilities, dataQuality);
  for (const point of points) accumulator.add(point);
  return accumulator.finalize();
}

export function parseAndAnalyze(content: string, forcedParser?: string): AnalysisResult {
  const parser = forcedParser ? getParserByName(forcedParser) : detectParser(content);
  if (!parser) throw new Error('Formato não reconhecido. Use JMeter JTL/CSV ou K6 CSV, NDJSON ou summary JSON.');
  const parsed = parser.parse(content);
  if (!Array.isArray(parsed)) return parsed;
  if (!parsed.length) throw new Error(`Nenhuma amostra válida foi encontrada pelo parser ${parser.displayName}.`);
  return computeAnalysis(parsed, parser.displayName, parser.name, parser.capabilities, parser.dataQuality ?? 'beta');
}

export {
  jmeterParser,
  k6JsonParser,
  k6CsvParser,
  k6SummaryParser,
  locustParser,
  artilleryParser,
  newmanParser,
  gatlingParser,
  vegetaParser,
};