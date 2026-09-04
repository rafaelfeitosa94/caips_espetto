# Painel Caipirinha aos Domingos — Espetto Carioca

Relatório interativo (ApexCharts + amCharts, tema dark) das vendas de **caipirinha**
nos **domingos**, a partir de 01/06/2026.

## Como usar
1. **Atualizar os dados** (opcional, quando quiser puxar do banco de novo):
   ```
   powershell -ExecutionPolicy Bypass -File extract.ps1
   ```
   Isso roda `sql/caipirinha.sql` no SQL Server (`ad01\bartender`) e regera
   `data/caipirinha.js`.
2. **Abrir o painel**: dê dois cliques em `iniciar_painel.bat`
   (sobe `http://localhost:5517` e abre o navegador).
   > Precisa de servidor local porque o painel carrega `data/*.js` e `lib/*.js`
   > por caminho relativo — abrir o `index.html` direto (file://) não executa.

## Recorte aplicado
- **Ignora** linhas com **hora nula**.
- Considera **somente domingos** (13 domingos no período).
- Destaque visual da faixa **12h–18h** e da **melhor janela de 3h**.

## Estrutura
| Arquivo | Papel |
|---|---|
| `sql/caipirinha.sql` | Query base (dia × hora × loja × produto × UF) |
| `extract.ps1` | Extrai, filtra domingos/hora, agrega UF×Hora×Produto → `data/caipirinha.js` |
| `data/caipirinha.js` | Dados agregados + bloco `doseDupla` (contexto seg–sáb) |
| `index.html` / `app.js` | Painel |
| `lib/` | ApexCharts + amCharts (vendorizados, funciona offline) |

## Achado importante — "Dose Dupla"
"Dose Dupla" é **cortesia** (registrada com **faturamento R$ 0**) e **não tem
nenhuma venda aos domingos** — só de **seg a sáb**, com **pico na sexta**.
Por isso ela é **separada dos demais** e mostrada num painel próprio (quantidade
por dia da semana), sem poluir os gráficos de receita dos domingos.

## Minas Gerais — análise à parte
O sistema das lojas de **MG está com erro que não retorna o horário** (hora nula
em **100%** dos registros de domingo). Por isso MG:
- **Não** entra no gráfico "vendas por hora" nem no mapa/KPIs por hora;
- É analisado **separadamente** (bloco `mg` no JS), considerando os valores **sem hora**
  → **R$ 847 · 29 doses · 9 domingos**, com ranking próprio de sabores (LIMÃO na frente).
- Há um **aviso** no topo (insights) explicando o motivo.

> Obs.: os `NULL` de hora das demais UFs **não** são considerados (o RJ, por ex., tem
> lançamentos consolidados sem hora com quantidade anômala). O tratamento de NULL é
> exclusivo de MG, como solicitado.

## Villa Lobos (base Zig) — análise à parte (igual Minas Gerais)
A loja **ESP VILLA LOBOS** vem de outra base (`bd_zig`, produto `CAIP CACHAÇA`, SP)
via `sql/villa_lobos.sql`. O **horário do Zig não é confiável**: 154 registros vêm de
um **import em lote no mesmo carimbo `03:20`** (concentraria 599 doses às 3h). Por isso ela
é tratada **100% à parte, como Minas Gerais**:
- **NÃO** entra em totais, mapa, SP, KPIs nem no gráfico por hora;
- Tem um **painel próprio** (`villa` no JS, `porProduto`) com callout + ranking dos sabores de cachaça
  (LIMÃO lidera) e um **aviso** no topo. Volume nos domingos: **R$ 3.884 · 116 doses · 10 domingos**.

> Filtro `type <> 'Tip'` foi feito **NULL-safe** (`type IS NULL OR type <> 'Tip'`) para
> não perder as vendas sem `type` (o carimbo `03:20` não atrapalha, pois Villa não entra no
> gráfico por hora). Para **só** as vendas com horário real (type `Normal`), troque por
> `AND v.type <> 'Tip'` (perde ~87% do volume).

## Filtros
- **Sidebar**: filtro por **UF** (única opção, conforme pedido).
- **Mapa do Brasil**: clique num estado para filtrar a análise por região
  (clique de novo para limpar). Sincronizado com o filtro da sidebar.
