@echo off
REM ============================================================
REM  Painel Caipirinha aos Domingos - Espetto Carioca
REM  Sobe um servidor local e abre o painel no navegador.
REM ============================================================
cd /d "%~dp0"
echo Iniciando painel em http://localhost:5517 ...
start "" http://localhost:5517
python -m http.server 5517
