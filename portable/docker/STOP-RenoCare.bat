@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
call "%~dp0usb\env.cmd"

set NO_PAUSE_SAVE=%NO_PAUSE%
set NO_PAUSE=1
call "%~dp0SAVE-data.bat"
if errorlevel 1 (
  echo [!] ยังไม่ปิด container เพราะบันทึกข้อมูลไม่สำเร็จ
  if not defined NO_PAUSE_SAVE pause
  exit /b 1
)

echo • ปิด container...
%COMPOSE% stop
echo ปิดเรียบร้อย ถอดแฟลชไดร์ฟได้
if not defined NO_PAUSE_SAVE pause
