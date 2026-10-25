import type { ProductInput } from '../types/store';

export interface ProductPreset {
  id: string;
  label: string;
  categoryName: string;
  products: Omit<ProductInput, 'categoryId'>[];
}

// Quick Preset: สินค้าสำเร็จรูปยอดนิยมของร้านใต้หอพัก
export const PRODUCT_PRESETS: ProductPreset[] = [
  {
    id: 'drinks',
    label: 'เครื่องดื่ม',
    categoryName: 'เครื่องดื่ม',
    products: [
      { sku: 'DRK-WATER-600', name: 'น้ำดื่ม 600 มล.', unit: 'ขวด', unitsPerCase: 12, sellingPrice: 10, initialStock: 120,
        tiers: [{ label: '6 ขวด', minQty: 6, unitPrice: 9 }, { label: 'ยกแพ็ค', minQty: 12, unitPrice: 7.5 }] },
      { sku: 'DRK-COLA-325', name: 'น้ำอัดลม กระป๋อง 325 มล.', unit: 'กระป๋อง', unitsPerCase: 24, sellingPrice: 17, initialStock: 96,
        tiers: [{ label: 'ยกลัง', minQty: 24, unitPrice: 14 }] },
      { sku: 'DRK-MILK-225', name: 'นม UHT 225 มล.', unit: 'กล่อง', unitsPerCase: 36, sellingPrice: 14, initialStock: 72,
        tiers: [{ label: '4 กล่อง', minQty: 4, unitPrice: 13 }, { label: 'ยกลัง', minQty: 36, unitPrice: 11.5 }] },
    ],
  },
  {
    id: 'snacks',
    label: 'บะหมี่ & ขนม',
    categoryName: 'บะหมี่และขนม',
    products: [
      { sku: 'SNK-NOODLE', name: 'บะหมี่กึ่งสำเร็จรูป', unit: 'ซอง', unitsPerCase: 30, sellingPrice: 7, initialStock: 150,
        tiers: [{ label: '10 ซอง', minQty: 10, unitPrice: 6.5 }, { label: 'ยกลัง', minQty: 30, unitPrice: 6 }] },
      { sku: 'SNK-CHIPS', name: 'มันฝรั่งทอด ซองกลาง', unit: 'ซอง', unitsPerCase: 12, sellingPrice: 20, initialStock: 48,
        tiers: [{ label: 'ยกแพ็ค', minQty: 12, unitPrice: 17 }] },
    ],
  },
  {
    id: 'household',
    label: 'ของใช้ในห้อง',
    categoryName: 'ของใช้ในห้องพัก',
    products: [
      { sku: 'HH-TISSUE', name: 'กระดาษทิชชู่ แพ็ค 6 ม้วน', unit: 'แพ็ค', sellingPrice: 65, initialStock: 30,
        tiers: [{ label: '3 แพ็ค', minQty: 3, unitPrice: 58 }] },
      { sku: 'HH-DETERGENT', name: 'ผงซักฟอก 800 ก.', unit: 'ถุง', unitsPerCase: 12, sellingPrice: 55, initialStock: 24,
        tiers: [{ label: 'ยกลัง', minQty: 12, unitPrice: 48 }] },
      { sku: 'HH-TRASHBAG', name: 'ถุงขยะ 18x20 นิ้ว', unit: 'แพ็ค', sellingPrice: 25, initialStock: 40, tiers: [] },
    ],
  },
];
