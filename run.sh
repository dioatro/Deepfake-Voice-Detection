#!/bin/bash

echo "==================================================="
echo "Starting AI-Generated Voice Detection Web Portal..."
echo "==================================================="

# Change directory to where the script is located (equivalent to cd /d "%~dp0")
cd "$(dirname "$0")" || exit

# Open the browser depending on the operating system
if command -v open > /dev/null; then
    # macOS command
    open http://127.0.0.1:8000
elif command -v xdg-open > /dev/null; then
    # Linux command
    xdg-open http://127.0.0.1:8000
else
    echo "Please open http://127.0.0.1:8000 manually in your browser."
fi

# Start the server (Unix systems typically use 'python3' instead of 'python')
python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload

# Pause before exiting (equivalent to pause)
read -p "Press Enter to exit..."