@echo off
echo =================================
echo InvoiceKit Logo Patch Installer
echo =================================
echo.

cd /d %~dp0

if not exist server.js (
echo server.js not found in this folder.
pause
exit
)

echo Creating backup of server.js...
copy server.js server-backup.js >nul

echo.
echo Applying patch using PowerShell...

powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content 'server.js' -Raw) -replace 'app.use\(express.json\(\)\);','app.use(express.json({ limit: \"10mb\" }));' -replace 'const body = req.body \|\| \{\};','const body = req.body || {};`nconst logo = body.logo;' | Set-Content 'server.js'"

echo.
echo Patch completed successfully.
echo.

pause