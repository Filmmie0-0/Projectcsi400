import { useState, type FormEvent } from 'react';
import { Plus, X, Tags } from 'lucide-react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { useAddCategory, useRemoveCategory } from '../../../hooks/useStore';
import { toApiError } from '../../../services/apiError';
import type { Category, StoreProduct } from '../../../types/store';

interface Props {
  categories: Category[];
  products: StoreProduct[];
}

export default function CategoryManager({ categories, products }: Props) {
  const [name, setName] = useState('');
  const add = useAddCategory();
  const remove = useRemoveCategory();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate([name], { onSuccess: () => setName('') });
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5 text-mocha-500" />
        <h2 className="font-semibold text-espresso-900">ประเภทสินค้า</h2>
        <span className="text-sm text-espresso-500">({categories.length})</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.length === 0 && <p className="text-sm text-espresso-500">ยังไม่มีหมวดหมู่ — เพิ่มเองหรือกด Quick Preset</p>}
        {categories.map((c) => {
          const count = products.filter((p) => p.categoryId === c.categoryId).length;
          return (
            <span key={c.categoryId} className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-beige-100 py-1 pl-3 pr-1.5 text-sm text-espresso-700">
              {c.name}
              <span className="rounded-full bg-cream-50 px-1.5 text-xs text-espresso-500">{count}</span>
              <button
                type="button"
                title={`ลบหมวด ${c.name}`}
                onClick={() => {
                  if (!count || confirm(`ลบหมวด "${c.name}"? สินค้า ${count} รายการจะไม่มีหมวดหมู่`)) remove.mutate([c.categoryId]);
                }}
                className="rounded-full p-0.5 text-espresso-300 hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อประเภทใหม่ เช่น เครื่องเขียน"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-espresso-300 focus:border-mocha-400"
        />
        <Button type="submit" variant="secondary" disabled={!name.trim() || add.isPending}>
          <Plus className="h-4 w-4" /> เพิ่ม
        </Button>
      </form>
      {add.isError && <p className="text-sm text-danger">{toApiError(add.error).message}</p>}
    </Card>
  );
}
