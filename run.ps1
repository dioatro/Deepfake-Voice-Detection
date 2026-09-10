Write-Host "Starting AI Voice Detection Web Server on http://127.0.0.1:8000..." -ForegroundColor Cyan
Start-Process "http://127.0.0.1:8000"
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
