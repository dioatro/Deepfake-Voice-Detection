@echo off
title AI-Generated Voice Detection Web Server
echo ===================================================
echo Starting AI-Generated Voice Detection Web Portal...
echo ===================================================
cd /d "%~dp0"
start http://127.0.0.1:8000
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
