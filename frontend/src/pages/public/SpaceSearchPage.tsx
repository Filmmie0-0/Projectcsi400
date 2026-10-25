import { useState } from 'react';
import { Search } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import SpaceCard from '../../components/features/space/SpaceCard';
import Spinner from '../../components/ui/Spinner';
import { useSpaceSearch } from '../../hooks/useSpaces';
import { useDebounce } from '../../hooks/useDebounce';

const PROVINCES = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี'];
const PRICE_STEPS = [3000, 5000, 8000];

export default function SpaceSearchPage() {
  const [q, setQ] = useState('');
  const [province, setProvince] = useState('');
  const [maxPrice, setMaxPrice] = useState(0);
  const search = useSpaceSearch({ q: useDebounce(q), province: province || undefined, maxPrice: maxPrice || undefined });

  const selectCls = 'rounded-lg border border-line bg-white px-3 py-2 text-sm text-espresso-700';

  return (
    <>
      <PageHeader title="ค้นหาพื้นที่ใต้หอพัก" description="เช่าพื้นที่ว่างในหอพักเพื่อเปิดร้านขายส่ง ใกล้ลูกค้าหลักร้อยห้อง" />

      <div className="mb-6 flex flex-wrap gap-2">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-espresso-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อหอพัก / พื้นที่ / เขต"
            className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-mocha-400"
          />
        </label>
        <select value={province} onChange={(e) => setProvince(e.target.value)} className={selectCls}>
          <option value="">ทุกจังหวัด</option>
          {PROVINCES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className={selectCls}>
          <option value={0}>ทุกราคา</option>
          {PRICE_STEPS.map((p) => <option key={p} value={p}>ไม่เกิน {p.toLocaleString('th-TH')} บาท</option>)}
        </select>
      </div>

      {search.isPending ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : search.data?.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {search.data.map((s) => <SpaceCard key={s.spaceId} space={s} />)}
        </div>
      ) : (
        <p className="py-20 text-center text-espresso-500">ไม่พบพื้นที่ที่ตรงกับเงื่อนไข</p>
      )}
    </>
  );
}
