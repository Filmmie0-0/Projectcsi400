FROM mysql:8.0

# ไฟล์ใน /docker-entrypoint-initdb.d รันครั้งแรกเท่านั้น (ตอน volume ยังว่าง) เรียงตามชื่อไฟล์
# 00 สร้าง database + user ของแต่ละ service, 01-03 สร้างตาราง + ข้อมูลเดโมของแต่ละ service
COPY services/ /docker-entrypoint-initdb.d/
