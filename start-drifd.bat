@echo off
title Drifd - Starting...
echo ====================================
echo    DRIFD - Starting Application
echo ====================================
echo.
echo Starting development server...
cd /d "%~dp0"
call npm run electron:dev:win
