import { Plus, Trash2 } from 'lucide-react';
import type { PriceTier } from '../../../types/store';

export type TierDraft = Omit<PriceTier, 'tierId'>;

interface Props {
  tiers: TierDraft[];
  retailPrice: number;
  onChange: (tiers: TierDraft[]) => void;
}

const cellCls = 'w-full rounded-md border border-line bg-white px-2 py-1 text-sm focus:border-mocha-400';

// ราคาส่งขั้นบันได: แต่ละแถว = ซื้อตั้งแต่ N ชิ้น ได้ราคา X ต่อชิ้น
export default function TierEditor({ tiers, retailPrice, onChange }: Props) {
  const patch = (i: number, p: Partial<TierDraft>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const nextQty = Math.max(1, ...tiers.map((t) => t.minQty)) * 2;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5rem_6rem_2rem] gap-2 text-xs text-espresso-500">
        <span>ชื่อขั้น</span><span>ซื้อตั้งแต่</span><span>ราคา/ชิ้น</span><span />
      </div>
      {tiers.map((t, i) => {
        const invalid = t.minQty < 2 || t.unitPrice >= retailPrice;
        return (
          <div key={i} className="grid grid-cols-[1fr_5rem_6rem_2rem] items-center gap-2">
            <input className={cellCls} value={t.label ?? ''} placeholder="ยกลัง" onChange={(e) => patch(i, { label: e.target.value || undefined })} />
            <input className={cellCls} type="number" min={2} value={t.minQty} onChange={(e) => patch(i, { minQty: Number(e.target.value) })} />
            <input
              className={`${cellCls} ${invalid ? 'border-warning' : ''}`}
              type="number" min={0} step="0.25" value={t.unitPrice}
              title={invalid ? 'ขั้นต่ำต้อง ≥ 2 และราคาส่งควรต่ำกว่าราคาปลีก' : undefined}
              onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
            />
            <button type="button" onClick={() => onChange(tiers.filter((_, j) => j !== i))} className="rounded p-1 text-espresso-300 hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...tiers, { minQty: nextQty, unitPrice: Math.max(0, +(retailPrice * 0.9).toFixed(2)) }])}
        className="flex items-center gap-1 text-sm font-medium text-mocha-600 hover:text-mocha-700"
      >
        <Plus className="h-4 w-4" /> เพิ่มราคาส่ง
      </button>
    </div>
  );
}
