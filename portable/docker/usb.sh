#!/bin/sh
# รันใน container renocare_usb_db (START/SAVE.bat คัดลอกไฟล์นี้เข้าไปที่ /tmp/usb แล้วเรียก)
#   sh usb.sh stamp            พิมพ์รหัสชุดข้อมูลที่อยู่ใน DB ตอนนี้ (ว่าง = ยังไม่เคยกู้จากแฟลชไดร์ฟ)
#   sh usb.sh restore <stamp>  ล้างข้อมูลใน DB แล้วใส่ข้อมูลจาก /tmp/usb/in/*.sql
#   sh usb.sh dump <เครื่อง>    dump ข้อมูลปัจจุบันไป /tmp/usb/out/ พร้อมรหัสชุดข้อมูลใหม่
set -e
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
DBS="auth_db job_db inventory_db"
q() { mysql -uroot -N --default-character-set=utf8mb4 -e "$1"; }
set_stamp() {
  q "CREATE DATABASE IF NOT EXISTS usb_meta; CREATE TABLE IF NOT EXISTS usb_meta.stamp (v VARCHAR(64) NOT NULL);
     DELETE FROM usb_meta.stamp; INSERT INTO usb_meta.stamp VALUES ('$1');"
}

case "$1" in
  stamp)
    q "SELECT v FROM usb_meta.stamp LIMIT 1" 2>/dev/null || true
    ;;
  restore)
    for db in $DBS; do
      [ -f "/tmp/usb/in/$db.sql" ] || { echo "ไม่พบ $db.sql ในแฟลชไดร์ฟ" >&2; exit 1; }
      # trigger จากเครื่องต้นทางผูก DEFINER ไว้ → ตัดออกให้เป็นของ root ในเครื่องนี้
      sed -E 's/DEFINER=`[^`]*`@`[^`]*`//g' "/tmp/usb/in/$db.sql" | mysql -uroot --default-character-set=utf8mb4 "$db"
      echo "  - $db"
    done
    set_stamp "$2"
    ;;
  dump)
    rm -rf /tmp/usb/out && mkdir -p /tmp/usb/out
    for db in $DBS; do
      mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF \
        --no-tablespaces --default-character-set=utf8mb4 "$db" > "/tmp/usb/out/$db.sql"
    done
    # $2 = ชื่อเครื่อง Windows (SAVE-data.bat ส่ง %COMPUTERNAME% มา) ไว้ดูว่าข้อมูลชุดนี้บันทึกจากเครื่องไหน
    stamp="$(date +%Y%m%d-%H%M%S)-$(printf '%s' "${2:-pc}" | tr -cd 'A-Za-z0-9_-' | cut -c1-20)"
    printf '%s' "$stamp" > /tmp/usb/out/STAMP.txt
    set_stamp "$stamp"
    echo "$stamp"
    ;;
  *) echo "usage: usb.sh stamp|restore <stamp>|dump" >&2; exit 2 ;;
esac
