@echo off
:: Wrapper .bat pour lancer midnightcord-install.ps1 facilement (double-clic)
title Midnightcord — Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0midnightcord-install.ps1"
if %errorlevel% neq 0 pause
