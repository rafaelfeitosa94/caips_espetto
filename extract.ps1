$ErrorActionPreference = "Stop"
# ============================================================
#  EXTRACAO - PAINEL CAIPIRINHA (ESPETTO CARIOCA)
#  Padrao dos dashboards do BI: System.Data.SqlClient
#  (evita o bug de parsing do Invoke-Sqlcmd/SQLPS).
#
#  Recorte aplicado aqui:
#    - ignora linhas com HORA nula
#    - considera SOMENTE domingos (DayOfWeek = Sunday)
#  Saida: data/caipirinha.js  ->  window.CAIPI = { ... }
#         agregado por UF x HORA x PRODUTO (soma qtd/fat).
# ============================================================

# ---- Configuracao ----
$DtIni = "2026-06-01"

$ServerCandidates = @("ad01\bartender", "192.168.0.39\bartender")
$Db   = "master"
$User = "RAFA_BI"
$Pass = "Resmosogato"

$Base   = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$OutDir = Join-Path $Base "data"
$SqlDir = Join-Path $Base "sql"

# ---- Conexao (tenta os servidores em ordem) ----
$ConnStr = $null
foreach ($srv in $ServerCandidates) {
    $test = "Server=$srv;Database=$Db;User Id=$User;Password=$Pass;TrustServerCertificate=True;Connect Timeout=8"
    try {
        $c = New-Object System.Data.SqlClient.SqlConnection $test
        $c.Open(); $c.Close()
        $ConnStr = "Server=$srv;Database=$Db;User Id=$User;Password=$Pass;TrustServerCertificate=True;Connect Timeout=60"
        Write-Host "Conectado ao SQL Server em: $srv"
        break
    } catch {
        Write-Host "Sem conexao em $srv ($($_.Exception.Message))"
    }
}
if (-not $ConnStr) { throw "Nao foi possivel conectar ao SQL Server ($($ServerCandidates -join ', '))." }

function Get-SqlTextUtf8($path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}
function Run-Query($query, $timeout = 600) {
    $cn = New-Object System.Data.SqlClient.SqlConnection $ConnStr
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $query
        $cmd.CommandTimeout = $timeout
        $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
        $dt = New-Object System.Data.DataTable
        [void]$da.Fill($dt)
        return ,$dt
    } finally { $cn.Close() }
}

# ---- Query ----
$query = (Get-SqlTextUtf8 (Join-Path $SqlDir "caipirinha.sql")).Replace('__DT_INI__', $DtIni)
Write-Host "=== Rodando CAIPIRINHA (a partir de $DtIni) ==="
$dt = Run-Query $query 600
Write-Host "Linhas brutas: $($dt.Rows.Count)"

# ---- Recorte + agregacao (UF x HORA x PRODUTO, so DOMINGOS, hora nao-nula) ----
$agg     = @{}                      # chave "uf|hora|produto" -> objeto
$domingos = New-Object System.Collections.Generic.HashSet[string]
$ignoradasHora = 0
$naoDomingo    = 0

# --- Dose Dupla (excecao ao recorte de domingo): qtd por dia da semana (todos os dias) ---
# Dose Dupla e cortesia/promo -> valTotal costuma ser 0; o que importa e a quantidade.
$diasNome = @('Dom','Seg','Ter','Qua','Qui','Sex','Sab')
$doseWD   = @(0,0,0,0,0,0,0)        # indexado por [int]DayOfWeek (0=Dom)
$doseFat  = 0.0
$doseQtdTot = 0.0
# datas distintas por dia da semana (p/ media da dose dupla = qtd / nº daquele dia)
$diaDatas = @( (New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]'),(New-Object 'System.Collections.Generic.HashSet[string]') )

# --- MG a parte: o sistema de MG NAO retorna o horario (hora sempre nula),
#     entao MG fica de fora do grafico por hora. Aqui agregamos os DOMINGOS de
#     MG por produto (considerando os registros com hora nula) para analise separada. ---
$mgAgg      = @{}
$mgDomingos = New-Object System.Collections.Generic.HashSet[string]
$mgLinhas   = 0

foreach ($r in $dt.Rows) {
    $d      = [datetime]$r.DATA
    $isSun  = ($d.DayOfWeek -eq [System.DayOfWeek]::Sunday)
    $pNome  = ([string]$r.PRODUTO).Trim()
    $uf     = if ($r.UF -is [System.DBNull] -or [string]::IsNullOrWhiteSpace([string]$r.UF)) { "N/D" } else { ([string]$r.UF).Trim().ToUpper() }
    $q      = [double]$r.QTD
    $f      = [double]$r.FATURAMENTO
    $horaNula = ($r.HORA -is [System.DBNull] -or $null -eq $r.HORA)

    [void]$diaDatas[[int]$d.DayOfWeek].Add($d.ToString("yyyy-MM-dd"))

    # MG (domingos, QUALQUER hora - inclusive nula)
    if ($isSun -and $uf -eq 'MG') {
        [void]$mgDomingos.Add($d.ToString("yyyy-MM-dd"))
        $mgLinhas++
        if (-not $mgAgg.ContainsKey($pNome)) { $mgAgg[$pNome] = [ordered]@{ produto = $pNome; qtd = 0.0; fat = 0.0 } }
        $mgAgg[$pNome].qtd += $q
        $mgAgg[$pNome].fat += $f
    }

    # --- dose dupla (todos os dias, apenas hora nao nula) ---
    if (-not $horaNula -and $pNome -match '^\s*DOSE\s+DUPLA') {
        $doseWD[[int]$d.DayOfWeek] += $q
        $doseFat    += $f
        $doseQtdTot += $q
    }

    # --- analise principal: hora nao nula + domingo ---
    if ($horaNula) { $ignoradasHora++; continue }
    if (-not $isSun) { $naoDomingo++; continue }

    [void]$domingos.Add($d.ToString("yyyy-MM-dd"))
    $h = [int]$r.HORA
    $k = "$uf|$h|$pNome"
    if (-not $agg.ContainsKey($k)) {
        $agg[$k] = [ordered]@{ uf = $uf; hora = $h; produto = $pNome; qtd = 0.0; fat = 0.0 }
    }
    $agg[$k].qtd += $q
    $agg[$k].fat += $f
}

$mgRows  = @($mgAgg.Values | Sort-Object { -[double]$_.fat })
$mgFat = 0.0; $mgQtd = 0.0
foreach ($o in $mgRows) { $mgFat += [double]$o.fat; $mgQtd += [double]$o.qtd }
Write-Host "MG a parte -> linhas=$mgLinhas domingos=$($mgDomingos.Count) qtd=$mgQtd fat=$mgFat"

# ============================================================
#  VILLA LOBOS (base bd_zig / Zig) - CAIP CACHACA, UF=SP.
#  O carimbo de hora do Zig NAO e confiavel (import em lote no
#  mesmo timestamp 03:20). Tratada 100% A PARTE (igual MG):
#  NAO entra em totais/mapa/SP nem no grafico por hora; vai
#  para um painel proprio agregado por produto.
# ============================================================
$villaAgg = @{}
$villaFat = 0.0; $villaQtd = 0.0
$villaDom = New-Object System.Collections.Generic.HashSet[string]
try {
    $villaQuery = (Get-SqlTextUtf8 (Join-Path $SqlDir "villa_lobos.sql")).Replace('__DT_INI__', $DtIni)
    Write-Host "=== Rodando VILLA LOBOS (Zig) ==="
    $dtV = Run-Query $villaQuery 600
    Write-Host "Villa linhas brutas: $($dtV.Rows.Count)"
    foreach ($r in $dtV.Rows) {
        $d = [datetime]$r.DATA
        if ($d.DayOfWeek -ne [System.DayOfWeek]::Sunday) { continue }
        $p = ([string]$r.PRODUTO).Trim()
        $q = [double]$r.QTD
        $f = [double]$r.FATURAMENTO
        [void]$villaDom.Add($d.ToString("yyyy-MM-dd"))
        $villaFat += $f; $villaQtd += $q
        if (-not $villaAgg.ContainsKey($p)) { $villaAgg[$p] = [ordered]@{ produto = $p; qtd = 0.0; fat = 0.0 } }
        $villaAgg[$p].qtd += $q
        $villaAgg[$p].fat += $f
    }
    Write-Host "Villa Lobos a parte (domingos) -> qtd=$villaQtd fat=$villaFat domingos=$($villaDom.Count)"
} catch {
    Write-Host "AVISO: falha ao carregar Villa Lobos (bd_zig): $($_.Exception.Message)"
}
$villaRows = @($villaAgg.Values | Sort-Object { -[double]$_.fat })

$rows = @($agg.Values | Sort-Object { $_.uf }, { [int]$_.hora }, { $_.produto })
Write-Host "Ignoradas (hora nula): $ignoradasHora | Nao-domingo: $naoDomingo | Domingos distintos: $($domingos.Count) | Linhas agregadas: $($rows.Count)"

# ---- Escrita data/caipirinha.js ----
$null = New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function JsNum($v) { return ([string][double]$v).Replace(',', '.') }
function JsStr($v) {
    $s = [string]$v
    $s = $s -replace '\\', '\\\\'
    $s = $s -replace '"', '\"'
    $s = $s -replace "`r", '' -replace "`n", ' '
    return '"' + $s + '"'
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("/* Gerado por extract.ps1 - NAO editar a mao */")
[void]$sb.AppendLine("window.CAIPI = {")
[void]$sb.AppendLine('  geradoEm: ' + (JsStr ((Get-Date).ToString("dd/MM/yyyy HH:mm"))) + ',')
[void]$sb.AppendLine('  dtIni: ' + (JsStr $DtIni) + ',')
[void]$sb.AppendLine('  domingos: ' + $domingos.Count + ',')
# bloco Dose Dupla (contexto seg-sab; cortesia com faturamento ~0)
$doseParts = for ($i = 0; $i -lt 7; $i++) { '{dia:' + (JsStr $diasNome[$i]) + ', qtd:' + (JsNum $doseWD[$i]) + ', dias:' + $diaDatas[$i].Count + '}' }
[void]$sb.AppendLine('  doseDupla: {')
[void]$sb.AppendLine('    qtdTotal: ' + (JsNum $doseQtdTot) + ',')
[void]$sb.AppendLine('    fatTotal: ' + (JsNum $doseFat) + ',')
[void]$sb.AppendLine('    qtdDomingo: ' + (JsNum $doseWD[0]) + ',')
[void]$sb.AppendLine('    porDia: [' + ($doseParts -join ', ') + ']')
[void]$sb.AppendLine('  },')
# bloco MG (analise a parte - sistema de MG nao retorna horario)
$mgParts = foreach ($o in $mgRows) { '{produto:' + (JsStr $o.produto) + ', qtd:' + (JsNum $o.qtd) + ', fat:' + (JsNum $o.fat) + '}' }
[void]$sb.AppendLine('  mg: {')
[void]$sb.AppendLine('    linhas: ' + $mgLinhas + ',')
[void]$sb.AppendLine('    domingos: ' + $mgDomingos.Count + ',')
[void]$sb.AppendLine('    qtd: ' + (JsNum $mgQtd) + ',')
[void]$sb.AppendLine('    fat: ' + (JsNum $mgFat) + ',')
[void]$sb.AppendLine('    porProduto: [' + ($mgParts -join ', ') + ']')
[void]$sb.AppendLine('  },')
# bloco Villa Lobos (Zig) - horario nao confiavel -> analise a parte (igual MG)
$villaParts = foreach ($o in $villaRows) { '{produto:' + (JsStr $o.produto) + ', qtd:' + (JsNum $o.qtd) + ', fat:' + (JsNum $o.fat) + '}' }
[void]$sb.AppendLine('  villa: {')
[void]$sb.AppendLine('    loja: "ESP VILLA LOBOS",')
[void]$sb.AppendLine('    uf: "SP",')
[void]$sb.AppendLine('    qtd: ' + (JsNum $villaQtd) + ',')
[void]$sb.AppendLine('    fat: ' + (JsNum $villaFat) + ',')
[void]$sb.AppendLine('    domingos: ' + $villaDom.Count + ',')
[void]$sb.AppendLine('    porProduto: [' + ($villaParts -join ', ') + ']')
[void]$sb.AppendLine('  },')
[void]$sb.AppendLine('  rows: [')
$lines = foreach ($o in $rows) {
    '    {uf:' + (JsStr $o.uf) + ', hora:' + [int]$o.hora + ', produto:' + (JsStr $o.produto) + ', qtd:' + (JsNum $o.qtd) + ', fat:' + (JsNum $o.fat) + '}'
}
[void]$sb.AppendLine(($lines -join ",`r`n"))
[void]$sb.AppendLine('  ]')
[void]$sb.AppendLine("};")

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$outJs = Join-Path $OutDir "caipirinha.js"
[System.IO.File]::WriteAllText($outJs, $sb.ToString(), $utf8Bom)

Write-Host "=== OK -> $outJs ==="
Get-ChildItem $OutDir | Select-Object Name, Length
