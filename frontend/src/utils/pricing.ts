interface Tier { label?: string; minQty: number; unitPrice: number }

// เลือกราคาขั้นบันไดที่ min_qty สูงสุดที่ไม่เกินจำนวนซื้อ (ตรงกับ trg_order_item_before_insert)
export function resolveUnitPrice(retailPrice: number, tiers: Tier[], quantity: number) {
  const tier = tiers
    .filter((t) => t.minQty <= quantity)
    .sort((a, b) => b.minQty - a.minQty)[0];
  return tier
    ? { unitPrice: tier.unitPrice, tierLabel: tier.label ?? `${tier.minQty}+ ชิ้น` }
    : { unitPrice: retailPrice, tierLabel: undefined };
}
