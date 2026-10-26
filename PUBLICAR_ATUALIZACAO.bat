@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ATENCAO: este comando substitui os 6 Parquets apos validacao e backup.
choice /C SN /M "Deseja publicar"
if errorlevel 2 exit /b 0
python atualizar_preditiva.py --publicar
if errorlevel 1 goto erro
echo.
echo PUBLICACAO LOCAL CONCLUIDA. Aguarde o Google Drive sincronizar.
pause
exit /b 0
:erro
echo.
echo FALHA. Confira o erro acima e os backups.
pause
exit /b 1
