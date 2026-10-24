import { Warehouse } from 'lucide-react';
import Card from '../../ui/Card';
import { formatCurrency } from '../../../utils/formatCurrency';
import { cn } from '../../../utils/cn';
import type { StoreProduct } from '../../../types/store';
import type { ExternalOrder } from '../../../types/order';

interface Props {
  storeName?: string;
  products: StoreProduct[];
  orders: ExternalOrder[];
}

// ฝั่งคลังสินค้า (ระบบของเรา): สต็อกและออเดอร์ที่เข้ามาจากหอพัก
export default function WarehouseLivePanel({ storeName, products, orders }: Props) {
  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-mocha-500" />
          <h2 className="font-semibold text-espresso-900">คลังสินค้า · {storeName}</h2>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-cream-100 text-left text-xs text-espresso-500">
            <tr><th className="px-3 py-2 font-medium">สินค้า</th><th className="px-3 py-2 text-right font-medium">คงเหลือ</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => (
              <tr key={p.productId}>
                <td className="px-3 py-2 text-espresso-700">{p.name}</td>
                <td className="px-3 py-2 text-right">
                  {/* key เปลี่ยนเมื่อสต็อกเปลี่ยน → เล่นแอนิเมชัน flash ใหม่ */}
                  <span
                    key={p.stockOnHand}
                    className={cn('animate-flash rounded px-2 py-0.5 font-semibold tabular-nums', p.stockOnHand <= 10 ? 'text-danger' : 'text-espresso-900')}
                  >
                    {p.stockOnHand}
                  </span>
                </td>
              </tr>
            ))}
            {!products.length && <tr><td colSpan={2} className="px-3 py-6 text-center text-espresso-500">ยังไม่มีสินค้า</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-espresso-700">ออเดอร์จากหอพัก ({orders.length})</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {orders.map((o) => (
            <div key={o.orderId} className="animate-flash rounded-lg border border-line px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-espresso-900">ห้อง {o.roomNo}{o.residentName && ` · ${o.residentName}`}</span>
                <span className="font-semibold text-mocha-600">{formatCurrency(o.totalAmount)}</span>
              </div>
              <p className="text-xs text-espresso-500">
                {o.orderCode} · {o.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
              </p>
              <p className="text-[11px] text-espresso-300">บิลค่าหอ {o.billingPeriod} · {o.billingStatus}</p>
            </div>
          ))}
          {!orders.length && <p className="text-sm text-espresso-500">ยังไม่มีออเดอร์ — ลองสั่งจากแอปหอพักทางซ้าย</p>}
        </div>
      </div>
    </Card>
  );
}
