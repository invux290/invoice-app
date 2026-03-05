@echo off
title InvoiceKit - Fix Landing Page
echo.
echo  Running landing page route fix...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-landing.ps1"
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Script failed. See output above.
    pause
    exit /b 1
)
echo.
pause
