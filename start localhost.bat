@echo off
cd /d "C:\Users\mariu\Desktop\genshin-wish-calculator"

echo Starting local web server...
echo.
echo Open http://localhost:8000
echo Press Ctrl+C to stop the server.
echo.

where py >nul 2>&1
if %errorlevel%==0 (
    py -m http.server 8000
) else (
    python -m http.server 8000
)

pause