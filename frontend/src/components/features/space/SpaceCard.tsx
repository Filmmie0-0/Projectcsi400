import { Link } from 'react-router-dom';
import { Building2, DoorOpen, Ruler, MapPin } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatCurrency';
import type { Space } from '../../../types/space';

export default function SpaceCard({ space }: { space: Space }) {
  const available = space.availabilityStatus === 'AVAILABLE';

  return (
    <Link
      to={`/spaces/${space.spaceId}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-white shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="relative flex h-36 items-end bg-gradient-to-br from-beige-200 via-cream-200 to-mocha-100 p-4">
        {space.coverImageUrl && <img src={space.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="relative flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-espresso-700 backdrop-blur">
          <Building2 className="h-3.5 w-3.5 text-mocha-500" /> {space.dormitoryName ?? 'หอพัก'}
        </span>
        <span
          className={`relative ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${available ? 'bg-success-soft text-success' : 'bg-cream-200 text-espresso-500'}`}
        >
          {available ? 'ว่าง' : 'ไม่ว่าง'}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-espresso-900 group-hover:text-mocha-600">{space.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-espresso-500">
            <MapPin className="h-3.5 w-3.5" /> {[space.district, space.province].filter(Boolean).join(', ')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="flex items-center gap-1.5 rounded-lg bg-cream-100 px-2.5 py-1.5 text-espresso-700">
            <Ruler className="h-4 w-4 text-mocha-400" /> {space.sizeSqm} ตร.ม.
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-cream-100 px-2.5 py-1.5 text-espresso-700">
            <DoorOpen className="h-4 w-4 text-mocha-400" /> {space.dormitoryTotalRooms ?? '-'} ห้องพัก
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between border-t border-line pt-3">
          <p>
            <span className="text-xl font-semibold text-espresso-900">{formatCurrency(space.pricePerMonth)}</span>
            <span className="text-xs text-espresso-500"> /เดือน</span>
          </p>
          <span className="text-sm font-medium text-mocha-600">ดูรายละเอียด →</span>
        </div>
      </div>
    </Link>
  );
}
