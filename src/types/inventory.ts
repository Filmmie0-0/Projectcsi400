// ตรงกับ database/services/03_inventory_db.sql
export interface Material {
  materialId: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  stockOnHand: number;
  reorderLevel: number;
  isLowStock: boolean;
}

export interface MaterialInput {
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  reorderLevel: number;
}

export type RequisitionStatus = 'PENDING' | 'ISSUED' | 'REJECTED' | 'CLOSED';

export interface RequisitionItem {
  itemId: number;
  materialId: number;
  sku: string;
  materialName: string;
  unit: string;
  stockOnHand: number;
  qtyRequested: number;
  qtyIssued: number;
  qtyReturned: number;
  unitCost: number;
}

export interface Requisition {
  requisitionId: number;
  reqCode: string;
  jobId: number;
  jobCode: string;
  technicianId: number;
  technicianName: string;
  status: RequisitionStatus;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  items: RequisitionItem[];
}

export interface RequisitionInput {
  jobId: number;
  note?: string;
  items: { materialId: number; qty: number }[];
}

export type MovementType = 'IN' | 'OUT' | 'RETURN' | 'ADJUST';

export interface StockMovement {
  movementId: number;
  materialId: number;
  sku: string;
  materialName: string;
  unit: string;
  movementType: MovementType;
  qty: number;
  unitCost: number | null;
  reqCode: string | null;
  jobCode: string | null;
  note: string | null;
  createdAt: string;
}
