# Performance Dashboard — ROADMAP

## Estado atual (baseline)
- Auth (Better Auth) funcionando
- Parsers: JMeter, K6, Locust, Artillery, Newman, Gatling, Vegeta
- Dashboard básico com ~6 gráficos (AreaChart, LineChart, BarChart, Heatmap)
- Análise de insights (severity: excellent/good/warning/critical)
- Sem billing, sem planos, sem gates de features
- Layout próprio (não alinhado ao TestDiff)

## T1 — Billing completo (padrão EstilOS/TestDiff)
- [x] T1.1: Migrations billing (planos Monitor/Radar, subscription, trial 7 dias)
- [x] T1.2: Stripe checkout, webhook, portal (100% cópia do TestDiff billing)
- [x] T1.3: /pricing com planos Monitor e Radar
- [x] T1.4: /minha-conta (apenas informativo — lição do TestDiff)
- [x] T1.5: Trial 7 dias → bloqueia totalmente ao expirar
- [x] T1.6: NFS-e automática após pagamento (mesmo código do TestDiff)
- [x] T1.7: Emails transacionais (confirmação, NFS-e, cancelamento, trial expirando, pagamento falhou)

## T2 — Layout TestDiff + AppShell
- [x] T2.1: AppShell com sidebar, tema claro/escuro, NotificationBanners
- [x] T2.2: UsageBar com re-fetch por rota (lição TestDiff)
- [x] T2.3: TrialExpiredGate (bloqueia exceto /pricing e /minha-conta)
- [ ] T2.4: Super Admin (/admin) — padrão EstilOS adaptado para perf-dash

## T3 — Gráficos estilo Grafana (core do produto)
- [ ] T3.1: Painel de gráficos responsivo estilo Grafana (grid configurável)
- [ ] T3.2: Novos gráficos: Throughput (req/s) over time, Error rate over time
- [ ] T3.3: Response time distribution (histograma + percentis empilhados)
- [ ] T3.4: Concurrent users heatmap (usuários × tempo × latência)
- [ ] T3.5: Endpoint comparison chart (radar/spider chart por endpoint)
- [ ] T3.6: SLA compliance gauge (% de requests dentro do SLA)
- [ ] T3.7: Anotações de tempo (marcar início de ramp-up, pico, queda)
- [ ] T3.8: Dark mode total para todos os gráficos (theme-aware colors)

## T4 — Gates de plano e contabilização
- [ ] T4.1: record-usage no processamento (não no salvamento — lição TestDiff)
- [ ] T4.2: Monitor: 50 análises, gráficos básicos, export basic
- [ ] T4.3: Radar: 250 análises, todos os gráficos, export PDF/PNG, comparativo
- [ ] T4.4: Gate visual: features Radar bloqueadas para Monitor (tooltip "Apenas Radar")

## T5 — Comparativo de runs (diferencial do produto)
- [ ] T5.1: Selecionar 2 runs e comparar lado a lado
- [ ] T5.2: Delta chart (diferença % entre runs por endpoint)
- [ ] T5.3: Baseline marking (marcar run como referência para comparações futuras)

## Planos
| Plano   | Preço     | Análises/mês | Features                          |
|---------|-----------|--------------|-----------------------------------|
| Monitor | R$79/mês  | 50           | Gráficos essenciais, export básico |
| Radar   | R$149/mês | 250          | Todos gráficos, comparativo, PDF  |
| Trial   | Grátis    | —            | 7 dias com limites Radar          |

## Ordem de execução: T1 → T2 → T3 → T4 → T5
