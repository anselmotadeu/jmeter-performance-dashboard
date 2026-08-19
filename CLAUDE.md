# Performance Dashboard — Arquitetura, Memória e Roadmap

## O que este projeto faz

Dashboard full-stack (Next.js 15 + React 19 + TypeScript) para análise de testes de performance. Recebe arquivos de resultado de frameworks de teste de carga, computa métricas e exibe 10+ gráficos interativos (Recharts): ramp-up de usuários, RPS, latência, tempos de resposta, heatmap de distribuição, relatório agregado com P90/P95, erros por segundo e pie charts de sucesso/erro. Suporte a tema claro/escuro. Interface 100% em português.

---

## Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15.2.8 (App Router) |
| UI | React 19 + TypeScript strict |
| Gráficos | Recharts 2.15.2 |
| CSV Parsing | PapaParse 5.5.2 |
| Auth | NextAuth.js v4 (Google OAuth + Credentials) |
| Estilos | Tailwind CSS 4 |
| Hospedagem atual | Vercel |

---

## Arquitetura de Parsers Multi-Framework

### Princípio Central

Todos os frameworks de teste produzem dados distintos. O dashboard os normaliza para um tipo canônico `NormalizedPoint` antes de computar as estatísticas. Isso garante que toda a lógica de análise (percentis, time series, aggregates) funcione identicamente independente da origem.

```
Arquivo de Resultado (JMeter, K6, Locust, ...)
           ↓
   Parser Específico
           ↓
   NormalizedPoint[]
           ↓
   Aggregator (framework-agnóstico)
           ↓
   AnalysisResult (JSON para os gráficos)
```

### Tipo Canônico NormalizedPoint

```typescript
type NormalizedPoint = {
  timestamp: number;      // Unix ms
  label: string;          // Nome do endpoint/cenário
  elapsed: number;        // Tempo de resposta total (ms)
  success: boolean;       // true = OK, false = falhou
  activeUsers: number;    // VUs/threads ativos no momento
  latency: number;        // Latência de rede / TTFB (ms)
  bytesReceived: number;  // Bytes da resposta
  bytesSent: number;      // Bytes da requisição
  responseCode?: string;  // Código HTTP (ex: "500")
  responseMessage?: string; // Mensagem de erro se houver
};
```

### Localização dos Parsers

```
src/lib/parsers/
  types.ts        ← NormalizedPoint + AnalysisResult types
  jmeter.ts       ← JTL/CSV do JMeter (IMPLEMENTADO)
  k6.ts           ← JSON NDJSON do K6 (IMPLEMENTADO)
  locust.ts       ← CSV do Locust (IMPLEMENTADO - básico)
  artillery.ts    ← JSON do Artillery (IMPLEMENTADO - básico)
  newman.ts       ← JSON do Newman/Postman (STUB)
  index.ts        ← Registry, auto-detecção, aggregator
```

### Detecção Automática de Framework

Ao receber um arquivo, o sistema tenta detectar o framework inspecionando as primeiras linhas:

| Framework | Sinal de Detecção |
|---|---|
| JMeter | Header CSV: `timeStamp,elapsed,label,...` |
| K6 JSON | Primeira linha: `{"type":"Metric"` ou `{"type":"Point"` |
| K6 CSV | Primeira linha: `metric_name,timestamp,metric_value` |
| Locust | Header CSV: `"Type","Name","Request Count",...` |
| Artillery | JSON com chave `"aggregate"` ou `"phases"` |
| Newman | JSON com chave `"stats"` e `"collection"` |

### Como Adicionar um Novo Parser

1. Criar `src/lib/parsers/novoframework.ts`:
```typescript
import type { PerformanceParser, NormalizedPoint } from './types';

export const novoFrameworkParser: PerformanceParser = {
  name: 'novo-framework',
  displayName: 'Nome do Framework',
  supportedExtensions: ['.ext1', '.ext2'],
  detect(firstLines: string): boolean {
    return firstLines.includes('sinal-único-do-framework');
  },
  parse(content: string): NormalizedPoint[] {
    // Transforma o conteúdo em NormalizedPoint[]
    return [];
  },
};
```

2. Registrar em `src/lib/parsers/index.ts`:
```typescript
import { novoFrameworkParser } from './novoframework';
const PARSERS = [..., novoFrameworkParser];
```

Pronto. Toda a análise funciona automaticamente.

---

## Formatos de Arquivo Suportados

### JMeter (JTL/CSV)
**Extensões:** `.jtl`, `.csv`
**Formato:** CSV com headers
```
timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect
1718700000000,150,GET /api/users,200,,Thread-1,,true,,1024,256,5,10,http://api.example.com/users,120,0,30
```

### K6 (JSON NDJSON)
**Extensão:** `.json` (produzido com `k6 run --out json=result.json`)
```json
{"type":"Metric","data":{"name":"http_req_duration","type":"trend"},"metric":"http_req_duration"}
{"type":"Point","data":{"time":"2024-01-15T10:00:01.123Z","value":156.789,"tags":{"method":"GET","name":"GET /api/users","status":"200"}},"metric":"http_req_duration"}
{"type":"Point","data":{"time":"2024-01-15T10:00:01.123Z","value":0,"tags":{"method":"GET","name":"GET /api/users"}},"metric":"http_req_failed"}
```

### Locust (CSV de Stats)
**Extensão:** `.csv` (arquivo `*_stats.csv` do Locust)
```
Type,Name,Request Count,Failure Count,Median Response Time,Average Response Time,Min Response Time,Max Response Time,Average Content Size,Requests/s,Failures/s,50%,66%,75%,80%,90%,95%,98%,99%,99.9%,99.99%,100%
GET,/api/users,1000,10,150,155,50,1200,1024,10.5,0.1,150,160,170,180,200,250,400,600,1100,1200,1200
```

### Artillery (JSON)
**Extensão:** `.json` (produzido com `artillery run --output result.json`)
Contém chave `"aggregate"` com métricas de latência, RPS e erros.

### Newman/Postman (JSON)
**Extensão:** `.json` (produzido com `newman run --reporters json --reporter-json-export result.json`)
Contém chave `"stats"` com totais de requests, failures, etc.

---

## Estratégia para Arquivos Grandes (500MB, 1GB)

### Situação Atual (Fase 1)
- Processamento no **browser** (client-side com PapaParse)
- Limite prático: ~2-4GB de RAM do browser
- Problema: UI fica travada durante o processamento
- Aviso em arquivos > 50MB

### Limitações da Hospedagem Vercel
| Plano | Limite do Body da Requisição |
|---|---|
| Hobby (gratuito) | 4.5MB |
| Pro | 100MB |

**Conclusão:** Para arquivos > 100MB, Vercel NÃO é adequado para processamento server-side direto.

### Solução Completa para 500MB+ (Fase 2)
```
Browser → Upload direto para Supabase Storage (sem passar pelo servidor)
       → POST /api/process-large { fileUrl }
       → Servidor lê do Storage via stream
       → Processa em Worker Thread (não bloqueia o servidor)
       → Salva resultado no banco de dados
       → Frontend polling ou SSE para progresso em tempo real
       → Resultado exibido quando completo
```

Isso bypassa o limite de body do Vercel completamente, pois o upload vai direto para o Storage.

**Alternativa ao Vercel para arquivos grandes:** Railway.app ($5/mês), container persistente, sem timeout de função, suporta Node.js nativo.

### Otimizações Planejadas (Fase 2)
- Streaming de arquivo com ReadableStream (sem carregar tudo em RAM)
- Worker Thread para parsing (não bloqueia o event loop)
- Progresso em tempo real via Server-Sent Events
- Cache de resultados no Supabase DB (não processa duas vezes o mesmo arquivo)

---

## Integração de LLM — Diretrizes (Fase 3 ou 4)

**ATENÇÃO:** Integração de LLM deve ser feita com cuidado extremo.

### O que pode ser feito com custo controlado

✅ O LLM recebe APENAS o JSON de agregações finais (~2KB para qualquer tamanho de arquivo):
- ~15 métricas por label (avg, median, p90, p95, min, max, errorRate, throughput, count)
- Nenhum dado de série temporal
- Nenhum arquivo bruto

Modelo recomendado: **claude-haiku-4-5-20251001** (mais barato, rápido, suficiente para análise de JSON)

Custo estimado por análise: < R$0,10 por request

### O que o LLM pode fazer com esse contexto limitado
- Identificar anomalias (P95 >> média = cauda pesada, sinal de problema específico)
- Detectar degradação progressiva (se histórico disponível)
- Gerar relatório executivo em linguagem natural
- Sugerir onde está o gargalo

### O que NUNCA fazer
❌ Passar série temporal completa ao LLM (pode ter 200k linhas → milhares de tokens)  
❌ Passar o arquivo bruto ao LLM  
❌ Processar cada requisição individualmente com IA  
❌ Integrar LLM antes de resolver auth, multi-framework e large files

### Implementação (quando chegar a hora)
```typescript
// CORRETO: passar apenas aggregateReport (~2KB)
const analysis = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: `Analise estes resultados de performance e identifique anomalias:
    ${JSON.stringify(aggregateReport, null, 2)}
    
    Responda em JSON: { anomalies: string[], summary: string, recommendations: string[] }`
  }]
});
```

---

## Segurança e Autenticação

### Fase 1 (Implementado)
- NextAuth.js v4 com Google OAuth
- Fallback com email/senha via variáveis de ambiente
- Middleware de proteção de rotas (`/` protegida, `/login` pública, `/api/auth/*` pública)
- Validação de tipo de arquivo no servidor
- Sanitização de mensagens renderizadas (proteção XSS)

### Fase 2 (Planejado)
- Rate limiting por usuário (usando Redis/Upstash)
- Planos de usuário (Free, Pro, Team) com Stripe
- Limites de arquivo por plano
- Auditoria de uso

### Variáveis de Ambiente

```env
# Autenticação (obrigatório para produção)
NEXTAUTH_SECRET=uma-string-aleatoria-de-32-chars
NEXTAUTH_URL=https://seu-dominio.com

# Google OAuth (obrigatório para login com Google)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Login com credenciais simples (alternativa ao Google)
ADMIN_EMAIL=admin@empresa.com
ADMIN_PASSWORD=senha-segura

# Modo sem auth (apenas para desenvolvimento local)
SKIP_AUTH=false
```

---

## Plano de Comercialização

### Modelo de Preços Sugerido

| Plano | Preço | Limites |
|---|---|---|
| Free | R$0 | Arquivos até 10MB, 5 análises/mês, sem histórico |
| Pro | R$79/mês | Arquivos até 500MB, ilimitado, histórico 90 dias, export PDF/PNG |
| Team | R$249/mês | Tudo do Pro + 10 usuários, comparação de execuções, API |
| Enterprise | Sob consulta | On-premise, SSO, todos frameworks, suporte dedicado |

Anual: 20% de desconto (padrão do mercado).

### Concorrentes Diretos

| Produto | Foco | Preço |
|---|---|---|
| BlazeMeter | Test runner + dashboard | $99–$499/mês |
| k6 Cloud | Test runner + Grafana | $0–$300/mês |
| Flood.io | Test runner + reports | $350/mês |

**Posicionamento:** Este dashboard é um **analisador de resultados**, não um test runner. Nicho menor mas dor real de quem já tem os dados mas não tem dashboard.

### Stack Gratuito para Produção

| Componente | Ferramenta | Custo |
|---|---|---|
| Hospedagem | Vercel | Grátis (até 100GB bandwidth) |
| Banco de dados | Supabase | Grátis (500MB, 50k MAUs) |
| Auth | NextAuth + Google OAuth | Grátis |
| Storage | Supabase Storage | Grátis (1GB) |
| Domínio | Registro.br | ~R$40/ano |
| Analytics | Vercel Analytics | Grátis |

Custo total para começar: ~R$40/ano (só o domínio).

Para escalar (arquivos grandes, muitos usuários):
- Vercel Pro: $20/mês
- Supabase Pro: $25/mês
- Total: ~$45/mês antes de ter receita

---

## Integração como Plugin / Addon

Este projeto pode ser comercializado standalone OU como addon de outro produto.

### Opção 1 — API REST (melhor para parcerias)
O endpoint `/api/process-jtl` já existe. Para vender como addon:
1. Adicionar autenticação via API Key no header
2. Documentar a API (OpenAPI/Swagger)
3. O produto parceiro envia o arquivo e recebe o JSON de análise
4. Renderiza como quiser

### Opção 2 — Widget Embeddable (Fase 3)
```html
<!-- O parceiro embeda o dashboard via iframe com JWT assinado -->
<iframe src="https://dashboard.seudominio.com/embed?token=JWT_TOKEN" />
```

### Opção 3 — npm Package (Fase 4)
Publicar `@seu-dominio/perf-analyzer` no npm com a lógica de parsing e análise. O dashboard é uma UI sobre o SDK. Permite máxima integração.

---

## Roadmap de Implementação

### Fase 1 — Fundação (ATUAL)
- [x] Arquitetura de parsers multi-framework
- [x] Parser JMeter (refatorado para usar a arquitetura)
- [x] Parser K6 JSON
- [x] Parser Locust CSV
- [x] Parser Artillery JSON (stub)
- [x] Parser Newman/Postman (stub)
- [x] Autenticação (NextAuth + Google OAuth)
- [x] Middleware de segurança
- [x] Migração do processamento para API server-side
- [x] CLAUDE.md (este arquivo)

### Fase 2 — Escalabilidade (próxima)
- [ ] Upload direto para Supabase Storage (arquivos grandes)
- [ ] Processamento server-side com Worker Thread
- [ ] Progresso em tempo real via SSE
- [ ] Persistência de análises no banco de dados
- [ ] Rate limiting (Upstash Redis)
- [ ] Completar parsers Artillery e Newman
- [ ] Parser Gatling (simulation.log)
- [ ] Parser Vegeta (JSON)

### Fase 3 — Comercialização
- [ ] Planos + billing (Stripe)
- [ ] Export PDF/PNG
- [ ] Comparação de execuções (histórico)
- [ ] API pública com API Keys
- [ ] Landing page
- [ ] Documentação pública da API

### Fase 4 — Expansão
- [ ] LLM analysis (apenas sobre aggregateReport)
- [ ] Alertas e SLAs
- [ ] Widget embeddable
- [ ] npm package
- [ ] On-premise / self-hosted (Enterprise)

---

## Convenções de Código

- TypeScript strict ativado
- Sem `any` onde evitável
- Funções puras para parsing e aggregation
- Efeitos colaterais apenas em `use client` ou route handlers
- Comentários apenas quando o motivo não é óbvio
- Português no UI, inglês no código

## Contato e Repositório

- GitHub: `anselmotadeu/jmeter-performance-dashboard`
- Email: anselmotadeu@outlook.com
