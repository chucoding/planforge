@echo off
REM Run PlanForge CLI from repo root. Usage: planforge.cmd init | doctor | plan "goal"
set ROOT=%~dp0
node "%ROOT%packages\cli-js\dist\index.js" %*
