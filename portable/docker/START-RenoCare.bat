@echo off
chcp 65001 >nul
setlocal
title RenoCare (Docker)
cd /d "%~dp0"
call "%~dp0usb\env.cmd"

echo ==============================================
echo   RenoCare (Docker จากแฟลชไดร์ฟ)
echo ==============================================

docker info >nul 2>&1
if errorlevel 1 (
  echo [!] ยังไม่ได้เปิด Docker Desktop - เปิดก่อน รอจนขึ้นว่า Engine running แล้วลองใหม่
  goto :fail
)

echo • สร้าง/เปิด container (ครั้งแรกในเครื่องนี้ต้องต่อเน็ต และใช้เวลาหลายนาที)...
%COMPOSE% up -d --build
if errorlevel 1 goto :fail

echo • รอฐานข้อมูลพร้อม...
set /a TRIES=0
:waitdb
set "H="
for /f %%s in ('docker inspect -f "{{.State.Health.Status}}" renocare_usb_db 2^>nul') do set "H=%%s"
if "%H%"=="healthy" goto :dbready
set /a TRIES+=1
if %TRIES% gtr 90 (
  echo [!] ฐานข้อมูลไม่พร้อมภายใน 3 นาที ดู: docker logs renocare_usb_db
  goto :fail
)
timeout /t 2 /nobreak >nul
goto :waitdb
:dbready

rem ── ข้อมูลในแฟลชไดร์ฟใหม่กว่าใน Docker เครื่องนี้ → กู้จากแฟลชไดร์ฟ ──
set "USBSTAMP="
set /p USBSTAMP=<data\STAMP.txt
docker exec renocare_usb_db rm -rf /tmp/usb >nul 2>&1
docker cp usb renocare_usb_db:/tmp/usb >nul
set "DBSTAMP="
for /f %%v in ('docker exec renocare_usb_db sh /tmp/usb/usb.sh stamp') do set "DBSTAMP=%%v"
if "%DBSTAMP%"=="%USBSTAMP%" (
  echo • ข้อมูลใน Docker ตรงกับแฟลชไดร์ฟแล้ว [%USBSTAMP%]
) else (
  echo • นำข้อมูลจากแฟลชไดร์ฟเข้า Docker [%USBSTAMP%]
  docker cp data renocare_usb_db:/tmp/usb/in >nul
  docker exec renocare_usb_db sh /tmp/usb/usb.sh restore %USBSTAMP%
  if errorlevel 1 goto :fail
)

rem เปิดเบราว์เซอร์เมื่อ gateway ตอบ
set /a TRIES=0
:waitweb
curl -s -o nul http://localhost:%GATEWAY_PORT%/health && goto :webready
set /a TRIES+=1
if %TRIES% gtr 60 goto :webready
timeout /t 1 /nobreak >nul
goto :waitweb
:webready
echo.
echo   พร้อมใช้งาน → http://localhost:%GATEWAY_PORT%
echo   phpMyAdmin  → http://localhost:%PMA_PORT%  (root / root)
echo.
echo   ใช้เสร็จแล้ว: ดับเบิลคลิก STOP-RenoCare.bat (บันทึกข้อมูลลงแฟลชไดร์ฟ + ปิด container)
echo.
if not defined NO_BROWSER start "" http://localhost:%GATEWAY_PORT%
if not defined NO_PAUSE pause
exit /b 0

:fail
echo.
echo เปิดระบบไม่สำเร็จ ดูข้อความด้านบน
if not defined NO_PAUSE pause
exit /b 1
