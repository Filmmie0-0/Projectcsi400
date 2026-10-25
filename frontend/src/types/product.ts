export interface Product {
  productId: number;
  tenantId: number;
  categoryId?: number;
  sku: string;
  name: string;
  unit: string;
  costPrice?: number;
  sellingPrice?: number;
  reorderLevel: number;
  isActive: boolean;
}
