/* ==========================================================
   Painel Caipirinha aos Domingos — Espetto Carioca
   Lê window.CAIPI (data/caipirinha.js) e monta os visuais.
   ========================================================== */
(function () {
  "use strict";

  var DATA = (window.CAIPI && window.CAIPI.rows) ? window.CAIPI.rows : [];
  var DOMINGOS = (window.CAIPI && window.CAIPI.domingos) || 0;
  var GERADO = (window.CAIPI && window.CAIPI.geradoEm) || "";

  // ---- estado global ----
  var state = { uf: null, metric: "fat" };

  // ---- cores ----
  var C = {
    orange: "#ff7a1a", orangeSoft: "#ffa04d", muted: "#3a4150", mutedTxt: "#98a2b3",
    blue: "#3aa0ff", green: "#28c076", grid: "#242b36", track: "#2a313d"
  };

  // ---- helpers ----
  function isDose(p) { return /^\s*DOSE\s+DUPLA/i.test(p || ""); }
  function brl(v) {
    return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  function num(v) { return (v || 0).toLocaleString("pt-BR"); }
  function hLabel(h) { return String(h).padStart(2, "0") + "h"; }
  function doses(v) { return (Math.round(v * 10) / 10).toLocaleString("pt-BR") + " doses"; }
  function shortProd(p) {
    return (p || "")
      .replace(/^CAIPIRINHA\s*/i, "")
      .replace(/^CAIP\s+CACHA[ÇC]A\s+PREMIUM\s*/i, "Cachaça Prem. ")
      .replace(/^CAIP\s+CACHA[ÇC]A\s*/i, "Cachaça ")
      .replace(/^CAIP\s*/i, "");
  }

  // ---- tooltips: total + média ----
  function tipBox(title, rowsHTML) {
    return '<div style="background:#1b202a;border:1px solid #2a313d;border-radius:8px;padding:8px 11px;font-size:12px;box-shadow:0 8px 20px rgba(0,0,0,.55)">' +
      '<div style="color:#cfd6e0;font-weight:700;margin-bottom:5px">' + title + '</div>' + rowsHTML + '</div>';
  }
  function tipRow(color, label, value) {
    var dot = (color === "none")
      ? '<span style="width:9px;height:9px;display:inline-block"></span>'
      : '<span style="width:9px;height:9px;border-radius:50%;background:' + color + ';display:inline-block;flex:0 0 auto"></span>';
    return '<div style="display:flex;align-items:center;gap:7px;padding:1px 0">' + dot +
      '<span style="color:#98a2b3">' + label + '</span>&nbsp;<b style="color:#eef1f5">' + value + '</b></div>';
  }
  // o: {label, color(str|fn(i,w)), fmt(v), divisor(num|fn(i)), avgLabel}
  function tipTotalAvg(o) {
    return function (ctx) {
      var w = ctx.w, i = ctx.dataPointIndex, si = ctx.seriesIndex || 0;
      var val = w.globals.series[si][i];
      var labels = (w.globals.labels && w.globals.labels.length) ? w.globals.labels : (w.config.xaxis.categories || []);
      var title = (labels[i] != null ? labels[i] : "");
      var color = (typeof o.color === "function") ? o.color(i, w) : o.color;
      var div = (typeof o.divisor === "function") ? o.divisor(i) : o.divisor;
      var avg = div ? val / div : 0;
      return tipBox(title,
        tipRow(color, o.label + ":", o.fmt(val)) +
        tipRow("none", (o.avgLabel || "Média/domingo") + ":", o.fmt(avg))
      );
    };
  }
  function barColor(i, w) { return (w.globals.colors && w.globals.colors[i]) || C.orange; }

  var UF_NOMES = { RJ: "Rio de Janeiro", SP: "São Paulo", GO: "Goiás", MG: "Minas Gerais", BA: "Bahia", "N/D": "Não definido" };

  function rowsFor(uf) {
    if (!uf) return DATA;
    return DATA.filter(function (r) { return r.uf === uf; });
  }

  // agrega por hora -> {qtd, fat}
  function byHora(rows) {
    var m = {};
    for (var h = 0; h < 24; h++) m[h] = { qtd: 0, fat: 0 };
    rows.forEach(function (r) {
      if (r.hora < 0 || r.hora > 23) return;  // Villa Lobos (hora=-1): fora do gráfico por hora
      m[r.hora].qtd += r.qtd; m[r.hora].fat += r.fat;
    });
    return m;
  }
  function horaTotalFat(hm) { var s = 0; for (var h = 0; h < 24; h++) s += hm[h].fat; return s; }
  function byUF(rows) {
    var m = {};
    rows.forEach(function (r) { (m[r.uf] = m[r.uf] || { qtd: 0, fat: 0 }); m[r.uf].qtd += r.qtd; m[r.uf].fat += r.fat; });
    return m;
  }
  function totals(rows) {
    var t = { qtd: 0, fat: 0 };
    rows.forEach(function (r) { t.qtd += r.qtd; t.fat += r.fat; });
    return t;
  }
  // melhor janela de 3h consecutivas (por faturamento)
  function bestWindow(hm) {
    var best = { start: null, fat: -1, qtd: 0 };
    for (var h = 0; h <= 21; h++) {
      var f = hm[h].fat + hm[h + 1].fat + hm[h + 2].fat;
      if (f > best.fat) best = { start: h, fat: f, qtd: hm[h].qtd + hm[h + 1].qtd + hm[h + 2].qtd };
    }
    return best;
  }
  function bestHour(hm) {
    var best = { h: null, fat: -1 };
    for (var h = 0; h < 24; h++) if (hm[h].fat > best.fat) best = { h: h, fat: hm[h].fat };
    return best;
  }

  // =========================================================
  //  SIDEBAR — filtro UF
  // =========================================================
  function buildUFList() {
    var ufTot = byUF(DATA);
    var ufs = Object.keys(ufTot).sort(function (a, b) { return ufTot[b].fat - ufTot[a].fat; });
    var host = document.getElementById("ufList");
    var html = "";
    html += ufBtnHTML(null, "Todas as UFs", totals(DATA).fat);
    ufs.forEach(function (u) { html += ufBtnHTML(u, u + " · " + (UF_NOMES[u] || u), ufTot[u].fat); });
    host.innerHTML = html;
    host.querySelectorAll(".uf-btn").forEach(function (b) {
      b.addEventListener("click", function () { setUF(b.dataset.uf || null); });
    });
  }
  function ufBtnHTML(uf, label, fat) {
    var active = (state.uf === uf || (!state.uf && uf === null)) ? " active" : "";
    return '<button class="uf-btn' + active + '" data-uf="' + (uf || "") + '">' +
      '<span>' + label + '</span><span class="cnt">' + brl(fat) + '</span></button>';
  }

  function setUF(uf) {
    state.uf = uf;
    document.querySelectorAll(".uf-btn").forEach(function (b) {
      var v = b.dataset.uf || null;
      b.classList.toggle("active", (v === uf) || (!uf && v === null));
    });
    highlightMap();
    renderChip();
    renderAll();
  }

  function renderChip() {
    var wrap = document.getElementById("chipWrap");
    var desc = document.getElementById("filtroDesc");
    if (state.uf) {
      wrap.innerHTML = '<span class="chip">UF: <b>' + state.uf + '</b> <span class="x" id="clrChip">✕</span></span>';
      desc.textContent = state.uf + " — " + (UF_NOMES[state.uf] || state.uf);
      document.getElementById("clrChip").addEventListener("click", function () { setUF(null); });
    } else {
      wrap.innerHTML = '<span class="chip">Todas as UFs</span>';
      desc.textContent = "todas as UFs";
    }
  }

  // =========================================================
  //  KPIs
  // =========================================================
  function renderKPIs() {
    var rows = rowsFor(state.uf);
    var t = totals(rows);
    var hm = byHora(rows);
    var bh = bestHour(hm);
    var janela1218 = 0;
    for (var h = 12; h <= 18; h++) janela1218 += hm[h].fat;
    var hourTot = horaTotalFat(hm);
    var pct1218 = hourTot ? Math.round(janela1218 / hourTot * 100) : 0;
    var ticket = t.qtd ? t.fat / t.qtd : 0;

    var kpis = [
      { lbl: "Faturamento (domingos)", val: brl(t.fat), foot: DOMINGOS + " domingos" },
      { lbl: "Doses vendidas", val: num(t.qtd), foot: "un. de caipirinha" },
      { lbl: "Ticket médio", val: brl(ticket), foot: "por dose" },
      { lbl: "Melhor hora", val: bh.h == null ? "—" : hLabel(bh.h), foot: brl(bh.fat) },
      { lbl: "Faixa 12h–18h", val: pct1218 + "<small>%</small>", foot: brl(janela1218) }
    ];
    document.getElementById("kpis").innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><div class="lbl">' + k.lbl + '</div>' +
        '<div class="val">' + k.val + '</div><div class="foot">' + k.foot + '</div></div>';
    }).join("");
  }

  // =========================================================
  //  INSIGHT banner
  // =========================================================
  function renderInsight() {
    var rows = rowsFor(state.uf);
    var hm = byHora(rows);
    var bh = bestHour(hm);
    var bw = bestWindow(hm);

    // UF campeã: sempre sobre a base completa
    var ufTot = byUF(DATA);
    var ufTop = Object.keys(ufTot).sort(function (a, b) { return ufTot[b].fat - ufTot[a].fat; })[0];

    var items = [
      { ico: "📍", tag: "UF que mais vende", main: (ufTop || "—"), em: brl(ufTot[ufTop] ? ufTot[ufTop].fat : 0) },
      { ico: "⏰", tag: "Horário campeão", main: bh.h == null ? "—" : hLabel(bh.h), em: brl(bh.fat) },
      { ico: "🔥", tag: "Melhor período (3h)", main: bw.start == null ? "—" : (hLabel(bw.start) + "–" + hLabel(bw.start + 3)), em: brl(bw.fat) }
    ];
    var html = "";
    items.forEach(function (it, i) {
      if (i) html += '<div class="div"></div>';
      html += '<div class="tag"><span class="ico">' + it.ico + '</span><span>' + it.tag +
        '<br><b>' + it.main + '</b> <span class="em">' + it.em + '</span></span></div>';
    });
    document.getElementById("insight").innerHTML = html;
  }

  // =========================================================
  //  GRÁFICO — vendas por hora (destaque 12h–18h)
  // =========================================================
  var chartHora;
  function renderHora() {
    var rows = rowsFor(state.uf);
    var hm = byHora(rows);
    var cats = [], data = [], colors = [];
    for (var h = 8; h <= 23; h++) {           // janela operacional
      cats.push(hLabel(h));
      var v = state.metric === "fat" ? hm[h].fat : hm[h].qtd;
      data.push(+v.toFixed(2));
      colors.push((h >= 12 && h <= 18) ? C.orange : C.muted);
    }
    var isFat = state.metric === "fat";
    var opts = {
      chart: { type: "bar", height: 300, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif", animations: { speed: 400 } },
      theme: { mode: "dark" },
      series: [{ name: isFat ? "Faturamento" : "Doses", data: data }],
      plotOptions: { bar: { distributed: true, borderRadius: 5, columnWidth: "62%" } },
      colors: colors,
      legend: { show: false },
      dataLabels: { enabled: false },
      xaxis: { categories: cats, labels: { style: { colors: C.mutedTxt, fontSize: "11px" } }, axisBorder: { color: C.track }, axisTicks: { color: C.track } },
      yaxis: { labels: { style: { colors: C.mutedTxt }, formatter: function (v) { return isFat ? "R$ " + Math.round(v / 1000) + "k" : Math.round(v); } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: isFat ? "Faturamento" : "Doses", color: barColor, fmt: isFat ? brl : doses, divisor: DOMINGOS, avgLabel: "Média/domingo" }) },
      annotations: {
        xaxis: [{
          x: "12h", x2: "18h", fillColor: C.orange, opacity: 0.08,
          borderColor: "transparent",
          label: { text: "12h–18h", position: "top", orientation: "horizontal", style: { background: C.orange, color: "#1a0e04", fontSize: "10px", fontWeight: 700 } }
        }]
      }
    };
    if (chartHora) { chartHora.destroy(); }
    chartHora = new ApexCharts(document.getElementById("chartHora"), opts);
    chartHora.render();
  }

  // =========================================================
  //  GRÁFICO — janela de 3h (melhor período)
  // =========================================================
  var chartJanela;
  function renderJanela() {
    var rows = rowsFor(state.uf);
    var hm = byHora(rows);
    var bw = bestWindow(hm);

    // callout
    var host = document.getElementById("bestWindow");
    if (bw.start == null || bw.fat <= 0) {
      host.innerHTML = '<div class="txt">Sem dados para o filtro atual.</div>';
    } else {
      host.innerHTML =
        '<div class="big">' + hLabel(bw.start) + '–' + hLabel(bw.start + 3) + '</div>' +
        '<div class="txt">É a janela de 3 horas que mais fatura' + (state.uf ? " em <b>" + state.uf + "</b>" : "") +
        '.<br>Concentra <b>' + brl(bw.fat) + '</b> em <b>' + num(bw.qtd) + '</b> doses' +
        (totals(rows).fat ? ' — <b>' + Math.round(bw.fat / totals(rows).fat * 100) + '%</b> do faturamento dos domingos.' : '.') + '</div>';
    }

    // barras: cada janela de 3h dentro do horário operacional
    var cats = [], data = [], colors = [];
    for (var h = 8; h <= 20; h++) {
      var f = hm[h].fat + hm[h + 1].fat + hm[h + 2].fat;
      cats.push(hLabel(h) + "–" + hLabel(h + 3));
      data.push(+f.toFixed(2));
      colors.push(h === bw.start ? C.orange : C.muted);
    }
    var opts = {
      chart: { type: "bar", height: 190, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif" },
      theme: { mode: "dark" },
      series: [{ name: "Faturamento (janela 3h)", data: data }],
      plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "58%" } },
      colors: colors,
      legend: { show: false }, dataLabels: { enabled: false },
      xaxis: { categories: cats, labels: { style: { colors: C.mutedTxt, fontSize: "10px" }, rotate: -35, rotateAlways: true } },
      yaxis: { labels: { style: { colors: C.mutedTxt }, formatter: function (v) { return "R$ " + Math.round(v / 1000) + "k"; } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Faturamento (3h)", color: barColor, fmt: brl, divisor: DOMINGOS, avgLabel: "Média/domingo" }) }
    };
    if (chartJanela) { chartJanela.destroy(); }
    chartJanela = new ApexCharts(document.getElementById("chartJanela"), opts);
    chartJanela.render();
  }

  // =========================================================
  //  PAINEL — Dose Dupla (isolada dos demais)
  //  Dose Dupla e cortesia (faturamento 0) e NAO ocorre aos
  //  domingos; mostramos qtd por dia da semana como contexto.
  // =========================================================
  var chartDose;
  function renderDose() {
    var dd = (window.CAIPI && window.CAIPI.doseDupla) || { qtdTotal: 0, fatTotal: 0, qtdDomingo: 0, porDia: [] };

    // callout
    document.getElementById("doseCallout").innerHTML =
      '<div class="big">' + num(dd.qtdDomingo) + '</div>' +
      '<div class="txt">dose dupla vendida <b>aos domingos</b>.<br>' +
      'É <b>cortesia</b> (faturamento <span class="z">R$ 0</span>), então fica <b>separada</b> dos demais nos gráficos de receita. ' +
      'No total são <b>' + num(dd.qtdTotal) + '</b> doses (seg–sáb).</div>';

    // barras: qtd por dia da semana
    var dias = dd.porDia.map(function (d) { return d.dia; });
    var qtds = dd.porDia.map(function (d) { return d.qtd; });
    var maxIdx = qtds.indexOf(Math.max.apply(null, qtds));
    var cols = dd.porDia.map(function (d, i) { return d.dia === "Dom" ? C.muted : (i === maxIdx ? C.orange : "#4a90d9"); });

    var opts = {
      chart: { type: "bar", height: 210, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif" },
      theme: { mode: "dark" },
      series: [{ name: "Doses (dose dupla)", data: qtds }],
      plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "58%" } },
      colors: cols,
      legend: { show: false },
      dataLabels: { enabled: true, style: { colors: ["#dfe4ea"], fontSize: "10px", fontWeight: 700 } },
      xaxis: { categories: dias, labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      yaxis: { labels: { style: { colors: C.mutedTxt }, formatter: function (v) { return Math.round(v); } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Doses", color: barColor, fmt: doses, divisor: function (i) { return dd.porDia[i].dias; }, avgLabel: "Média/dia" }) }
    };
    if (chartDose) { chartDose.destroy(); }
    chartDose = new ApexCharts(document.getElementById("chartDose"), opts);
    chartDose.render();
  }

  // =========================================================
  //  MINAS GERAIS — análise à parte (sistema não retorna hora)
  // =========================================================
  function noticeHTML(text) {
    return '<div class="notice"><span class="ico">⚠️</span><span>' + text + '</span></div>';
  }
  function renderMGInsight() {
    var mg = (window.CAIPI && window.CAIPI.mg) || { fat: 0, qtd: 0, domingos: 0 };
    var villa = (window.CAIPI && window.CAIPI.villa) || null;
    var html = "";

    html += noticeHTML(
      '<b>Minas Gerais fica fora do gráfico por hora.</b> ' +
      'O sistema das lojas de MG está com <b>erro que não retorna o horário</b> da venda — ' +
      'a hora vem <b>nula em 100%</b> dos registros. Por isso MG é analisado <b>à parte</b>, ' +
      'considerando os valores sem hora: <span class="em">' + brl(mg.fat) + '</span> em <span class="em">' +
      num(mg.qtd) + ' doses</span> (' + mg.domingos + ' domingos).');

    if (villa && villa.qtd) {
      html += noticeHTML(
        '<b>Villa Lobos (SP, base Zig)</b> é analisada <b>à parte</b> (como Minas Gerais): ' +
        'os horários do Zig vêm de um <b>import em lote</b> (mesmo carimbo 03:20) e não são confiáveis, ' +
        'então ela fica <b>fora dos totais e do gráfico por hora</b>. ' +
        'Volume: <span class="em">' + brl(villa.fat) + '</span> em <span class="em">' + num(villa.qtd) + ' doses</span> (' +
        villa.domingos + ' domingos).');
    }
    document.getElementById("mgInsight").innerHTML = html;
  }

  var chartMG;
  function renderMG() {
    var mg = (window.CAIPI && window.CAIPI.mg) || { fat: 0, qtd: 0, domingos: 0, porProduto: [] };

    document.getElementById("mgCallout").innerHTML =
      '<div class="dose-callout">' +
      '<div class="big">' + brl(mg.fat) + '</div>' +
      '<div class="txt"><b>' + num(mg.qtd) + '</b> doses em <b>' + mg.domingos + '</b> domingos.<br>' +
      'Sem horário (erro do sistema em MG) — <span class="z">não entra</span> no gráfico por hora, ' +
      'mas os valores <b>são contabilizados</b> aqui.</div></div>';

    var arr = (mg.porProduto || []).slice(0, 8);
    var cats = arr.map(function (a) { return shortProd(a.produto); });
    var vals = arr.map(function (a) { return +(+a.fat).toFixed(2); });
    var cols = arr.map(function (a, i) { return i === 0 ? C.orange : "#4a90d9"; });

    var opts = {
      chart: { type: "bar", height: 210, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif" },
      theme: { mode: "dark" },
      series: [{ name: "Faturamento (MG)", data: vals }],
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: "62%" } },
      colors: cols,
      legend: { show: false },
      dataLabels: { enabled: true, textAnchor: "start", offsetX: 4, style: { colors: ["#dfe4ea"], fontSize: "10px", fontWeight: 600 }, formatter: function (v) { return brl(v); } },
      xaxis: { categories: cats, labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      yaxis: { labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Faturamento", color: barColor, fmt: brl, divisor: (mg.domingos || 1), avgLabel: "Média/domingo" }) }
    };
    if (chartMG) { chartMG.destroy(); }
    chartMG = new ApexCharts(document.getElementById("chartMG"), opts);
    chartMG.render();
  }

  // =========================================================
  //  VILLA LOBOS — análise à parte (base Zig, horário ruim)
  // =========================================================
  var chartVilla;
  function renderVilla() {
    var v = (window.CAIPI && window.CAIPI.villa) || { fat: 0, qtd: 0, domingos: 0, porProduto: [] };

    document.getElementById("villaCallout").innerHTML =
      '<div class="dose-callout">' +
      '<div class="big">' + brl(v.fat) + '</div>' +
      '<div class="txt"><b>' + num(v.qtd) + '</b> doses (cachaça) em <b>' + v.domingos + '</b> domingos.<br>' +
      'Base <b>Zig</b> com horário <span class="z">não confiável</span> — tratada <b>à parte</b>, ' +
      'fora dos totais e do gráfico por hora.</div></div>';

    var arr = (v.porProduto || []).slice(0, 8);
    var cats = arr.map(function (a) { return shortProd(a.produto); });
    var vals = arr.map(function (a) { return +(+a.fat).toFixed(2); });
    var cols = arr.map(function (a, i) { return i === 0 ? C.orange : "#4a90d9"; });

    var opts = {
      chart: { type: "bar", height: 210, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif" },
      theme: { mode: "dark" },
      series: [{ name: "Faturamento (Villa Lobos)", data: vals }],
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: "62%" } },
      colors: cols,
      legend: { show: false },
      dataLabels: { enabled: true, textAnchor: "start", offsetX: 4, style: { colors: ["#dfe4ea"], fontSize: "10px", fontWeight: 600 }, formatter: function (x) { return brl(x); } },
      xaxis: { categories: cats, labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      yaxis: { labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Faturamento", color: barColor, fmt: brl, divisor: (v.domingos || 1), avgLabel: "Média/domingo" }) }
    };
    if (chartVilla) { chartVilla.destroy(); }
    chartVilla = new ApexCharts(document.getElementById("chartVilla"), opts);
    chartVilla.render();
  }

  // =========================================================
  //  GRÁFICO — Ranking de produtos
  // =========================================================
  var chartRank;
  function renderRank() {
    var rows = rowsFor(state.uf);
    var m = {};
    rows.forEach(function (r) { (m[r.produto] = m[r.produto] || 0); m[r.produto] += r.fat; });
    var arr = Object.keys(m).map(function (p) { return { p: p, fat: m[p], dose: isDose(p) }; })
      .sort(function (a, b) { return b.fat - a.fat; }).slice(0, 12);
    var rankCols = arr.map(function (a, i) { return i === 0 ? C.orange : "#4a90d9"; });

    var opts = {
      chart: { type: "bar", height: 300, background: "transparent", toolbar: { show: false }, fontFamily: "Segoe UI, sans-serif" },
      theme: { mode: "dark" },
      series: [{ name: "Faturamento", data: arr.map(function (a) { return +a.fat.toFixed(2); }) }],
      plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: "68%" } },
      colors: rankCols,
      legend: { show: false }, dataLabels: {
        enabled: true, textAnchor: "start", offsetX: 4,
        style: { colors: ["#dfe4ea"], fontSize: "10px", fontWeight: 600 },
        formatter: function (v) { return brl(v); }
      },
      xaxis: { categories: arr.map(function (a) { return shortProd(a.p); }), labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      yaxis: { labels: { style: { colors: C.mutedTxt, fontSize: "11px" } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Faturamento", color: barColor, fmt: brl, divisor: DOMINGOS, avgLabel: "Média/domingo" }) }
    };
    if (chartRank) { chartRank.destroy(); }
    chartRank = new ApexCharts(document.getElementById("chartRank"), opts);
    chartRank.render();
  }

  // =========================================================
  //  MAPA (amCharts 5 — brazilLow) com fallback
  // =========================================================
  var mapRoot, polySeries, mapReady = false;
  function initMap() {
    if (!(window.am5 && window.am5map && window.am5geodata_brazilLow)) { mapFallback(); return; }
    try {
      mapRoot = am5.Root.new("map");
      mapRoot.setThemes([am5themes_Animated.new(mapRoot)]);
      if (mapRoot._logo) mapRoot._logo.dispose();

      var chart = mapRoot.container.children.push(am5map.MapChart.new(mapRoot, {
        panX: "none", panY: "none", wheelable: false,
        projection: am5map.geoMercator()
      }));

      polySeries = chart.series.push(am5map.MapPolygonSeries.new(mapRoot, {
        geoJSON: am5geodata_brazilLow, valueField: "value", calculateAggregates: true
      }));

      polySeries.mapPolygons.template.setAll({
        interactive: true, stroke: am5.color(0x0d0f14), strokeWidth: 0.7,
        fill: am5.color(0x232a35), tooltipText: "[bold]{name}[/]\nFaturamento: {display}\nMédia/domingo: {media}"
      });
      polySeries.set("heatRules", [{
        target: polySeries.mapPolygons.template, dataField: "value",
        min: am5.color(0x3a2a20), max: am5.color(0xff7a1a), key: "fill"
      }]);
      polySeries.mapPolygons.template.states.create("hover", { fill: am5.color(0xffa04d) });
      polySeries.mapPolygons.template.states.create("active", { stroke: am5.color(0xff7a1a), strokeWidth: 2 });

      polySeries.mapPolygons.template.events.on("click", function (ev) {
        var di = ev.target.dataItem;
        if (!di) return;
        var id = di.get("id") || "";           // "BR-RJ"
        var uf = id.replace("BR-", "");
        setUF(state.uf === uf ? null : uf);
      });

      mapReady = true;
      updateMapData();
    } catch (e) {
      console.warn("Mapa amCharts falhou, usando fallback:", e);
      mapFallback();
    }
  }

  function updateMapData() {
    if (!mapReady || !polySeries) return;
    var ufTot = byUF(DATA);
    var data = [];
    Object.keys(ufTot).forEach(function (uf) {
      if (uf === "N/D") return;
      data.push({ id: "BR-" + uf, value: Math.round(ufTot[uf].fat), display: brl(ufTot[uf].fat), media: brl(ufTot[uf].fat / (DOMINGOS || 1)) });
    });
    polySeries.data.setAll(data);
    highlightMap();
  }

  function highlightMap() {
    if (!mapReady || !polySeries) return;
    polySeries.mapPolygons.each(function (mp) {
      var di = mp.dataItem;
      var id = di ? (di.get("id") || "") : "";
      var uf = id.replace("BR-", "");
      var sel = state.uf && uf === state.uf;
      mp.set("active", !!sel);
      mp.set("fillOpacity", (!state.uf || sel) ? 1 : 0.35);
    });
  }

  // fallback: barra de UF em Apex, clicável
  function mapFallback() {
    var el = document.getElementById("map");
    el.style.height = "300px";
    var ufTot = byUF(DATA);
    var ufs = Object.keys(ufTot).filter(function (u) { return u !== "N/D"; })
      .sort(function (a, b) { return ufTot[b].fat - ufTot[a].fat; });
    var opts = {
      chart: { type: "bar", height: 300, background: "transparent", toolbar: { show: false },
        events: { dataPointSelection: function (e, ctx, cfg) { var uf = ufs[cfg.dataPointIndex]; setUF(state.uf === uf ? null : uf); } } },
      theme: { mode: "dark" },
      series: [{ name: "Faturamento", data: ufs.map(function (u) { return Math.round(ufTot[u].fat); }) }],
      plotOptions: { bar: { distributed: true, borderRadius: 5, columnWidth: "55%" } },
      colors: ufs.map(function () { return C.orange; }),
      legend: { show: false }, dataLabels: { enabled: false },
      xaxis: { categories: ufs, labels: { style: { colors: C.mutedTxt } } },
      yaxis: { labels: { style: { colors: C.mutedTxt }, formatter: function (v) { return "R$ " + Math.round(v / 1000) + "k"; } } },
      grid: { borderColor: C.grid, strokeDashArray: 4 },
      tooltip: { custom: tipTotalAvg({ label: "Faturamento", color: barColor, fmt: brl, divisor: DOMINGOS, avgLabel: "Média/domingo" }) }
    };
    new ApexCharts(el, opts).render();
  }

  // =========================================================
  //  RENDER GERAL
  // =========================================================
  function renderAll() {
    renderKPIs();
    renderInsight();
    renderHora();
    renderJanela();
    renderDose();
    renderRank();
  }

  // =========================================================
  //  INIT
  // =========================================================
  function init() {
    document.getElementById("stampTxt").textContent = "Atualizado: " + GERADO;
    document.getElementById("domingosTxt").textContent = DOMINGOS + " domingos analisados desde 01/06/2026";

    buildUFList();
    renderChip();

    // toggle métrica
    document.getElementById("tgMetric").querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.metric = b.dataset.m;
        document.getElementById("tgMetric").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
        renderHora();
      });
    });

    renderMGInsight();
    renderMG();
    renderVilla();
    renderAll();
    am5 ? am5.ready(initMap) : initMap();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
