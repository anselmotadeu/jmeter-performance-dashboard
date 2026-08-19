# Performance Dashboard

Plataforma para analisar, versionar e comparar execuções de testes de performance. O produto possui suporte certificado para Apache JMeter e k6, histórico por projeto, baseline e identificação automática de regressões.

## Funcionalidades

- Cadastro, confirmação de e-mail, login e recuperação de senha.
- Workspaces e projetos preparados para equipes.
- Processamento local: o arquivo bruto não é enviado ao servidor.
- JMeter JTL/CSV certificado.
- k6 CSV, NDJSON e summary JSON certificado.
- Parsers experimentais para Locust, Artillery, Newman, Gatling e Vegeta identificados como Beta.
- Métricas agregadas, séries temporais, erros, checks e thresholds.
- Histórico persistido no Neon.
- Baseline por projeto e comparação automática de regressões.
- Exportação CSV protegida contra formula injection.
- Interface responsiva, tema claro/escuro e acessibilidade por teclado.
- CI, CodeQL e Dependabot.

## Privacidade

Arquivos JTL, CSV, JSON e NDJSON são lidos no navegador. Ao salvar uma análise, somente métricas agregadas são enviadas ao backend:

- contagens, médias e percentis por endpoint;
- buckets temporais agregados;
- erros agrupados;
- checks e thresholds;
- metadados do framework e capabilities.

Não são persistidos arquivos brutos, headers, cookies, bodies ou cada requisição individual.

## Formatos certificados

| Ferramenta | Formato |
|---|---|
| JMeter | JTL request-level em CSV com cabeçalho |
| k6 | `--out csv` |
| k6 | `--out json` (NDJSON) |
| k6 | `handleSummary(data)` JSON |
| k6 | Machine-readable summary v1 |

Arquivos pequenos para validação manual estão em [`Tests/`](./Tests).

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run migrate
npm run dev
```

Variáveis necessárias:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- credenciais `ZOHO_SMTP_*`

Use obrigatoriamente a Connection Pooling do Neon. O runner mantém a tabela `schema_migration` e aplica somente migrations pendentes.

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit:ci
```

## Banco

As migrations PostgreSQL ficam em `migrations/`:

- autenticação Better Auth;
- workspaces e memberships;
- projetos e análises;
- labels, buckets, erros, checks e thresholds;
- baselines e comparações;
- uso, planos e estrutura preparada para Stripe.

## Stack

- Next.js 16 + React 19
- Better Auth
- PostgreSQL/Neon
- Tailwind CSS 4
- Recharts
- PapaParse
- Jest + Testing Library
- Vercel

## Limitações conhecidas

- Parsers Beta não devem ser usados para decisões contratuais sem validação na ferramenta de origem.
- O limite atual por arquivo é 5 MB para manter o processamento seguro na thread do navegador. Streaming com Web Worker será necessário antes de liberar arquivos maiores.
- Cobrança Stripe está preparada no schema, mas o checkout será implementado em uma etapa própria.
