@echo off
chcp 65001 >nul
title Holzcord
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale o Node 22 em https://nodejs.org e rode de novo. & pause & exit /b 1)
if not exist .env (
  copy .env.example .env >nul
  echo Arquivo .env criado. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e rode este arquivo de novo.
  notepad .env
  exit /b 0
)
if not exist node_modules (echo Instalando dependencias... & call npm install || (pause & exit /b 1))
call npm run dev
