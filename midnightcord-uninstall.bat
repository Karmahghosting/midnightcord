@echo off
:: Wrapper .bat pour lancer midnightcord-uninstall.ps1 facilement (double-clic)
title Midnightcord — Désinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0midnightcord-uninstall.ps1"
if %errorlevel% neq 0 pause
