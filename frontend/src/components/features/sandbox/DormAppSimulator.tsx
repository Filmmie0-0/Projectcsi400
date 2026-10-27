import { useState } from 'react';
import { Building2, Minus, Plus, ShoppingBag, CheckCircle2, AlertCircle } from 'lucide-react';
import { resolveUnitPrice } from '../../../utils/pricing';
import { formatCurrency } from '../../../utils/formatCurrency';
import { cn } from '../../../utils/cn';
import type { CreateOrderRequest, ExternalOrder, StoreCatalog } from '../../../types/order';

interface Props {
  catalog?: StoreCatalog;
  loading: boolean;
  error?: string;
  onOrder: (req: Omit<CreateOrderRequest, 'storeId'>) => Promise<{ order?: ExternalOrder; error?: string }>;
}

// หน้าจอ "แอปหอพัก" (ระบบภายนอก) ที่ดึงสินค้าจาก Web Service ของเรา
export default function DormAppSimulator({ catalog, loading, error, onOrder }: Props) {
  const [cart, setCart] = useState<Record<number, number>>({});
  const [roomNo, setRoomNo] = useState('305');
  const [residentName, setResidentName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ order?: ExternalOrder; error?: string } | null>(null);

  const items = catalog?.items ?? [];
  const setQty = (id: number, qty: number) =>
    setCart(({ [id]: _, ...rest }) => (qty > 0 ? { ...rest, [id]: qty } : rest));

  const lines = items
    .filter((i) => cart[i.productId])
    .map((i) => ({ item: i, qty: cart[i.productId], ...resolveUnitPrice(i.retailPrice, i.tiers, cart[i.productId]) }));
  const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const savings = lines.reduce((s, l) => s + (l.item.retailPrice - l.unitPrice) * l.qty, 0);

  const submit = async () => {
    setSubmitting(true);
    const res = await onOrder({
      roomNo,
      residentName: residentName || undefined,
      externalRef: `dorm-${Date.now()}`,
      items: lines.map((l) => ({ productId: l.item.productId, quantity: l.qty })),
    });
    setSubmitting(false);
    setResult(res);
    if (res.order) setCart({});
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-[2.25rem] border-[10px] border-espresso-900 bg-espresso-900 shadow-lift">
      <div className="flex h-[640px] flex-col overflow-hidden rounded-[1.6rem] bg-cream-50">
        <header className="bg-info px-5 pb-4 pt-6 text-white">
          <p className="flex items-center gap-1.5 text-xs opacity-80"><Building2 className="h-3.5 w-3.5" /> DormLife App</p>
          <p className="mt-1 text-lg font-semibold">{catalog?.dormitoryName ?? 'หอพัก'}</p>
          <p className="text-xs opacity-80">
            สั่งของจาก “{catalog?.storeName ?? '...'}” ใต้หอ ·{' '}
            {catalog?.storeStatus === 'OPEN' ? 'เปิดอยู่' : 'ปิดอยู่'}
          </p>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {loading && !catalog && <p className="p-4 text-center text-sm text-espresso-500">กำลังเรียก API...</p>}
          {error && <p className="m-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          {catalog && !items.length && <p className="p-4 text-center text-sm text-espresso-500">ร้านยังไม่มีสินค้า</p>}
          {items.map((i) => {
            const qty = cart[i.productId] ?? 0;
            const price = resolveUnitPrice(i.retailPrice, i.tiers, Math.max(qty, 1));
            return (
              <div key={i.productId} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-soft">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-espresso-900">{i.name}</p>
                  <p className="text-xs text-espresso-500">
                    {formatCurrency(price.unitPrice)}/{i.unit}
                    {price.tierLabel && <span className="ml-1 rounded bg-success-soft px-1 text-success">{price.tierLabel}</span>}
                  </p>
                  <p className={cn('text-[11px]', i.stockOnHand <= 10 ? 'text-danger' : 'text-espresso-300')}>
                    เหลือ {i.stockOnHand}
                    {i.tiers.length > 0 && ` · ซื้อ ${i.tiers[0].minQty}+ ลดเหลือ ${formatCurrency(i.tiers[0].unitPrice)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={!qty} onClick={() => setQty(i.productId, qty - 1)} className="rounded-full border border-line p-1 disabled:opacity-30">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button disabled={qty >= i.stockOnHand} onClick={() => setQty(i.productId, qty + 1)} className="rounded-full bg-info p-1 text-white disabled:opacity-30">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="space-y-2 border-t border-line bg-white p-3">
          {result?.order && (
            <p className="flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> สั่งสำเร็จ {result.order.orderCode} · {formatCurrency(result.order.totalAmount)} รวมในบิลค่าหอเดือน {result.order.billingPeriod}
            </p>
          )}
          {result?.error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" /> {result.error}
            </p>
          )}
          <div className="flex gap-2">
            <input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="ห้อง" className="w-20 rounded-lg border border-line px-2 py-2 text-sm" />
            <input value={residentName} onChange={(e) => setResidentName(e.target.value)} placeholder="ชื่อผู้สั่ง (ไม่บังคับ)" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-2 text-sm" />
          </div>
          <button
            disabled={!lines.length || !roomNo.trim() || submitting}
            onClick={submit}
            className="flex w-full items-center justify-between rounded-xl bg-info px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> {submitting ? 'กำลังส่ง...' : 'สั่งซื้อ · เก็บรวมค่าหอ'}</span>
            <span>
              {formatCurrency(total)}
              {savings > 0 && <span className="ml-1 text-xs opacity-80">(ประหยัด {formatCurrency(savings)})</span>}
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
}
