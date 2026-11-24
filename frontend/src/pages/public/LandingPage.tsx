import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Brush, Building2, ClipboardCheck, Clock, FileSignature, Hammer, MessageCircle,
  PackageOpen, Paintbrush, Phone, PlugZap, Ruler, Search, ShieldCheck, Sparkles, Wrench, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card from '../../components/ui/Card';

// ข้อมูลติดต่อบนหน้าแรก (แก้ให้ตรงกับของจริงได้ที่นี่)
const CONTACT = { phone: '02-000-0000', tel: '020000000', line: '@renocare', hours: 'จันทร์–เสาร์ 08:00–18:00' };

type Category = 'structure' | 'finish' | 'system' | 'care';

const CATEGORY_LABEL: Record<Category | 'all', string> = {
  all: 'ทั้งหมด',
  structure: 'โครงสร้าง & ต่อเติม',
  finish: 'ทาสี & ตกแต่ง',
  system: 'ไฟฟ้า & ประปา',
  care: 'ตรวจห้อง & ทำความสะอาด',
};

// ทีมช่างแยกตามความถนัด — ลูกค้าเลือกได้ว่าอยากให้ช่างสายไหนไปดูหน้างาน
const SPECIALTIES: {
  icon: LucideIcon; title: string; image: string; category: Category; skills: string[]; text: string; rate: string;
}[] = [
  {
    icon: Hammer, title: 'ช่างโครงสร้าง & ต่อเติม', image: '/images/svc-structure.jpg', category: 'structure',
    skills: ['ก่อผนัง', 'ฉาบปูน', 'ปูกระเบื้อง', 'ต่อเติมร้านค้า'],
    text: 'ปรับพื้นที่ใต้ตึกเป็นร้านค้า กั้นห้อง ต่อเติมหลังคา งานที่กระทบตัวอาคารมีขั้นตอนขออนุมัติเจ้าของหอ',
    rate: 'เริ่ม 800 บาท/วัน',
  },
  {
    icon: Paintbrush, title: 'ช่างทาสี & ผนัง', image: '/images/svc-paint.jpg', category: 'finish',
    skills: ['ทาสีภายใน-ภายนอก', 'ซ่อมรอยร้าว', 'วอลเปเปอร์'],
    text: 'รีเฟรชห้องเช่าให้พร้อมปล่อยเช่ารอบใหม่ เก็บรอยตะปู คราบ และรอยร้าวก่อนลงสีใหม่',
    rate: 'เริ่ม 800 บาท/วัน',
  },
  {
    icon: Zap, title: 'ช่างไฟฟ้า & แอร์', image: '/images/svc-electric.jpg', category: 'system',
    skills: ['เดินสายไฟ', 'ตู้ไฟ / เบรกเกอร์', 'ล้าง-ซ่อมแอร์'],
    text: 'ตรวจความปลอดภัยระบบไฟ เปลี่ยนปลั๊ก-สวิตช์ ติดตั้งและล้างแอร์ ก่อนผู้เช่าใหม่เข้าอยู่',
    rate: 'เริ่ม 900 บาท/วัน',
  },
  {
    icon: Wrench, title: 'ช่างประปา', image: '/images/svc-plumbing.jpg', category: 'system',
    skills: ['ท่อรั่ว-ท่อตัน', 'สุขภัณฑ์', 'ปั๊มน้ำ / เครื่องทำน้ำอุ่น'],
    text: 'แก้น้ำซึม ท่อตัน เปลี่ยนก๊อกและสุขภัณฑ์ ติดตั้งเครื่องทำน้ำอุ่นพร้อมตรวจระบบกราวด์',
    rate: 'เริ่ม 900 บาท/วัน',
  },
  {
    icon: Sparkles, title: 'ตรวจห้อง & ทำความสะอาด', image: '/images/svc-cleaning.jpg', category: 'care',
    skills: ['ตรวจห้องหลังย้ายออก', 'เช็กลิสต์ครุภัณฑ์', 'Big cleaning'],
    text: 'ตรวจสภาพห้องตามเช็กลิสต์พร้อมรูปถ่าย สรุปความเสียหาย แล้วทำความสะอาดให้พร้อมเข้าอยู่',
    rate: 'เริ่ม 800 บาท/วัน',
  },
  {
    icon: Ruler, title: 'ออกแบบ & ประเมินงาน', image: '/images/svc-design.jpg', category: 'finish',
    skills: ['วัดพื้นที่', 'ประเมินราคา', 'แบบร่างตกแต่ง'],
    text: 'ประเมินหน้างาน ถอดปริมาณวัสดุ และวางแผนจำนวนวันทำงาน ก่อนออกใบเสนอราคาและสัญญา',
    rate: 'ประเมินหน้างานฟรี',
  },
];

// tall = สูง 2 แถว, wide = กว้าง 2 คอลัมน์ (จัดให้เต็มกริด 3x3 พอดีเมื่อแสดงทั้งหมด)
const PORTFOLIO: { image: string; title: string; place: string; category: Category; tall?: boolean; wide?: boolean }[] = [
  { image: '/images/work-living.jpg', title: 'รีโนเวทห้องนั่งเล่น ทาสีผนังโทนเขียว', place: 'คอนโด · ลาดพร้าว', category: 'finish', tall: true },
  { image: '/images/work-kitchen.jpg', title: 'ปรับปรุงครัว เปลี่ยนท็อปและเดินไฟใหม่', place: 'ทาวน์โฮม · บางนา', category: 'system' },
  { image: '/images/work-bedroom.jpg', title: 'ห้องเช่าพร้อมปล่อยเช่ารอบใหม่', place: 'หอพัก · รังสิต', category: 'care' },
  { image: '/images/work-moveout.jpg', title: 'ตรวจห้องหลังผู้เช่าย้ายออก + เก็บงาน', place: 'อพาร์ตเมนต์ · พระราม 9', category: 'care' },
  { image: '/images/work-bathroom.jpg', title: 'ห้องน้ำใหม่ ปูกระเบื้อง + สุขภัณฑ์', place: 'หอพัก · ศาลายา', category: 'system', tall: true },
  { image: '/images/work-exterior.jpg', title: 'ต่อเติมโครงสร้างและพื้นที่ภายนอก', place: 'บ้านเดี่ยว · นนทบุรี', category: 'structure', wide: true },
];

const STEPS = [
  { icon: PlugZap, title: 'แจ้งงาน', text: 'แจ้งผ่านเว็บ หรือระบบจองห้องพักส่งงานมาให้อัตโนมัติ' },
  { icon: Search, title: 'ประเมินหน้างาน', text: 'ส่งช่างที่ถนัดงานนั้นไปตรวจตามเช็กลิสต์' },
  { icon: FileSignature, title: 'ทำสัญญา', text: 'ราคาชัดเจน ค่าแรง + ค่าวัสดุ เซ็นออนไลน์' },
  { icon: PackageOpen, title: 'เบิกวัสดุ', text: 'วัสดุจากคลังมีบันทึก ตรวจสอบย้อนหลังได้' },
  { icon: Hammer, title: 'ลงมือทำ', text: 'อัปเดตความคืบหน้ารายวันพร้อมรูปถ่าย' },
  { icon: ClipboardCheck, title: 'ส่งมอบ', text: 'ตรวจรับงาน ปิดงาน และแจ้งผลทุกขั้นตอน' },
];

const PROMISES = [
  { icon: ShieldCheck, text: 'ประเมินหน้างานฟรี' },
  { icon: FileSignature, text: 'สัญญาและราคาชัดเจน' },
  { icon: Clock, text: 'ติดตามงานแบบเรียลไทม์' },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-4">
      <Hero />
      <Specialties />
      <Portfolio />
      <Process />
      <PartnerBand />
      <ContactBand />
    </div>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-walnut-50 px-3 py-1 text-xs font-medium text-walnut-700">
          <BadgeCheck className="h-4 w-4" /> รับซ่อม · รีโนเวท · ต่อเติม บ้าน คอนโด หอพัก
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-espresso-900 sm:text-5xl">
          เปลี่ยนพื้นที่เดิม<br />ให้ <span className="text-walnut-500">น่าอยู่กว่าเดิม</span>
        </h1>
        <p className="mt-5 max-w-xl text-espresso-500">
          RenoCare ทีมช่างมืออาชีพแยกตามความถนัด ตั้งแต่ตรวจห้องหลังผู้เช่าย้ายออก ทาสี ไฟฟ้า ประปา
          จนถึงต่อเติมพื้นที่ใต้ตึกเป็นร้านค้า — มีสัญญา ราคาชัดเจน และติดตามงานได้ทุกวัน
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-walnut-500 px-5 py-3 text-sm font-medium text-cream-50 shadow-soft hover:bg-walnut-600">
            แจ้งงานซ่อม / รีโนเวท <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#portfolio" className="rounded-lg bg-sand-200 px-5 py-3 text-sm font-medium text-espresso-900 hover:bg-sand-300">
            ดูผลงานของเรา
          </a>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-espresso-700">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2"><Icon className="h-4 w-4 text-walnut-500" />{text}</li>
          ))}
        </ul>
      </div>

      <div className="relative">
        <img
          src="/images/hero.jpg"
          alt="ห้องนั่งเล่นหลังรีโนเวท โทนไม้อบอุ่น"
          className="aspect-[4/3] w-full rounded-[22px] object-cover shadow-lift"
        />
        <div className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-card border border-line bg-cream-50/95 px-4 py-3 shadow-soft backdrop-blur sm:-left-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-walnut-500 text-cream-50">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-espresso-900">ห้องพร้อมปล่อยเช่ารอบใหม่</p>
            <p className="text-xs text-espresso-500">ตรวจ · ซ่อม · ทำความสะอาด จบในทีมเดียว</p>
          </div>
        </div>
        <div className="absolute -top-4 right-4 hidden rounded-card border border-line bg-cream-50/95 px-4 py-3 text-sm shadow-soft backdrop-blur sm:block">
          <p className="text-xs text-espresso-500">ช่างแยกตามความถนัด</p>
          <p className="font-semibold text-walnut-600">6 สายงาน</p>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="text-sm font-medium text-walnut-600">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold text-espresso-900 sm:text-3xl">{title}</h2>
      {text && <p className="mt-2 text-espresso-500">{text}</p>}
    </div>
  );
}

function FilterChips({ value, onChange }: { value: Category | 'all'; onChange: (c: Category | 'all') => void }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {(Object.keys(CATEGORY_LABEL) as (Category | 'all')[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-full border px-4 py-1.5 text-sm transition ${
            value === c
              ? 'border-walnut-500 bg-walnut-500 text-cream-50'
              : 'border-line bg-cream-50 text-espresso-700 hover:border-walnut-300 hover:bg-cream-100'
          }`}
        >
          {CATEGORY_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function Specialties() {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const list = SPECIALTIES.filter((s) => filter === 'all' || s.category === filter);

  return (
    <section id="services" className="scroll-mt-24">
      <SectionHeading
        eyebrow="บริการของเรา"
        title="เลือกช่างตามงานที่ถนัด"
        text="บอกเราว่าอยากทำอะไร แล้วเราจะส่งช่างสายนั้นไปประเมินหน้างานให้ ไม่ต้องหาช่างหลายเจ้า"
      />
      <FilterChips value={filter} onChange={setFilter} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(({ icon: Icon, title, image, skills, text, rate }) => (
          <Card key={title} className="group flex flex-col overflow-hidden !p-0">
            <div className="relative h-44 overflow-hidden">
              <img src={image} alt={title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-cream-50/95 text-walnut-600 shadow-soft">
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-espresso-900">{title}</h3>
                <span className="shrink-0 rounded-full bg-sand-100 px-2.5 py-0.5 text-xs text-espresso-700">{rate}</span>
              </div>
              <p className="mt-2 text-sm text-espresso-500">{text}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <span key={s} className="rounded-md bg-walnut-50 px-2 py-0.5 text-xs text-walnut-700">{s}</span>
                ))}
              </div>
              <div className="mt-auto flex gap-2 pt-5">
                <Link to="/login" className="flex-1 rounded-lg bg-walnut-500 px-3 py-2 text-center text-sm font-medium text-cream-50 hover:bg-walnut-600">
                  แจ้งงานช่างสายนี้
                </Link>
                <a
                  href={`tel:${CONTACT.tel}`}
                  aria-label={`โทรปรึกษา${title}`}
                  className="flex items-center justify-center rounded-lg border border-line px-3 text-walnut-600 hover:bg-cream-100"
                >
                  <Phone className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Portfolio() {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const list = PORTFOLIO.filter((p) => filter === 'all' || p.category === filter);

  return (
    <section id="portfolio" className="scroll-mt-24">
      <SectionHeading eyebrow="ผลงาน" title="ตัวอย่างงานที่ทีมเราทำเสร็จแล้ว" text="ทุกงานมีบันทึกรายวันและรูปถ่ายก่อน-หลัง ให้ลูกค้าตรวจรับได้" />
      <FilterChips value={filter} onChange={setFilter} />
      {list.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-espresso-500">ยังไม่มีผลงานในหมวดนี้</p>
      ) : (
        <div className="grid auto-rows-[220px] grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <figure
              key={p.image}
              className={`group relative overflow-hidden rounded-card shadow-soft ${p.tall ? 'sm:row-span-2' : ''} ${p.wide ? 'sm:col-span-2' : ''}`}
            >
              <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-espresso-900/85 via-espresso-900/40 to-transparent p-4 pt-12 text-cream-50">
                <span className="mb-1 inline-block rounded-full bg-cream-50/20 px-2 py-0.5 text-[11px] backdrop-blur">
                  {CATEGORY_LABEL[p.category]}
                </span>
                <p className="font-medium leading-snug">{p.title}</p>
                <p className="text-xs text-cream-200">{p.place}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

function Process() {
  return (
    <section id="process" className="scroll-mt-24">
      <SectionHeading eyebrow="ขั้นตอนการทำงาน" title="ชัดเจนทุกขั้น ตั้งแต่แจ้งงานจนส่งมอบ" />
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative rounded-card border border-line bg-cream-50 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-walnut-50 text-walnut-600"><Icon className="h-4 w-4" /></span>
              <span className="text-xs font-semibold text-walnut-400">0{i + 1}</span>
            </div>
            <p className="mt-3 font-medium text-espresso-900">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-espresso-500">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PartnerBand() {
  return (
    <section className="grid items-center gap-6 rounded-[22px] border border-line bg-cream-100 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
      <div className="flex gap-4">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-walnut-50 text-walnut-600 sm:flex">
          <PlugZap className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-espresso-900">เจ้าของหอพัก / ระบบจองห้องพัก?</h2>
          <p className="mt-1 text-sm text-espresso-500">
            เชื่อมระบบผ่าน API ให้ส่งงานตรวจห้องมาอัตโนมัติเมื่อผู้เช่าย้ายออก และรับสถานะงานกลับผ่าน webhook ทุกขั้นตอน
          </p>
        </div>
      </div>
      <Link to="/sandbox" className="inline-flex items-center justify-center gap-2 rounded-lg bg-sand-200 px-5 py-2.5 text-sm font-medium text-espresso-900 hover:bg-sand-300">
        ลองส่งงานแบบพาร์ทเนอร์ <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ContactBand() {
  return (
    <section id="contact" className="scroll-mt-24 overflow-hidden rounded-[22px] bg-walnut-600 text-cream-50">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-walnut-100">ติดต่อเรา</p>
          <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">ให้ช่างไปดูหน้างานก่อน ประเมินฟรี</h2>
          <p className="mt-3 max-w-lg text-sm text-walnut-100">
            เล่ารายละเอียดงานคร่าว ๆ พร้อมรูปถ่าย ทีมงานจะติดต่อกลับเพื่อนัดช่างที่ถนัดงานนั้นเข้าไปประเมินให้
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-cream-50 px-5 py-2.5 text-sm font-medium text-walnut-700 hover:bg-cream-100">
              <Brush className="h-4 w-4" /> แจ้งงานออนไลน์
            </Link>
            <a href={`tel:${CONTACT.tel}`} className="inline-flex items-center gap-2 rounded-lg border border-walnut-300 px-5 py-2.5 text-sm font-medium hover:bg-walnut-500">
              <Phone className="h-4 w-4" /> โทร {CONTACT.phone}
            </a>
          </div>
        </div>
        <ul className="grid gap-3 self-center text-sm">
          {[
            { icon: Phone, label: 'โทรศัพท์', value: CONTACT.phone },
            { icon: MessageCircle, label: 'LINE Official', value: CONTACT.line },
            { icon: Clock, label: 'เวลาทำการ', value: CONTACT.hours },
          ].map(({ icon: Icon, label, value }) => (
            <li key={label} className="flex items-center gap-3 rounded-card bg-walnut-700/60 px-4 py-3">
              <Icon className="h-5 w-5 text-walnut-200" />
              <span className="text-walnut-100">{label}</span>
              <span className="ml-auto font-medium">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
