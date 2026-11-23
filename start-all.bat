@echo off
chcp 65001 >nul
title BENTO 3D - Robo Mediador Social (LLM Local + Whisper + 3D)
echo ============================================================================
echo   BENTO 3D - ROBÔ MEDIADOR SOCIAL ENTRE IDOSO E FAMÍLIA (BRASIL)
echo   Baseado em Noguchi, Kamide ^& Tanaka (Int. J. Social Robotics, 2023)
echo ============================================================================
echo.

REM Verifica se o KoboldCpp ja esta escutando na porta 5001
netstat -ano | findstr ":5001" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [1/2] Iniciando LLM Local ^(Qwen2.5-7B-Instruct Q4_K_M ~4.5GB VRAM^) + Whisper STT...
    start "KoboldCpp - LLM Local + Whisper" "D:\AI\text\koboldcpp\koboldcpp.exe" ^
      --model "D:\AI\text\koboldcpp\models\Qwen2.5-7B-Instruct-Q4_K_M.gguf" ^
      --whispermodel "D:\AI\text\koboldcpp\models\ggml-small-q5_1.bin" ^
      --contextsize 4096 ^
      --gpulayers 99 ^
      --flashattention ^
      --quantkv 1 ^
      --port 5001 ^
      --skiplauncher
    timeout /t 8 >nul
) else (
    echo [1/2] KoboldCpp ^(Qwen2.5-7B + Whisper^) ja esta rodando na porta 5001!
)

echo [2/2] Iniciando Servidor do Robo Mediador 3D na porta 3030...
cd /d "%~dp0"
start "" "http://localhost:3030"
node src/server.js
pause
