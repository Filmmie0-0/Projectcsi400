export type ExternalOrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
export type BillingStatus = 'UNBILLED' | 'BILLED' | 'PAID' | 'VOID';

// รูปแบบข้อมูลของ Open API (/open/v1) ที่ระบบหอพักเรียกใช้
export interface CatalogItem {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  categoryName?: string;
  retailPrice: number;
  stockOnHand: number;
  tiers: Array<{ label?: string; minQty: number; unitPrice: number }>;
}

export interface StoreCatalog {
  storeId: number;
  storeName: string;
  storeStatus: string;
  dormitoryName: string;
  items: CatalogItem[];
}

export interface CreateOrderRequest {
  storeId: number;
  roomNo: string;
  residentName?: string;
  externalRef?: string;
  items: Array<{ productId: number; quantity: number }>;
}

export interface ExternalOrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  tierLabel?: string;
  lineTotal: number;
}

export interface ExternalOrder {
  orderId: number;
  orderCode: string;
  externalRef?: string;
  storeId: number;
  roomNo: string;
  residentName?: string;
  subtotal: number;
  totalAmount: number;
  status: ExternalOrderStatus;
  billingStatus: BillingStatus;
  billingPeriod: string;
  createdAt: string;
  items: ExternalOrderItem[];
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}
