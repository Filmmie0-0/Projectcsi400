# คำขอเพิ่ม API รับสัญญาซ่อมจาก RenoCare (Repair API v1)

> ส่งให้ทีมระบบหอพัก (projectcsi400) — คัดลอกทั้งไฟล์ไปให้ AI หรือนักพัฒนาฝั่งหอพักได้เลย

---

คุณคือนักพัฒนาระบบหอพัก ช่วยเพิ่มฟีเจอร์ "รับสัญญาซ่อมจากช่าง" ต่อจาก Repair API v1 ที่มีอยู่แล้ว ถ้าไม่แน่ใจโครงสร้างโปรเจกต์ (ตาราง, service, หน้าจอ) ให้ถามก่อนเขียน

## ที่มา

ตอนนี้ช่าง (เช่น RenoCare) รับงานและอัปเดตสถานะผ่าน `PATCH /jobs/:id/status` ได้แล้ว
แต่หลังช่างเข้าประเมินหน้างาน ช่างจะออก **สัญญาซ่อม (ราคา + รายการวัสดุ + ระยะเวลา)** ให้หอพักอนุมัติก่อนลงมือ
ซึ่งตอนนี้ไม่มีช่องทางส่งให้หอพักเลย (`PATCH /status` รับได้แค่ 5 ฟิลด์)

## สิ่งที่ต้องการ

1. API ให้ช่างส่ง/แก้/ยกเลิกสัญญาของงานซ่อม
2. หน้าจอให้ **พนักงานหอ/เจ้าของหอ** (ไม่ใช่ผู้เช่า) ดูสัญญาและกด "อนุมัติ" หรือ "ไม่อนุมัติ"
3. API ให้ช่างดึงผลการอนุมัติกลับไป

## กติกาเดิมที่ต้องใช้เหมือนกัน

- Base URL เดิม: `https://backend.ayasakimioweb.com/api/repair/v1`
- ยืนยันตัวด้วย API key เดิม (`X-API-Key` หรือ `X-Repair-Api-Key`) และ rate limit 120 ครั้ง/นาที/key ร่วมกับ endpoint เดิม
- ช่างเห็น/แก้ได้เฉพาะสัญญาของงานที่ส่งให้ตัวเอง (งานของช่างรายอื่น = `404 NOT_FOUND`)
- รูปแบบ error เดิม: `{ "code": "...", "message": "..." }`

## 1. Endpoint ใหม่

| Method | Path | ใช้ทำอะไร |
| --- | --- | --- |
| `PUT` | `/jobs/:id/contracts/:contract_no` | ส่งสัญญาใหม่ หรือแก้สัญญาที่ยังรออนุมัติ (upsert ตาม `contract_no`) |
| `GET` | `/jobs/:id/contracts` | ดูสัญญาทั้งหมดของงาน พร้อมผลอนุมัติ (ช่างเรียกเป็นระยะ ทุก 1-5 นาที) |
| `GET` | `/jobs/:id/contracts/:contract_no/files/:file_id` | ดาวน์โหลดไฟล์แนบ (คืน binary พร้อม `Content-Type`) |
| `POST` | `/jobs/:id/contracts/:contract_no/cancel` | ช่างยกเลิกสัญญาที่ยังไม่อนุมัติ (เช่น ออกสัญญาใหม่แทน) |

### `PUT /jobs/:id/contracts/:contract_no` — body

```json
{
  "contract_type": "main",
  "parent_contract_no": null,
  "billing_type": "daily",
  "rate": 500,
  "period_qty": 1,
  "start_date": "2026-11-30",
  "end_date": "2026-11-30",
  "labor_amount": 500,
  "material_amount": 85,
  "total_amount": 585,
  "terms": "รับประกันงาน 30 วัน",
  "items": [
    { "description": "กระเบื้องพื้น 60x60 ซม.", "qty": 1, "unit": "แผ่น", "unit_price": 85 }
  ],
  "installments": [
    { "no": 1, "description": "มัดจำ 30%", "due_date": "2026-11-30", "amount": 175.5 },
    { "no": 2, "description": "ส่วนที่เหลือเมื่อเสร็จงาน", "due_date": "2026-11-30", "amount": 409.5 }
  ],
  "files": [
    { "file_name": "CT2611-0002.pdf", "mime_type": "application/pdf", "data_base64": "JVBERi0xLjQK..." }
  ]
}
```

| ฟิลด์ | ชนิด | กติกา |
| --- | --- | --- |
| `contract_no` (ใน path) | ข้อความ ≤ 20 | เลขสัญญาฝั่งช่าง ไม่ซ้ำภายในงาน เช่น `CT2611-0002` |
| `contract_type` | `main` \| `addendum` | `addendum` = สัญญาเพิ่มเติม ต้องส่ง `parent_contract_no` ที่ **อนุมัติแล้ว** |
| `billing_type` | `daily` \| `monthly` | คิดค่าแรงรายวันหรือรายเดือน |
| `rate`, `period_qty` | ตัวเลข ≥ 0, จำนวนเต็ม > 0 | ค่าแรงต่อหน่วย × จำนวนวัน/เดือน |
| `start_date`, `end_date` | `YYYY-MM-DD` | `end_date` ≥ `start_date` |
| `labor_amount` | ตัวเลข | ต้องเท่ากับ `rate × period_qty` |
| `material_amount` | ตัวเลข ≥ 0 | ต้องเท่ากับผลรวม `qty × unit_price` ของ `items` |
| `total_amount` | ตัวเลข | ต้องเท่ากับ `labor_amount + material_amount` |
| `terms` | ข้อความ ≤ 2000 / null | เงื่อนไขสัญญา |
| `items` | array ≤ 100 | `description` ≤ 200, `qty` > 0, `unit` ≤ 20, `unit_price` ≥ 0 |
| `installments` | array ≤ 24 / ไม่ส่ง | งวดชำระ (ข้อมูลอ้างอิง) ผลรวม `amount` ต้องเท่ากับ `total_amount` |
| `files` | array ≤ 5 / ไม่ส่ง | `application/pdf`, `image/png`, `image/jpeg` ไฟล์ละ ≤ 5 MB (หลัง decode) ถ้าส่งมา = แทนที่ไฟล์เดิมทั้งหมด ถ้าไม่ส่ง = คงไฟล์เดิม |

ตรวจตัวเลขเงินโดยปัดทศนิยม 2 ตำแหน่ง ถ้าไม่ตรงตอบ `400 VALIDATION_ERROR` พร้อมบอกฟิลด์ที่ผิด

ตอบกลับ: `201` ถ้าสร้างใหม่, `200` ถ้าแก้ของเดิม — body เป็น object สัญญาแบบเดียวกับใน `GET` ด้านล่าง

### `GET /jobs/:id/contracts` — ตอบกลับ 200

```json
{
  "contracts": [
    {
      "contract_no": "CT2611-0002",
      "contract_type": "main",
      "parent_contract_no": null,
      "status": "approved",
      "billing_type": "daily",
      "rate": 500,
      "period_qty": 1,
      "start_date": "2026-11-30",
      "end_date": "2026-11-30",
      "labor_amount": 500,
      "material_amount": 85,
      "total_amount": 585,
      "terms": "รับประกันงาน 30 วัน",
      "items": [{ "description": "กระเบื้องพื้น 60x60 ซม.", "qty": 1, "unit": "แผ่น", "unit_price": 85, "line_total": 85 }],
      "installments": [{ "no": 1, "description": "มัดจำ 30%", "due_date": "2026-11-30", "amount": 175.5 }],
      "files": [{ "file_id": 12, "file_name": "CT2611-0002.pdf", "mime_type": "application/pdf", "size_bytes": 48211 }],
      "submitted_at": "2026-11-26T03:50:00.000Z",
      "updated_at": "2026-11-26T03:50:00.000Z",
      "decided_at": "2026-11-26T05:10:00.000Z",
      "decided_by_name": "มานะ ทำงานดี",
      "decision_note": null
    }
  ]
}
```

### `POST /jobs/:id/contracts/:contract_no/cancel` — body

```json
{ "reason": "ออกสัญญาใหม่ CT2611-0003 แทน" }
```

`reason` จำเป็น ≤ 500 ตัวอักษร ตอบ 200 พร้อม object สัญญา

## 2. สถานะสัญญา

| status | ความหมาย | เปลี่ยนโดย | ไปต่อได้ |
| --- | --- | --- | --- |
| `pending` | รอหอพักอนุมัติ | ช่างส่ง (`PUT`) | `approved`, `rejected`, `cancelled` |
| `approved` | หอพักอนุมัติแล้ว ช่างเริ่มงานได้ | หอพัก | — (สิ้นสุด แก้ไม่ได้) |
| `rejected` | หอพักไม่อนุมัติ (ต้องมีเหตุผล) | หอพัก | — (ช่างออกสัญญาเลขใหม่แทน) |
| `cancelled` | ช่างยกเลิก | ช่าง (`/cancel`) | — |

- `PUT` ได้เฉพาะตอนยังไม่มีสัญญาเลขนั้น หรือสัญญายังเป็น `pending` — สถานะอื่นตอบ `409 CONTRACT_LOCKED`
- `/cancel` ได้เฉพาะ `pending` — สถานะอื่นตอบ `409 CONTRACT_LOCKED`
- งานซ่อมที่เป็น `cancelled`, `rejected` หรือ `done` แล้ว ห้ามส่งสัญญาใหม่ — ตอบ `409 INVALID_JOB_STATUS`
- ถ้าแก้สัญญา `pending` ให้ล้างการอ่าน/แจ้งเตือนเดิมแล้วแจ้งพนักงานหอใหม่ว่า "สัญญาถูกแก้ไข"

## 3. Error ที่เพิ่ม

| HTTP / code | เมื่อไร |
| --- | --- |
| `400 VALIDATION_ERROR` | ฟิลด์ขาด/ผิดรูปแบบ, ยอดเงินไม่ตรงกัน, ไฟล์ผิดชนิดหรือเกิน 5 MB |
| `404 NOT_FOUND` | ไม่พบงาน/สัญญา หรือเป็นของช่างรายอื่น |
| `409 CONTRACT_LOCKED` | สัญญาอนุมัติ/ไม่อนุมัติ/ยกเลิกไปแล้ว แก้หรือยกเลิกไม่ได้ |
| `409 INVALID_JOB_STATUS` | งานซ่อมปิดหรือถูกยกเลิกแล้ว |
| `413 PAYLOAD_TOO_LARGE` | body รวมเกิน 30 MB |

## 4. หน้าจอฝั่งหอพัก

- ในการ์ด/หน้ารายละเอียดงานที่ "ติดต่อช่าง" เพิ่มส่วน **สัญญาจากช่าง** แสดง เลขสัญญา ยอดรวม ค่าแรง ค่าวัสดุ รายการวัสดุ ระยะเวลา งวดชำระ เงื่อนไข และไฟล์แนบ (เปิด/ดาวน์โหลดได้)
- ปุ่ม **อนุมัติ** และ **ไม่อนุมัติ** (ไม่อนุมัติต้องกรอกเหตุผล ≤ 500 ตัวอักษร) แสดงเฉพาะสัญญา `pending`
- สิทธิ์: เฉพาะพนักงานหอ/เจ้าของหอ **ผู้เช่าต้องไม่เห็น** (ค่าซ่อมเป็นสัญญาระหว่างหอพักกับช่าง)
- เพิ่มรายการแจ้งเตือน (กระดิ่ง) ให้พนักงานหอเมื่อมีสัญญาใหม่หรือสัญญาถูกแก้
- บันทึก `decided_by_name`, `decided_at`, `decision_note` และเก็บลง log/audit เดิมของระบบ

## 5. Webhook ถึงช่าง (ไม่บังคับ)

ถ้าช่างตั้ง Webhook URL ไว้ ให้ส่ง `X-Repair-Event: contract.decided` ไปพร้อมลายเซ็น `X-Signature` แบบเดิม เมื่อหอพักอนุมัติ/ไม่อนุมัติ

```json
{ "event": "contract.decided", "sent_at": "2026-11-26T05:10:01.000Z", "job_id": 3, "contract": { "contract_no": "CT2611-0002", "status": "approved", "decided_by_name": "มานะ ทำงานดี", "decision_note": null } }
```

ช่างที่ไม่มี URL สาธารณะ (เช่น RenoCare ที่รันบนเครื่อง) จะใช้ `GET /jobs/:id/contracts` ดึงผลแทน จึงต้องมี GET เสมอ

## 6. อัปเดตเอกสาร API

เพิ่ม endpoint, ตารางสถานะ, error และตัวอย่าง curl ข้างบนลงในหน้า "คู่มือใช้งาน Repair API" (รวมถึงไฟล์ .docx และ prompt สำหรับ AI ที่หน้าเอกสารมีอยู่แล้ว)

## สิ่งที่ต้องส่งมอบ

1. ตาราง/คอลัมน์ใหม่: สัญญา, รายการวัสดุ, งวดชำระ, ไฟล์แนบ (ผูกกับงานซ่อมและช่าง)
2. Endpoint 4 ตัวในข้อ 1 พร้อม validation และสิทธิ์ตามข้อ 2-3
3. หน้าจออนุมัติ/ไม่อนุมัติ + แจ้งเตือนตามข้อ 4
4. Test: สร้างใหม่ (201), แก้ตอน pending (200), แก้หลังอนุมัติ (409), ยอดเงินไม่ตรง (400), ไฟล์เกิน 5 MB (400), งานของช่างรายอื่น (404), ยกเลิก pending (200)
5. แจ้ง RenoCare เมื่อขึ้น production แล้ว — ฝั่ง RenoCare จะส่งสัญญาอัตโนมัติตอนกด "ส่งสัญญาให้ลูกค้า" และดึงผลอนุมัติกลับมาทุก 1 นาที
