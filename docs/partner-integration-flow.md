# RenoCare ↔ DormBook — ภาพรวมการเชื่อมต่อ (ฉบับคุยกัน)

> RenoCare = ระบบรับเหมาก่อสร้าง/ซ่อม (ของเรา) · DormBook = ระบบหาห้องและจองห้องพัก (ของเพื่อน)
> **แต่ละระบบมี server และ database ของตัวเอง คุยกันผ่าน API เท่านั้น** ไม่มีใครเข้า database ของอีกฝั่ง

## 1. ภาพรวมระบบ

```mermaid
flowchart LR
    subgraph DB_SIDE["DormBook (เพื่อน)"]
        DBS["DormBook Server"]
        DBD[("DormBook DB<br/>ห้อง / ผู้เช่า / การจอง / เจ้าของหอ")]
        DBS --- DBD
    end

    subgraph RC_SIDE["RenoCare (เรา)"]
        RCS["RenoCare Server"]
        RCD[("RenoCare DB<br/>งาน / ช่าง / สัญญา / วัสดุ")]
        RCS --- RCD
    end

    DBS -- "① ส่งงาน + ข้อมูลห้อง" --> RCS
    RCS -- "② ขอข้อมูลเจ้าของหอ (เฉพาะงานโครงสร้าง)" --> DBS
    RCS -- "③ แจ้งกลับ: ข้อมูลช่าง + เบอร์ติดต่อ + สถานะงาน" --> DBS
```

## 2. แยก 2 กรณี

```mermaid
flowchart TD
    A["DormBook ส่งงานมา"] --> B{"งานเปลี่ยนแปลงตัวอาคาร<br/>หรือทำเป็นร้านค้าไหม?"}

    B -- "ไม่ใช่ (INTERIOR)<br/>เช่น ตรวจห้องย้ายออก, ซ่อมก๊อก, ทาสีห้อง" --> C["ไม่ต้องขออนุญาตเจ้าของหอ"]
    C --> G["มอบหมายช่าง"]

    B -- "ใช่ (STRUCTURAL)<br/>เช่น ทุบผนัง, ทำร้านโชว์ห่วยใต้ตึก" --> D["RenoCare ขอข้อมูลติดต่อเจ้าของหอ<br/>จาก API ของ DormBook"]
    D --> E{"เจ้าของหออนุมัติ?"}
    E -- "ไม่อนุมัติ" --> X["ยกเลิกงาน"]
    E -- "อนุมัติ" --> G

    G --> H["ส่งข้อมูลช่าง + เบอร์ติดต่อ กลับไปที่ DormBook"]
    H --> I["ประเมินหน้างาน → ทำสัญญา → ลงมือทำ → ส่งมอบ"]
    I --> J["แจ้งสถานะกลับ DormBook ทุกขั้น"]
```

> งานโครงสร้าง: ช่างไปประเมินหน้างานได้ระหว่างรออนุมัติ แต่ **ส่งสัญญาและเริ่มงานไม่ได้** จนกว่าเจ้าของหอจะอนุมัติ

## 3. ลำดับการเรียก API

```mermaid
sequenceDiagram
    participant D as DormBook Server
    participant R as RenoCare Server
    participant O as เจ้าของหอ

    D->>R: POST /api/partner/v1/jobs (ข้อมูลงาน + ห้อง + workScope)
    R-->>D: 201 { jobCode, status: NEW, ownerApproval }

    alt workScope = STRUCTURAL
        R->>D: GET /buildings/{ref}/owner
        D-->>R: { name, phone, email }
        R->>O: ติดต่อขออนุญาต (หรือ DormBook ถามเจ้าของหอเอง)
        O-->>R: อนุมัติ / ไม่อนุมัติ
        Note over D,R: ถ้า DormBook ถามเอง → POST /jobs/{ref}/owner-approval
        R->>D: webhook owner.approval_changed
    end

    R->>D: webhook job.technicians_assigned { ชื่อช่าง, เบอร์ช่าง, ผู้ประสานงาน }
    R->>D: webhook job.status_changed (ทุกครั้งที่สถานะเปลี่ยน)
```

## 4. สิ่งที่แต่ละฝั่งต้องทำ

| | DormBook (เพื่อน) | RenoCare (เรา) |
| --- | --- | --- |
| เรียก API อีกฝั่ง | `POST /jobs` ส่งงาน, `POST /jobs/{ref}/owner-approval` (ถ้าถามเจ้าของหอเอง) | `GET /buildings/{ref}/owner` ขอข้อมูลเจ้าของหอ |
| เปิด API ให้อีกฝั่งเรียก | `GET /buildings/{ref}/owner` + URL รับ webhook | `/api/partner/v1/*` |
| คีย์ | ใช้ `X-API-Key` ที่ RenoCare ออกให้ | ใช้ `X-API-Key` ที่ DormBook ออกให้ |
| ข้อมูลที่ส่งออก | งาน, ห้อง, (ข้อมูลเจ้าของหอเฉพาะงานโครงสร้าง) | ข้อมูลช่าง, เบอร์ติดต่อ, สถานะงาน |

รายละเอียด field ทั้งหมด: [system-design.md ข้อ 5](system-design.md#5-สัญญาการเชื่อมต่อกับระบบจองห้องพัก-partner-api-v1)
