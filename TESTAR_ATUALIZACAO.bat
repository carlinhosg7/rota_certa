@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -m pip install pandas openpyxl pyarrow xlrd
if errorlevel 1 goto erro
python atualizar_preditiva.py
if errorlevel 1 goto erro
echo.
echo TESTE CONCLUIDO. Confira o relatorio antes de publicar.
pause
exit /b 0
:erro
echo.
echo FALHA. Nenhum arquivo ativo deve ser alterado neste modo.
pause
exit /b 1
