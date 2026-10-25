import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, FlaskConical } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
import StatCard from '../../../components/common/StatCard';
import Button from '../../../components/ui/Button';
import Spinner from '../../../components/ui/Spinner';
import StoreProfileForm from '../../../components/features/store/StoreProfileForm';
import CategoryManager from '../../../components/features/store/CategoryManager';
import QuickPresetBar from '../../../components/features/store/QuickPresetBar';
import AddProductForm from '../../../components/features/store/AddProductForm';
import ProductManagerTable from '../../../components/features/store/ProductManagerTable';
import { useCategories, useMyStore, useStoreProducts } from '../../../hooks/useStore';
import { formatCurrency } from '../../../utils/formatCurrency';
import { cn } from '../../../utils/cn';

// Store & Inventory Builder: ตั้งค่าร้าน → สร้างหมวดหมู่ → เพิ่มสินค้า/ราคาปลีก-ส่ง → ปรับสต็อก
export default function StoreInventoryManager() {
  const store = useMyStore();
  const categories = useCategories();
  const products = useStoreProducts();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');

  const allProducts = products.data ?? [];
  const visible = useMemo(
    () => allProducts.filter((p) =>
      (filter === 'all' || p.categoryId === filter) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(q.trim().toLowerCase())),
    [allProducts, filter, q],
  );

  if (store.isPending || categories.isPending || products.isPending) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }
  if (store.isError) return <p className="text-danger">โหลดข้อมูลร้านไม่สำเร็จ</p>;

  const cats = categories.data ?? [];
  const totalUnits = allProducts.reduce((s, p) => s + p.stockOnHand, 0);
  const stockValue = allProducts.reduce((s, p) => s + p.stockOnHand * p.sellingPrice, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="ร้านค้า & คลังสินค้า"
        description="ตั้งชื่อร้าน สร้างประเภทสินค้า และกำหนดราคาปลีก/ส่งได้เอง"
        action={
          <Link to="/sandbox" className="hidden items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-espresso-700 hover:bg-cream-100 sm:flex">
            <FlaskConical className="h-4 w-4" /> เปิด API Sandbox
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <StoreProfileForm store={store.data} />
        <CategoryManager categories={cats} products={allProducts} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="สินค้าทั้งหมด" value={`${allProducts.length} รายการ`} />
        <StatCard label="จำนวนในคลัง" value={totalUnits.toLocaleString('th-TH')} />
        <StatCard label="มูลค่าสต็อก (ราคาปลีก)" value={formatCurrency(stockValue)} />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-espresso-900">จัดการสินค้า</h2>
          <Button onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" /> เพิ่มสินค้า
          </Button>
        </div>

        <QuickPresetBar />
        {showAdd && <AddProductForm categories={cats} onDone={() => setShowAdd(false)} />}

        <div className="flex flex-wrap items-center gap-2">
          {[{ categoryId: 'all' as const, name: 'ทั้งหมด' }, ...cats].map((c) => (
            <button
              key={c.categoryId}
              onClick={() => setFilter(c.categoryId)}
              className={cn(
                'rounded-full px-3 py-1 text-sm transition-colors',
                filter === c.categoryId ? 'bg-espresso-900 text-cream-50' : 'bg-cream-200 text-espresso-700 hover:bg-beige-200',
              )}
            >
              {c.name}
            </button>
          ))}
          <label className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-espresso-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / SKU"
              className="w-56 rounded-lg border border-line bg-white py-2 pl-8 pr-3 text-sm focus:border-mocha-400"
            />
          </label>
        </div>

        <ProductManagerTable products={visible} categories={cats} />
      </section>
    </div>
  );
}
