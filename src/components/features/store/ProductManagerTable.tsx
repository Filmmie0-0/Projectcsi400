import { Fragment, useState } from 'react';
import { Minus, Plus, Trash2, Pencil, PackageOpen } from 'lucide-react';
import Button from '../../ui/Button';
import TierEditor, { type TierDraft } from './TierEditor';
import { useAdjustStock, useDeleteProduct, useUpdateProduct } from '../../../hooks/useStore';
import { formatCurrency } from '../../../utils/formatCurrency';
import { cn } from '../../../utils/cn';
import type { Category, StoreProduct } from '../../../types/store';

const LOW_STOCK = 10;

interface Props {
  products: StoreProduct[];
  categories: Category[];
}

export default function ProductManagerTable({ products, categories }: Props) {
  const [editingTiers, setEditingTiers] = useState<{ productId: number; tiers: TierDraft[] } | null>(null);
  const update = useUpdateProduct();
  const adjust = useAdjustStock();
  const remove = useDeleteProduct();

  if (!products.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-white py-14 text-espresso-500">
        <PackageOpen className="h-10 w-10 text-beige-300" />
        <p>ยังไม่มีสินค้า — กด “เพิ่มสินค้า” หรือเลือก Quick Preset ด้านบน</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-soft">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-cream-100 text-left text-xs uppercase tracking-wider text-espresso-500">
          <tr>
            <th className="px-4 py-3 font-medium">สินค้า</th>
            <th className="px-4 py-3 font-medium">ประเภท</th>
            <th className="px-4 py-3 font-medium">ราคาปลีก</th>
            <th className="px-4 py-3 font-medium">ราคาส่ง</th>
            <th className="px-4 py-3 text-center font-medium">สต็อก</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {products.map((p) => {
            const isEditing = editingTiers?.productId === p.productId;
            const step = p.unitsPerCase ?? 10;
            return (
              <Fragment key={p.productId}>
                <tr className="align-middle hover:bg-cream-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-espresso-900">{p.name}</p>
                    <p className="font-mono text-xs text-espresso-500">{p.sku} · {p.unit}{p.unitsPerCase ? ` · ${p.unitsPerCase}/ลัง` : ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.categoryId ?? ''}
                      onChange={(e) => update.mutate([p.productId, { categoryId: Number(e.target.value) || undefined }])}
                      className="rounded-md border border-transparent bg-transparent py-1 pr-6 hover:border-line"
                    >
                      <option value="">—</option>
                      {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      key={p.sellingPrice}
                      type="number" min={0} step="0.25" defaultValue={p.sellingPrice}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v > 0 && v !== p.sellingPrice) update.mutate([p.productId, { sellingPrice: v }]);
                      }}
                      className="w-24 rounded-md border border-line px-2 py-1 text-right focus:border-mocha-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.tiers.map((t) => (
                        <span key={t.tierId} className="rounded-md bg-beige-100 px-2 py-0.5 text-xs text-espresso-700">
                          {t.label ?? `${t.minQty}+`} ≥{t.minQty}: <b className="font-semibold">{formatCurrency(t.unitPrice)}</b>
                        </span>
                      ))}
                      <button
                        title="แก้ไขราคาส่ง"
                        onClick={() => setEditingTiers(isEditing ? null : { productId: p.productId, tiers: p.tiers })}
                        className="rounded p-1 text-espresso-300 hover:bg-cream-200 hover:text-mocha-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <StockButton label={`-${step}`} disabled={p.stockOnHand < step} onClick={() => adjust.mutate([p.productId, -step])} />
                      <StockButton icon={<Minus className="h-3.5 w-3.5" />} disabled={p.stockOnHand < 1} onClick={() => adjust.mutate([p.productId, -1])} />
                      <span
                        key={p.stockOnHand}
                        className={cn(
                          'min-w-[3.5rem] animate-flash rounded-md px-2 py-1 text-center font-semibold tabular-nums',
                          p.stockOnHand <= LOW_STOCK ? 'text-danger' : 'text-espresso-900',
                        )}
                      >
                        {p.stockOnHand}
                      </span>
                      <StockButton icon={<Plus className="h-3.5 w-3.5" />} onClick={() => adjust.mutate([p.productId, 1])} />
                      <StockButton label={`+${step}`} onClick={() => adjust.mutate([p.productId, step])} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      title="ลบสินค้า"
                      onClick={() => confirm(`ลบ "${p.name}"?`) && remove.mutate([p.productId])}
                      className="rounded p-1.5 text-espresso-300 hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                {isEditing && (
                  <tr className="bg-cream-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="ml-auto max-w-md space-y-3">
                        <TierEditor
                          tiers={editingTiers.tiers}
                          retailPrice={p.sellingPrice}
                          onChange={(tiers) => setEditingTiers({ productId: p.productId, tiers })}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setEditingTiers(null)}>ยกเลิก</Button>
                          <Button
                            disabled={update.isPending}
                            onClick={() => update.mutate(
                              [p.productId, { tiers: editingTiers.tiers.map((t, i) => ({ ...t, tierId: i + 1 })) }],
                              { onSuccess: () => setEditingTiers(null) },
                            )}
                          >
                            บันทึกราคาส่ง
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StockButton({ label, icon, ...rest }: { label?: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      {...rest}
      className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-line px-1.5 text-xs text-espresso-700 hover:bg-cream-200 disabled:opacity-30"
    >
      {icon ?? label}
    </button>
  );
}
