@echo off
chcp 65001 >nul
title Holzcord - configurar backend
cd /d "%~dp0"
echo Antes: no Supabase, abra o SQL Editor, cole supabase\migrations\0001_init.sql e execute.
echo Os segredos abaixo ficam apenas no Supabase, nao sao gravados em arquivo.
echo.
set /p REF=Project ref do Supabase (ex: abcdefghijklmnop): 
set /p LKURL=URL do LiveKit (wss://...livekit.cloud): 
set /p LKKEY=LiveKit API Key: 
set /p LKSECRET=LiveKit API Secret: 
call npx supabase login || exit /b 1
call npx supabase link --project-ref %REF% || exit /b 1
call npx supabase secrets set LIVEKIT_URL=%LKURL% LIVEKIT_API_KEY=%LKKEY% LIVEKIT_API_SECRET=%LKSECRET% || exit /b 1
call npx supabase functions deploy livekit-token || exit /b 1
echo Pronto. Agora rode iniciar.bat
pause
