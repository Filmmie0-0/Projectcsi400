import { useState, type FormEvent } from 'react';
import { PackagePlus } from 'lucide-react';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import TierEditor, { type TierDraft } from './TierEditor';
import { useAddProduct } from '../../../hooks/useStore';
import { toApiError } from '../../../services/apiError';
import type { Category } from '../../../types/store';

const EMPTY = { name: '', sku: '', unit: 'ชิ้น', unitsPerCase: '', categoryId: '', sellingPrice: '', initialStock: '0' };

export default function AddProductForm({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const add = useAddProduct();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const retail = Number(f.sellingPrice) || 0;
  const valid = f.name.trim() && f.sku.trim() && retail > 0 && tiers.every((t) => t.minQty >= 2 && t.unitPrice >= 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      [{
        name: f.name.trim(),
        sku: f.sku.trim().toUpperCase(),
        unit: f.unit.trim() || 'ชิ้น',
        unitsPerCase: Number(f.unitsPerCase) || undefined,
        categoryId: Number(f.categoryId) || undefined,
        sellingPrice: retail,
        initialStock: Math.max(0, Math.floor(Number(f.initialStock) || 0)),
        tiers,
      }],
      { onSuccess: () => { setF(EMPTY); setTiers([]); onDone(); } },
    );
  };

  return (
    <Card className="border-mocha-200 bg-cream-50">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-mocha-500" />
          <h3 className="font-semibold text-espresso-900">เพิ่มสินค้าใหม่</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><Input label="ชื่อสินค้า" value={f.name} onChange={set('name')} /></div>
          <Input label="SKU" value={f.sku} onChange={set('sku')} placeholder="DRK-001" />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-espresso-700">ประเภท</span>
            <select value={f.categoryId} onChange={set('categoryId')} className="w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="">— ไม่ระบุ —</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
            </select>
          </label>
          <Input label="หน่วย" value={f.unit} onChange={set('unit')} />
          <Input label="ชิ้น/ลัง" type="number" min={1} value={f.unitsPerCase} onChange={set('unitsPerCase')} placeholder="12" />
          <Input label="ราคาขายปลีก (บาท)" type="number" min={0} step="0.25" value={f.sellingPrice} onChange={set('sellingPrice')} />
          <Input label="สต็อกเริ่มต้น" type="number" min={0} value={f.initialStock} onChange={set('initialStock')} />
        </div>

        <div className="rounded-lg border border-line bg-white p-4">
          <p className="mb-3 text-sm font-medium text-espresso-700">ราคาขายส่ง (ไม่บังคับ)</p>
          <TierEditor tiers={tiers} retailPrice={retail} onChange={setTiers} />
        </div>

        <div className="flex items-center justify-end gap-3">
          {add.isError && <p className="text-sm text-danger">{toApiError(add.error).message}</p>}
          <Button type="button" variant="ghost" onClick={onDone}>ยกเลิก</Button>
          <Button type="submit" disabled={!valid || add.isPending}>{add.isPending ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}</Button>
        </div>
      </form>
    </Card>
  );
}
