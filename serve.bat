@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   分帳 App 本機預覽：http://localhost:8123
echo   只有這台電腦連得到。關掉這個視窗就會停止。
echo.
start "" http://localhost:8123
python -m http.server 8123 --bind 127.0.0.1
