This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


# JMeter Performance Dashboard

![Next.js](https://img.shields.io/badge/Next.js-14.0.0-black) ![Recharts](https://img.shields.io/badge/Recharts-2.12.7-blue) ![Papaparse](https://img.shields.io/badge/Papaparse-5.4.1-green)

Um dashboard interativo para análise de resultados de testes de performance realizados com o JMeter. Este projeto fornece métricas claras e precisas com gráficos intuitivos e informações detalhadas, ideal para equipes que precisam documentar e compartilhar resultados de testes de carga e performance.

O dashboard está hospedado no Vercel e pode ser acessado em:  
🔗 [https://jmeter-performance-dashboard.vercel.app](https://jmeter-performance-dashboard.vercel.app)

## 📋 Visão Geral

O projeto processa arquivos `.jtl` ou `.csv` gerados pelo JMeter e apresenta os resultados de forma visual e analítica, incluindo gráficos de séries temporais, relatórios agregados, distribuições de tempos de resposta e métricas como média, percentis (P90, P95), throughput, taxas de erro e mais.

## 🚩 Funcionalidades Principais

- Upload de arquivos `.jtl` ou `.csv` do JMeter.
- Exibição de início, fim, duração total e ramp-up dos testes.
- Métricas agregadas de tempo de resposta (`média`, `mínimo`, `máximo`, `P90`, `P95`).
- Gráficos de séries temporais:
  - Virtual Users
  - Requests per Second
  - Errors per Second
  - Checks per Second
  - Response Time (over time)
  - Response Time Percentiles (over time)
  - Waiting Time (over time)
  - Bytes Received (over time)
- Relatórios agregados:
  - Aggregate Report com métricas detalhadas.
  - Response Time Distribution (histograma).
- Análise de sucesso e erros:
  - Gráficos de pizza com quantidade e percentual de sucesso vs erro.
  - Detalhamento de mensagens de erro.
- Filtros de tempo: todo o período, últimos 5 min, 15 min, 30 min ou 1 hora.
- Formatação amigável de valores (ex.: "128.00 ms", "8.19 s", "1.09 mins").

## 🚀 Como Usar

### Online (Recomendado)

1. Acesse: [https://jmeter-performance-dashboard.vercel.app](https://jmeter-performance-dashboard.vercel.app).
2. Faça upload de um arquivo `.jtl` ou `.csv` do JMeter.
3. Visualize os gráficos e relatórios.
4. Use o filtro de tempo para ajustar a análise.

### Localmente

#### Pré-requisitos
- Node.js 14+
- npm ou yarn

#### Passos

```bash
git clone https://github.com/seu-usuario/jmeter-performance-dashboard.git
cd jmeter-performance-dashboard
npm install
npm run dev
```

Acesse `http://localhost:3000` no navegador e faça upload do arquivo .jtl ou .csv.

## 🛠️ Tecnologias Utilizadas

**Next.js:** Framework React.

**Recharts:** Biblioteca de gráficos.

**Papaparse:** Parser de CSV.

**Vercel:** Deploy e hospedagem.

## 📈 Estrutura dos Gráficos e Relatórios

### 1. Detalhes do Teste
- Início e fim (data/hora).
- Duração total do teste.
- Ramp-up: número de usuários e tempo.

### 2. Métricas Agregadas
- Média, Mínimo, Máximo, P90 e P95 do tempo de resposta.

### 3. Gráficos de Séries Temporais
- Virtual Users (área empilhada)
- Requests per Second (barras)
- Errors per Second (barras)
- Checks per Second (barras)
- Response Time (linha)
- Response Time Percentiles (linhas coloridas)
- Waiting Time (linha)
- Bytes Received (linha)

### 4. Relatórios Agregados
- Aggregate Report:
  - Média, Mediana, P90, P95, Mínimo, Máximo.
  - Taxa de erro, Throughput, Contagem de requisições, Latência média.
  - Bytes Recebidos e Enviados.
  - Response Time Distribution: Histograma de tempos de resposta.

### 5. Análise de Sucesso e Erros
- Gráfico de pizza (quantidade e percentual de sucesso vs erro).
- Detalhamento das mensagens de erro.

## 🌐 Deploy no Vercel
1. Repositório: https://github.com/seu-usuario/jmeter-performance-dashboard.
2. Acesse https://vercel.com e conecte o repositório.
3. Clique em "Deploy" e aguarde a URL pública.

## 📝 Notas de Desenvolvimento
- Valores arredondados (2 casas decimais) com unidades apropriadas.
- Gráficos inspirados no padrão do K6 no Grafana.
- Otimizado para processar arquivos `.jtl` grandes (intervalos de 1s).

## 🤝 Contribuições
1. Fork do repositório.
2. Crie uma branch:

```bash
git checkout -b minha-feature
```

3. Commit:
```bash
git commit -m "Adiciona minha feature"
```

4. Push:
```bash
git push origin minha-feature
Abra um Pull Request.
```

## 📧 Contato
- Nome: [Anselmo Santos]
- Email: [anselmotadeu@outlook.com]
- GitHub: https://github.com/anselmotadeu
- Desenvolvido com 💻 e ☕ por [Anselmo Santos].