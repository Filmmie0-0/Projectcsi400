export type TransactionType = 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT';

export interface InventoryTransaction {
  transactionId: number;
  productId: number;
  bookingId: number;
  transactionType: TransactionType;
  quantity: number;
  referenceNo?: string;
  reason?: string;
  transactionDate: string;
}

export interface InventoryBalance {
  productId: number;
  bookingId: number;
  quantityOnHand: number;
}
