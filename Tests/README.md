# Arquivos para validação manual

Esta pasta contém dados pequenos e versionados para testar os gráficos sem expor informações reais.

| Arquivo | Formato | Resultado esperado |
|---|---|---|
| `jmeter-sample.jtl` | JMeter JTL/CSV | 6 requisições, 1 erro, labels Login e Checkout |
| `k6-sample.csv` | Saída `k6 --out csv` | 3 requisições no mesmo segundo, 1 erro |
| `k6-sample.ndjson` | Saída `k6 --out json` | 2 requisições, 1 erro, série temporal disponível |
| `k6-summary.json` | `handleSummary(data)` legado | 1.000 requisições, 2% de erro, P95 de 450 ms |
| `k6-summary-v1.json` | Machine-readable summary v1 | 60 segundos, 1.000 requisições, 20 erros |

Os arquivos brutos são processados localmente no navegador. Ao salvar no histórico, somente agregados são enviados ao backend.
