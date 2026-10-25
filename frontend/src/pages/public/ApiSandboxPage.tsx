import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, RotateCcw, KeyRound, Sparkles } from 'lucide-react';
import DormAppSimulator from '../../components/features/sandbox/DormAppSimulator';
import WarehouseLivePanel from '../../components/features/sandbox/WarehouseLivePanel';
import ApiCallLog, { type LoggedCall } from '../../components/features/sandbox/ApiCallLog';
import { dormApiService, type ApiCall } from '../../services/dormApiService';
import { USE_MOCK } from '../../services/config';
import { DEMO_API_KEY, mockDb } from '../../services/mock/mockDb';
import { useDebounce } from '../../hooks/useDebounce';
import { useApplyPreset, useMyStore, useStoreProducts } from '../../hooks/useStore';
import { PRODUCT_PRESETS } from '../../constants/productPresets';
import type { CreateOrderRequest } from '../../types/order';

// โหมด API จริงไม่มี push จาก server → poll; โหมด mock ใช้ useLiveSync แทน
const POLL_MS = USE_MOCK ? false : 3000;

export default function ApiSandboxPage() {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState(DEMO_API_KEY);
  const [storeId, setStoreId] = useState(1);
  const key = useDebounce(apiKey, 500);
  const [calls, setCalls] = useState<LoggedCall[]>([]);
  const seq = useRef(0);

  const log = useCallback(<T,>(c: ApiCall<T>) => {
    setCalls((prev) => [{ ...c, id: ++seq.current, at: new Date() }, ...prev].slice(0, 30));
    return c;
  }, []);

  // ฝั่งแอปหอพัก: เรียก Open API ด้วย X-API-Key
  const catalog = useQuery({
    queryKey: ['sandbox', 'catalog', key, storeId],
    queryFn: async () => {
      const res = log(await dormApiService.getCatalog(key, storeId));
      if (res.error) throw res.error;
      return res.data!;
    },
    retry: false,
    refetchInterval: POLL_MS,
  });

  // ฝั่งคลังสินค้า: ข้อมูลของร้าน (ไม่บันทึกลง log)
  const store = useMyStore();
  const products = useStoreProducts();
  const orders = useQuery({
    queryKey: ['sandbox', 'orders', storeId],
    queryFn: async () => (await dormApiService.listOrders(DEMO_API_KEY, storeId)).data ?? [],
    refetchInterval: POLL_MS,
  });
  const preset = useApplyPreset();

  useEffect(() => {
    if (!USE_MOCK) void qc.invalidateQueries({ queryKey: ['store'] });
  }, [orders.dataUpdatedAt, qc]);

  const placeOrder = async (req: Omit<CreateOrderRequest, 'storeId'>) => {
    const res = log(await dormApiService.createOrder(key, { ...req, storeId }));
    await qc.invalidateQueries();
    return res.error ? { error: `${res.error.status} ${res.error.code}: ${res.error.message}` } : { order: res.data };
  };

  const catalogError = catalog.error as { status?: number; code?: string; message?: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-mocha-500">API Sandbox · Dorm Simulator</p>
          <h1 className="mt-1 text-2xl font-semibold text-espresso-900">จำลองแอปหอพักเชื่อมต่อ Web Service</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-espresso-500">
            {['แอปหอพัก', 'Open API + X-API-Key', 'Web Service', 'ตัดสต็อกในคลัง'].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-beige-400" />}
                <span className="rounded-full border border-line bg-white px-2.5 py-1">{s}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-espresso-500">
            <span className="mb-1 flex items-center gap-1"><KeyRound className="h-3 w-3" /> API Key</span>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-52 rounded-lg border border-line bg-white px-2 py-1.5 font-mono text-xs text-espresso-900" />
          </label>
          <label className="text-xs text-espresso-500">
            <span className="mb-1 block">Store ID</span>
            <input type="number" value={storeId} onChange={(e) => setStoreId(Number(e.target.value))} className="w-20 rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-espresso-900" />
          </label>
          {USE_MOCK && (
            <button
              onClick={() => { void mockDb.reset(); setCalls([]); }}
              className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-espresso-700 hover:bg-cream-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ตเดโม
            </button>
          )}
        </div>
      </div>

      {products.data?.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-beige-300 bg-beige-100/60 px-4 py-3 text-sm text-espresso-700">
          <Sparkles className="h-4 w-4 text-mocha-400" /> ร้านยังไม่มีสินค้า
          <button
            disabled={preset.isPending}
            onClick={async () => { for (const p of PRODUCT_PRESETS) await preset.mutateAsync([p.id]); }}
            className="rounded-full bg-mocha-500 px-3 py-1 text-cream-50 hover:bg-mocha-600 disabled:opacity-50"
          >
            โหลดสินค้าตัวอย่างทั้งหมด
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,24rem)_1fr_1fr]">
        <DormAppSimulator
          catalog={catalog.data}
          loading={catalog.isFetching}
          error={catalogError ? `${catalogError.status} ${catalogError.code}: ${catalogError.message}` : undefined}
          onOrder={placeOrder}
        />
        <WarehouseLivePanel storeName={store.data?.name} products={products.data ?? []} orders={orders.data ?? []} />
        <div className="lg:col-span-2 xl:col-span-1">
          <ApiCallLog calls={calls} apiKey={apiKey} />
        </div>
      </div>

      {USE_MOCK && (
        <p className="text-center text-xs text-espresso-300">
          โหมดจำลอง: Web Service ทำงานในเบราว์เซอร์ (localStorage) — เปิดหน้า “ร้านค้า & คลังสินค้า” อีกแท็บเพื่อดูสต็อกลดพร้อมกัน
        </p>
      )}
    </div>
  );
}
