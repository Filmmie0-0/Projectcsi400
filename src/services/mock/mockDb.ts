// In-browser mock ของ Web Service ใช้ตอนยังไม่มี backend (VITE_USE_MOCK != 'false')
// กติกาเหมือน trigger ใน database/migrations/002_dormitory_wholesale.sql:
// ตรวจ API key / ร้านเปิด / สต็อกพอ → เลือกราคาขั้นบันได → ตัดสต็อก, external_ref ซ้ำ = ออเดอร์เดิม
// ข้อมูลเก็บใน localStorage และแจ้งทุกแท็บผ่าน BroadcastChannel (เปิด 2 แท็บเพื่อดูสต็อกลดแบบ real-time)
import type { Space, SpaceSearchParams } from '../../types/space';
import type { Category, ProductInput, Store, StoreProduct, StoreUpdate } from '../../types/store';
import type { ApiError, CreateOrderRequest, ExternalOrder, StoreCatalog } from '../../types/order';
import { PRODUCT_PRESETS } from '../../constants/productPresets';
import { resolveUnitPrice } from '../../utils/pricing';

export const DEMO_API_KEY = 'mfc_demo_5f2a9c1e7b';

interface DbState {
  seq: number;
  spaces: Space[];
  store: Store;
  categories: Category[];
  products: StoreProduct[];
  orders: ExternalOrder[];
}

const STORAGE_KEY = 'mfc_mock_db_v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mfc_mock_db') : null;
const listeners = new Set<() => void>();

function seed(): DbState {
  const dorm = (id: number, name: string, rooms: number) => ({ dormitoryId: id, dormitoryName: name, dormitoryTotalRooms: rooms });
  return {
    seq: 1000,
    spaces: [
      { spaceId: 1, ownerId: 1, ...dorm(1, 'หอพักสุขใจ แมนชั่น', 120), name: 'ห้องเก็บของชั้น G ติดลิฟต์', sizeSqm: 18, pricePerMonth: 4500, depositAmount: 9000, province: 'กรุงเทพมหานคร', district: 'จตุจักร', address: 'ซ.พหลโยธิน 32', availabilityStatus: 'AVAILABLE' },
      { spaceId: 2, ownerId: 1, ...dorm(2, 'บ้านริมคลอง เรสซิเดนซ์', 64), name: 'มุมล็อบบี้หน้าหอ', sizeSqm: 9, pricePerMonth: 2800, depositAmount: 5600, province: 'ปทุมธานี', district: 'คลองหลวง', address: 'ถ.พหลโยธิน กม.42', availabilityStatus: 'AVAILABLE' },
      { spaceId: 3, ownerId: 2, ...dorm(3, 'The Campus Place', 210), name: 'ห้องใต้บันได อาคาร B', sizeSqm: 24, pricePerMonth: 6200, depositAmount: 12400, province: 'กรุงเทพมหานคร', district: 'บางเขน', address: 'ถ.งามวงศ์วาน', availabilityStatus: 'AVAILABLE' },
      { spaceId: 4, ownerId: 2, ...dorm(4, 'ลุมพินี ดอร์ม', 48), name: 'พื้นที่ข้างลานจอดรถ', sizeSqm: 12, pricePerMonth: 3000, depositAmount: 6000, province: 'นนทบุรี', district: 'ปากเกร็ด', address: 'ถ.แจ้งวัฒนะ', availabilityStatus: 'UNAVAILABLE' },
    ],
    store: { storeId: 1, tenantId: 1, bookingId: 1, dormitoryId: 1, dormitoryName: 'หอพักสุขใจ แมนชั่น', name: 'ร้านส่งดี ใต้หอ', status: 'OPEN' },
    categories: [],
    products: [],
    orders: [],
  };
}

let state: DbState = load();

function load(): DbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DbState;
  } catch { /* ใช้ seed */ }
  return seed();
}

function commit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage ไม่พร้อม */ }
  channel?.postMessage('changed');
  listeners.forEach((fn) => fn());
}

channel?.addEventListener('message', () => {
  state = load();
  listeners.forEach((fn) => fn());
});

export function subscribeMockDb(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const nextId = () => ++state.seq;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(clone(v)), 150 + Math.random() * 200));
const fail = (status: number, code: string, message: string): never => {
  throw { status, code, message } satisfies ApiError;
};

function findProduct(productId: number) {
  return state.products.find((p) => p.productId === productId) ?? fail(404, 'PRODUCT_NOT_FOUND', 'ไม่พบสินค้า');
}

function insertProduct(input: ProductInput) {
  if (state.products.some((p) => p.sku === input.sku)) fail(409, 'DUPLICATE_SKU', `SKU ${input.sku} มีอยู่แล้ว`);
  const product: StoreProduct = {
    productId: nextId(),
    categoryId: input.categoryId,
    sku: input.sku,
    name: input.name,
    unit: input.unit,
    unitsPerCase: input.unitsPerCase,
    sellingPrice: input.sellingPrice,
    stockOnHand: input.initialStock,
    tiers: input.tiers.map((t) => ({ ...t, tierId: nextId() })),
  };
  state.products.push(product);
  return product;
}

// ห่อทุกเมธอดให้ error ออกมาเป็น rejected Promise เหมือน HTTP call จริง (ไม่ throw แบบ sync)
type Asyncify<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never };
function asyncify<T extends Record<string, (...a: never[]) => unknown>>(api: T) {
  return Object.fromEntries(
    Object.entries(api).map(([k, fn]) => [k, (...a: never[]) => Promise.resolve().then(() => fn(...a))]),
  ) as Asyncify<T>;
}

export const mockDb = asyncify({
  // ── Spaces ──
  searchSpaces(params: SpaceSearchParams) {
    const q = params.q?.trim().toLowerCase();
    return delay(state.spaces.filter((s) =>
      (!q || `${s.name} ${s.dormitoryName} ${s.district}`.toLowerCase().includes(q)) &&
      (!params.province || s.province === params.province) &&
      (!params.maxPrice || s.pricePerMonth <= params.maxPrice)));
  },

  // ── Tenant: store & inventory ──
  getStore: () => delay(state.store),
  updateStore(patch: StoreUpdate) {
    if (!patch.name.trim()) fail(422, 'VALIDATION', 'กรุณาตั้งชื่อร้าน');
    state.store = { ...state.store, ...patch, name: patch.name.trim() };
    commit();
    return delay(state.store);
  },

  listCategories: () => delay(state.categories),
  addCategory(name: string) {
    const n = name.trim();
    if (!n) fail(422, 'VALIDATION', 'กรุณาระบุชื่อหมวดหมู่');
    if (state.categories.some((c) => c.name === n)) fail(409, 'DUPLICATE', `มีหมวด "${n}" อยู่แล้ว`);
    const category = { categoryId: nextId(), name: n };
    state.categories.push(category);
    commit();
    return delay(category);
  },
  removeCategory(categoryId: number) {
    state.categories = state.categories.filter((c) => c.categoryId !== categoryId);
    state.products.forEach((p) => { if (p.categoryId === categoryId) p.categoryId = undefined; }); // ON DELETE SET NULL
    commit();
    return delay(null);
  },

  listProducts: () => delay(state.products),
  addProduct(input: ProductInput) {
    const product = insertProduct(input);
    commit();
    return delay(product);
  },
  updateProduct(productId: number, patch: Partial<Pick<StoreProduct, 'name' | 'sellingPrice' | 'categoryId' | 'tiers'>>) {
    Object.assign(findProduct(productId), patch);
    commit();
    return delay(findProduct(productId));
  },
  deleteProduct(productId: number) {
    state.products = state.products.filter((p) => p.productId !== productId);
    commit();
    return delay(null);
  },
  adjustStock(productId: number, delta: number) {
    const p = findProduct(productId);
    if (p.stockOnHand + delta < 0) fail(422, 'INSUFFICIENT_STOCK', 'สต็อกติดลบไม่ได้'); // chk_bal_qty
    p.stockOnHand += delta;
    commit();
    return delay(p);
  },
  applyPreset(presetId: string) {
    const preset = PRODUCT_PRESETS.find((p) => p.id === presetId) ?? fail(404, 'PRESET_NOT_FOUND', 'ไม่พบชุดสินค้า');
    let category = state.categories.find((c) => c.name === preset.categoryName);
    if (!category) {
      category = { categoryId: nextId(), name: preset.categoryName };
      state.categories.push(category);
    }
    const added = preset.products
      .filter((p) => !state.products.some((x) => x.sku === p.sku))
      .map((p) => insertProduct({ ...p, categoryId: category!.categoryId }));
    commit();
    return delay({ added: added.length, skipped: preset.products.length - added.length });
  },

  // ── Open API (/open/v1) ──
  getCatalog(apiKey: string, storeId: number) {
    if (apiKey !== DEMO_API_KEY) fail(401, 'INVALID_API_KEY', 'API key ไม่ถูกต้องหรือถูกยกเลิก');
    if (storeId !== state.store.storeId) fail(404, 'STORE_NOT_FOUND', 'ไม่พบร้านค้าในหอพักนี้');
    const catalog: StoreCatalog = {
      storeId: state.store.storeId,
      storeName: state.store.name,
      storeStatus: state.store.status,
      dormitoryName: state.store.dormitoryName,
      items: state.products.map((p) => ({
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        categoryName: state.categories.find((c) => c.categoryId === p.categoryId)?.name,
        retailPrice: p.sellingPrice,
        stockOnHand: p.stockOnHand,
        tiers: p.tiers.map(({ label, minQty, unitPrice }) => ({ label, minQty, unitPrice })),
      })),
    };
    return delay(catalog);
  },

  createOrder(apiKey: string, req: CreateOrderRequest) {
    if (apiKey !== DEMO_API_KEY) fail(401, 'INVALID_API_KEY', 'API key ไม่ถูกต้องหรือถูกยกเลิก');
    if (req.storeId !== state.store.storeId) fail(404, 'STORE_NOT_FOUND', 'ไม่พบร้านค้าในหอพักนี้');
    if (state.store.status !== 'OPEN') fail(409, 'STORE_CLOSED', 'ร้านปิดอยู่');
    if (!req.roomNo.trim()) fail(422, 'VALIDATION', 'กรุณาระบุเลขห้อง');
    if (!req.items.length) fail(422, 'VALIDATION', 'ไม่มีรายการสินค้า');

    const existing = req.externalRef && state.orders.find((o) => o.externalRef === req.externalRef);
    if (existing) return delay(existing); // idempotency: uq_order_idempotency

    // ตรวจทุกรายการก่อน แล้วค่อยตัดสต็อก (ทั้งออเดอร์สำเร็จหรือล้มเหลวพร้อมกันเหมือน transaction)
    const items = req.items.map(({ productId, quantity }) => {
      const p = findProduct(productId);
      if (!Number.isInteger(quantity) || quantity <= 0) fail(422, 'VALIDATION', 'จำนวนต้องมากกว่า 0');
      if (p.stockOnHand < quantity) fail(409, 'INSUFFICIENT_STOCK', `${p.name} เหลือ ${p.stockOnHand} ${p.unit}`);
      const { unitPrice, tierLabel } = resolveUnitPrice(p.sellingPrice, p.tiers, quantity);
      return { product: p, line: { productId, productName: p.name, quantity, unitPrice, tierLabel, lineTotal: unitPrice * quantity } };
    });
    items.forEach(({ product, line }) => { product.stockOnHand -= line.quantity; });

    const now = new Date();
    const id = nextId();
    const subtotal = items.reduce((s, i) => s + i.line.lineTotal, 0);
    const order: ExternalOrder = {
      orderId: id,
      orderCode: `EO${now.getFullYear()}${String(id).padStart(5, '0')}`,
      externalRef: req.externalRef,
      storeId: req.storeId,
      roomNo: req.roomNo.trim(),
      residentName: req.residentName,
      subtotal,
      totalAmount: subtotal,
      status: 'PENDING',
      billingStatus: 'UNBILLED',
      billingPeriod: now.toISOString().slice(0, 7),
      createdAt: now.toISOString(),
      items: items.map((i) => i.line),
    };
    state.orders.unshift(order);
    commit();
    return delay(order);
  },

  listOrders(apiKey: string, storeId: number) {
    if (apiKey !== DEMO_API_KEY) fail(401, 'INVALID_API_KEY', 'API key ไม่ถูกต้องหรือถูกยกเลิก');
    return delay(state.orders.filter((o) => o.storeId === storeId));
  },

  reset() {
    state = seed();
    commit();
  },
});
