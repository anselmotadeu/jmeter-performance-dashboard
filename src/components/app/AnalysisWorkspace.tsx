"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  LoaderCircle,
  Save,
} from "lucide-react";
import { parseAndAnalyze, type AnalysisResult } from "@/lib/parsers";
import { detectParser } from "@/lib/parsers";
import { STREAMABLE_PARSERS } from "@/lib/parsers/stream";
import PerformanceDashboard from "@/components/app/PerformanceDashboard";
type WorkerResult = { ok: boolean; result?: AnalysisResult; error?: string };
function makeWorker() {
  return new Worker(new URL('../../workers/parser.worker.ts', import.meta.url), { type: 'module' });
}
function runStreaming(file: File, parserName: string) {
  const worker = makeWorker();
  const displayName = parserName === 'jmeter' ? 'Apache JMeter' : parserName;
  const capabilities = parserName === 'jmeter'
    ? { requestSamples: true, timeSeries: true, activeUsers: true, responseTime: true, waitingTime: true, networkBytes: true, errors: true }
    : {};
  return new Promise<AnalysisResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (!event.data) return;
      if (event.data.ok && event.data.result) { worker.terminate(); resolve(event.data.result); }
      else { worker.terminate(); reject(new Error(event.data.error || 'Falha no parser.')); }
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('O Web Worker de análise falhou.')); };
    worker.postMessage({
      kind: 'start',
      meta: {
        name: parserName,
        displayName,
        sourceFormat: parserName,
        capabilities,
        dataQuality: 'certified',
      },
    });
    (async () => {
      const reader = file.stream().getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength) worker.postMessage({ kind: 'data', text: decoder.decode(value, { stream: true }) });
        }
        worker.postMessage({ kind: 'data', text: decoder.decode() });
        worker.postMessage({ kind: 'end' });
      } catch (cause) {
        worker.terminate();
        reject(cause instanceof Error ? cause : new Error('Falha ao ler o arquivo.'));
      }
    })();
  });
}
async function parseFile(file: File) {
  if (typeof Worker === 'undefined') return parseAndAnalyze(await file.text());
  const prefix = await file.slice(0, 16_384).text();
  const parser = detectParser(prefix);
  if (parser && STREAMABLE_PARSERS.has(parser.name)) {
    return runStreaming(file, parser.name);
  }
  const worker = makeWorker();
  try {
    const buffer = await file.arrayBuffer();
    return await new Promise<AnalysisResult>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResult>) => event.data.ok && event.data.result ? resolve(event.data.result) : reject(new Error(event.data.error || 'Falha no parser.'));
      worker.onerror = () => reject(new Error('O Web Worker de análise falhou.'));
      worker.postMessage({ kind: 'buffer', buffer }, [buffer]);
    });
  } finally {
    worker.terminate();
  }
}
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}
function escapeCsv(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export default function AnalysisWorkspace() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [idempotency, setIdempotency] = useState(uuid);
  const [projects, setProjects] = useState<Array<{id:string;name:string;workspaceName:string;role:string}>>([]);
  const [projectId, setProjectId] = useState("");
  useEffect(() => { fetch('/api/projects').then((response)=>response.json()).then((payload)=>{setProjects(payload.projects??[]);setProjectId((current)=>current||payload.projects?.[0]?.id||"")}).catch(()=>setError('Não foi possível carregar os projetos.')); }, []);
  async function select(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const analysis = await parseFile(selected);
      setResult(analysis);
      setTitle(
        `${analysis.framework} · ${new Date().toLocaleDateString("pt-BR")}`,
      );
      setIdempotency(uuid());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível analisar o arquivo.",
      );
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }
  async function save() {
    if (!result || !file || title.trim().length < 3) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotency,
          projectId: projectId || undefined,
          title: title.trim(),
          fileSize: file.size,
          analysis: result,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível salvar.");
      router.push(`/resultados/${payload.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  function exportCsv() {
    if (!result) return;
    const headers = [
      "Label",
      "Amostras",
      "Média",
      "Mediana",
      "P90",
      "P95",
      "Mínimo",
      "Máximo",
      "Erro (%)",
      "Throughput",
    ];
    const rows = result.aggregateReport.map((item) => [
      escapeCsv(item.label),
      item.count,
      item.average,
      item.median,
      item.p90,
      item.p95,
      item.min,
      item.max,
      item.errorRate,
      item.throughput,
    ]);
    const blob = new Blob(
      [
        "\uFEFF" +
          [headers.join(","), ...rows.map((row) => row.join(","))].join("\n"),
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "performance-analysis.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const total = result ? result.successCount + result.errorCount : 0;
  const weightedAverage =
    result && total
      ? result.aggregateReport.reduce(
          (sum, item) => sum + item.average * item.count,
          0,
        ) / total
      : 0;
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-black uppercase tracking-[.22em] text-indigo-600">
          Nova análise
        </p>
        <h1 className="mt-2 text-4xl font-black">Analise uma execução</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          O arquivo é processado no navegador e não é enviado ao servidor.
          JMeter e k6 possuem suporte certificado.
        </p>
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <label
          htmlFor="performance-file"
          className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-8 text-center transition hover:border-indigo-400 dark:border-indigo-900 dark:bg-indigo-950/20"
        >
          <FileUp className="h-10 w-10 text-indigo-600" />
          <span className="mt-3 text-lg font-black">
            Escolher arquivo de performance
          </span>
          <span className="mt-1 text-sm text-slate-500">
            JMeter .jtl/.csv · k6 .csv/.json/.ndjson · arquivos grandes processados em streaming no navegador
          </span>
          <input
            id="performance-file"
            type="file"
            accept=".jtl,.csv,.json,.ndjson"
            onChange={select}
            className="sr-only"
          />
        </label>
        {loading && (
          <div
            role="status"
            className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-indigo-600"
          >
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Processando localmente...
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700"
          >
            {error}
          </div>
        )}
      </section>
      {result && (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 lg:flex-row lg:items-end">
            <label className="text-sm font-black">Projeto<select value={projectId} onChange={(event)=>setProjectId(event.target.value)} className="mt-2 h-11 w-full min-w-48 rounded-xl border border-indigo-200 bg-white px-3 text-slate-950 dark:bg-slate-950 dark:text-white">{projects.map((project)=><option key={project.id} value={project.id}>{project.workspaceName} / {project.name}</option>)}</select></label>
            <label className="flex-1 text-sm font-black">
              Nome no histórico
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={180}
                className="mt-2 h-11 w-full rounded-xl border border-indigo-200 bg-white px-4 text-slate-950 dark:border-indigo-800 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <button
              onClick={save}
              disabled={saving || title.trim().length < 3 || !projectId}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar no histórico"}
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Requisições" value={total.toLocaleString("pt-BR")} />
            <Metric
              label="Tempo médio"
              value={`${weightedAverage.toFixed(1)} ms`}
            />
            <Metric
              label="Erros"
              value={result.errorCount.toLocaleString("pt-BR")}
              danger={result.errorCount > 0}
            />
            <Metric
              label="Usuários máximos"
              value={
                result.capabilities.activeUsers
                  ? String(result.rampUpInfo.users)
                  : "Indisponível"
              }
            />
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">
              {result.framework}
            </span>
            <span
              className={
                "rounded-full px-3 py-1.5 text-xs font-black " +
                (result.dataQuality === "certified"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700")
              }
            >
              {result.dataQuality === "certified" ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Certificado
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Beta
                </span>
              )}
            </span>
          </div>
          {result.diagnostics.map((item) => (
            <p
              key={item}
              className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
            >
              {item}
            </p>
          ))}
          <PerformanceDashboard data={result} />
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xl font-black">Endpoints</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="p-3">Label</th>
                    <th className="p-3">Amostras</th>
                    <th className="p-3">Média</th>
                    <th className="p-3">P90</th>
                    <th className="p-3">P95</th>
                    <th className="p-3">P99</th>
                    <th className="p-3">Erro</th>
                    <th className="p-3">Req/s</th>
                  </tr>
                </thead>
                <tbody>
                  {result.aggregateReport.map((item) => (
                    <tr
                      key={item.label}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="p-3 font-bold">{item.label}</td>
                      <td className="p-3">{item.count}</td>
                      <td className="p-3">{item.average} ms</td>
                      <td className="p-3">{item.p90 === null ? "N/D" : `${item.p90} ms`}</td>
                      <td className="p-3">{item.p95 === null ? "N/D" : `${item.p95} ms`}</td>
                      <td className="p-3">{item.p99 === null ? "N/D" : `${item.p99} ms`}</td>
                      <td className="p-3">{item.errorRate}%</td>
                      <td className="p-3">{item.throughput}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={"mt-2 text-2xl font-black " + (danger ? "text-red-600" : "")}
      >
        {value}
      </div>
    </div>
  );
}
