import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAuthRequired } from '@/lib/auth';
import { parseAndAnalyze, listParsers } from '@/lib/parsers';

const ALLOWED_EXTENSIONS = new Set(['.jtl', '.csv', '.json', '.log']);
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB server-side hard limit

export async function POST(request: NextRequest) {
  // Auth check
  if (isAuthRequired()) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Falha ao receber o arquivo.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
  }

  // File size check (server-side hard limit)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(0)}MB). Limite: 500MB. Para arquivos maiores, use o processamento local no navegador.` },
      { status: 413 },
    );
  }

  // Extension check
  const fileName = file.name.toLowerCase();
  const ext = '.' + (fileName.split('.').pop() ?? '');
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Extensão não suportada: ${ext}. Formatos aceitos: .jtl, .csv, .json, .log` },
      { status: 415 },
    );
  }

  // Parse forced framework header if provided (optional override)
  const forcedParser = request.headers.get('x-parser') ?? undefined;

  try {
    const content = await file.text();
    const result = parseAndAnalyze(content, forcedParser);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar o arquivo.';
    console.error('[process-jtl]', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

// GET endpoint: lists supported parsers (useful for API consumers)
export async function GET() {
  return NextResponse.json({ parsers: listParsers() });
}
