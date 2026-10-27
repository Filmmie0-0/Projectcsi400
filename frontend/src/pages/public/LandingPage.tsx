import { Link } from 'react-router-dom';
import { ClipboardCheck, FileSignature, Hammer, PackageOpen, PlugZap, Search } from 'lucide-react';
import Card from '../../components/ui/Card';

const STEPS = [
  { icon: PlugZap, title: 'รับงาน', text: 'ลูกค้าแจ้งเอง หรือระบบจองห้องพักพาร์ทเนอร์ส่งงานผ่าน API (เช่น ผู้เช่าย้ายออก)' },
  { icon: Search, title: 'ประเมินหน้างาน', text: 'แอดมินมอบหมายช่าง ช่างตรวจห้องตามเช็กลิสต์และประเมินจำนวนวัน' },
  { icon: FileSignature, title: 'ทำสัญญา', text: 'คิดค่าแรงรายวันหรือรายเดือนตามขนาดงาน + ค่าวัสดุ ลูกค้าเซ็นออนไลน์' },
  { icon: PackageOpen, title: 'เบิกวัสดุ', text: 'ช่างเบิกของจากคลัง แอดมินอนุมัติ ตัดสต็อกอัตโนมัติ คืนของเหลือได้' },
  { icon: Hammer, title: 'ลงมือทำ', text: 'บันทึกงานรายวัน % ความคืบหน้า พบงานเพิ่มทำสัญญาเพิ่มเติมได้' },
  { icon: ClipboardCheck, title: 'ส่งมอบ', text: 'ปิดงาน แจ้งผลกลับระบบพาร์ทเนอร์ผ่าน webhook ทุกขั้นตอน' },
];

export default function LandingPage() {
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-walnut-600">Inspection & Renovation Service</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight text-espresso-900">
            ตรวจสอบห้องเช่า & รีโนเวทพื้นที่<br />เชื่อมกับระบบจองห้องพักของคุณ
          </h1>
          <p className="mt-4 text-espresso-500">
            RenoCare รับงานต่อจากระบบจองห้องพัก ตั้งแต่ตรวจห้องหลังผู้เช่าย้ายออก จนถึงรีโนเวทพื้นที่ใต้ตึก
            พร้อมสัญญา ใบเบิกวัสดุ และติดตามงานแบบเรียลไทม์
          </p>
          <div className="mt-6 flex gap-3">
            <Link to="/login" className="rounded-lg bg-walnut-500 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-walnut-600">เข้าสู่ระบบ</Link>
            <Link to="/sandbox" className="rounded-lg bg-sand-200 px-5 py-2.5 text-sm font-medium text-espresso-900 hover:bg-sand-300">ลองส่งงานแบบพาร์ทเนอร์</Link>
          </div>
        </div>
        <Card className="space-y-3 bg-cream-100">
          <p className="text-sm font-semibold text-espresso-900">3 บทบาทในระบบ</p>
          {[
            ['แอดมิน', 'รับงาน มอบหมายช่าง ทำสัญญา อนุมัติเบิกวัสดุ ตรวจสลิป'],
            ['ลูกค้า', 'เจ้าของตึก/หอ หรือบัญชีระบบพาร์ทเนอร์ — แจ้งงาน เซ็นสัญญา ชำระเงิน'],
            ['ช่าง', 'ประเมินหน้างาน บันทึกงานรายวัน เบิก/คืนวัสดุ'],
          ].map(([role, text]) => (
            <div key={role} className="rounded-lg bg-white p-3 text-sm">
              <span className="font-medium text-walnut-700">{role}</span>
              <span className="text-espresso-500"> — {text}</span>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-espresso-900">ขั้นตอนการทำงาน</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <Card key={title} className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-walnut-50 text-walnut-600">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="font-medium text-espresso-900">{i + 1}. {title}</p>
              </div>
              <p className="mt-3 text-sm text-espresso-500">{text}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
