@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
call "%~dp0usb\env.cmd"

rem บันทึกข้อมูลใน Docker เครื่องนี้ลงแฟลชไดร์ฟ (โฟลเดอร์ data\) — ระบบยังเปิดอยู่ต่อได้
docker inspect renocare_usb_db >nul 2>&1
if errorlevel 1 (
  echo [!] ไม่พบ container renocare_usb_db - เปิดด้วย START-RenoCare.bat ก่อน
  goto :fail
)

echo • บันทึกข้อมูลลงแฟลชไดร์ฟ...
docker exec renocare_usb_db rm -rf /tmp/usb >nul 2>&1
docker cp usb renocare_usb_db:/tmp/usb >nul
docker exec renocare_usb_db sh /tmp/usb/usb.sh dump %COMPUTERNAME% >nul
if errorlevel 1 goto :fail

rem เขียนลงโฟลเดอร์ชั่วคราวก่อน ครบแล้วค่อยแทนที่ของเดิม (กันข้อมูลครึ่ง ๆ กลาง ๆ ถ้าดึงแฟลชไดร์ฟออกกลางทาง)
if exist data.new rmdir /s /q data.new
docker cp renocare_usb_db:/tmp/usb/out data.new >nul
if errorlevel 1 goto :fail
if not exist data.new\STAMP.txt goto :fail
if exist data.old rmdir /s /q data.old
if exist data ren data data.old
ren data.new data
if exist data.old rmdir /s /q data.old

set /p STAMP=<data\STAMP.txt
echo • บันทึกแล้ว [%STAMP%]
if not defined NO_PAUSE pause
exit /b 0

:fail
echo [!] บันทึกข้อมูลไม่สำเร็จ ข้อมูลเดิมในแฟลชไดร์ฟยังอยู่ครบ
if not defined NO_PAUSE pause
exit /b 1
