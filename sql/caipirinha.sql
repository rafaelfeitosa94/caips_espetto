-- ============================================================
--  CAIPIRINHA - ESPETTO CARIOCA
--  Vendas de produtos "caipirinha" a partir de __DT_INI__
--  Granularidade: dia x hora x loja x produto x UF
--  O recorte (domingos, hora nao-nula) e a agregacao final
--  sao feitos no extract.ps1 / no proprio painel.
-- ============================================================
SELECT
    lojas                                   AS LOJA,
    dataVenda                               AS DATA,
    datepart(hour, datHoraLancamento)       AS HORA,
    descricaoProduto                        AS PRODUTO,
    sum(quantidade)                         AS QTD,
    sum(valTotal)                           AS FATURAMENTO,
    'ESPETTO'                               AS MARCA,
    UF
FROM bd_espetto_2025.dbo.BD_PRODUTOS_V2
LEFT JOIN bd_espetto_2025.dbo.BD_LOJAS_DEGUST
    ON bd_espetto_2025.dbo.BD_PRODUTOS_V2.codLoja = bd_espetto_2025.dbo.BD_LOJAS_DEGUST.id
WHERE dataVenda >= '__DT_INI__'
    AND cancelado = 'N'
    AND descricaoProduto LIKE '%caipirinha%'
GROUP BY
    dataVenda,
    datHoraLancamento,
    lojas,
    descricaoProduto,
    UF;
