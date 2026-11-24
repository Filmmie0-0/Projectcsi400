@echo off
rem ค่าที่ใช้ร่วมกันของ START / SAVE / STOP (พอร์ตต้องตรงกับ backend\.env)
set GATEWAY_PORT=3090
set PMA_PORT=8091
set COMPOSE=docker compose -p renocare_usb -f backend\docker-compose.yml -f backend\docker-compose.usb.yml
