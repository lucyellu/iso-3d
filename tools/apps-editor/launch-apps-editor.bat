@echo off
setlocal

set PORT=8766
set DIR=%~dp0

netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo Editor already running on port %PORT%
) else (
    echo Starting apps editor on port %PORT%...
    start /min "Apps editor server" cmd /c "cd /d %DIR% && python server.py %PORT%"
    timeout /t 2 /nobreak >nul
)

set CHROME=
for %%P in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%P set CHROME=%%P
)

if defined CHROME (
    start "" %CHROME% --new-window "http://127.0.0.1:%PORT%/__editor"
) else (
    start "" "http://127.0.0.1:%PORT%/__editor"
)

endlocal
