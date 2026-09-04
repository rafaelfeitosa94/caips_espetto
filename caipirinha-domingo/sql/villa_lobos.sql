-- ============================================================
--  CAIPIRINHA (CACHACA) - ESP VILLA LOBOS  (base bd_zig / Zig)
--  Produto LIKE '%CAIP CACHACA%' (caipirinha de cachaca), UF=SP.
--  Mesmas colunas do caipirinha.sql para unir no extract.ps1.
--  type<>'Tip' de forma NULL-safe (mantem vendas sem type,
--  descarta apenas gorjetas 'Tip').
-- ============================================================
SELECT
    'ESP VILLA LOBOS'                       AS LOJA,
    CAST(v.eventDate AS DATE)               AS DATA,
    datepart(hour, v.eventDate)             AS HORA,
    v.productName                           AS PRODUTO,
    SUM(v.count)                            AS QTD,
    SUM(v.totalValue_float)                 AS FATURAMENTO,
    'ESPETTO'                               AS MARCA,
    'SP'                                    AS UF
FROM bd_zig.dbo.BD_PRODUTOS v
WHERE v.eventDate >= '__DT_INI__'
    AND (v.type IS NULL OR v.type <> 'Tip')
    AND v.productName LIKE '%CAIP CACHAÇA%'
GROUP BY
    CAST(v.eventDate AS DATE),
    v.eventDate,
    v.productId,
    v.productName,
    v.count;
