export type StoreStatus = 'OPEN' | 'CLOSED' | 'SUSPENDED';

export interface Store {
  storeId: number;
  tenantId: number;
  bookingId: number;
  dormitoryId: number;
  dormitoryName: string;
  name: string;
  logoUrl?: string;
  description?: string;
  status: StoreStatus;
}

export type StoreUpdate = Pick<Store, 'name' | 'logoUrl' | 'description' | 'status'>;

export interface Category {
  categoryId: number;
  name: string;
}

// ราคาขั้นบันได: ซื้อ >= minQty ได้ unitPrice ต่อชิ้น (product_price_tiers)
export interface PriceTier {
  tierId: number;
  label?: string;
  minQty: number;
  unitPrice: number;
}

export interface StoreProduct {
  productId: number;
  categoryId?: number;
  sku: string;
  name: string;
  unit: string;
  unitsPerCase?: number;
  sellingPrice: number;
  stockOnHand: number;
  tiers: PriceTier[];
}

export interface ProductInput {
  categoryId?: number;
  sku: string;
  name: string;
  unit: string;
  unitsPerCase?: number;
  sellingPrice: number;
  initialStock: number;
  tiers: Array<Omit<PriceTier, 'tierId'>>;
}
