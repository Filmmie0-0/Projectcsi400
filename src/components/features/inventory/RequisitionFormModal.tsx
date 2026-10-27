import { useState } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { ErrorText } from '../../common/QueryState';
import { useInventoryMutation, useMaterials } from '../../../hooks/useInventory';
import { inventoryService } from '../../../services/inventoryService';

export default function RequisitionFormModal({ jobId, open, onClose }: { jobId: number; open: boolean; onClose: () => void }) {
  const materials = useMaterials();
  const create = useInventoryMutation(inventoryService.createRequisition);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');

  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ materialId: Number(id), qty: n }));
  const list = (materials.data ?? []).filter((m) => `${m.name} ${m.sku} ${m.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal
      wide
      open={open}
      onClose={onClose}
      title="เบิกวัสดุ"
      footer={
        <Button disabled={!items.length || create.isPending} onClick={() => create.mutate([{ jobId, note, items }], { onSuccess: onClose })}>
          ส่งใบเบิก ({items.length} รายการ)
        </Button>
      }
    >
      <div className="space-y-3">
        <Input placeholder="ค้นหาวัสดุ" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 divide-y divide-line/60 overflow-y-auto rounded-lg border border-line">
          {list.map((m) => (
            <div key={m.materialId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1">
                <p>{m.name}</p>
                <p className="text-xs text-espresso-500">{m.category} · คงเหลือ {m.stockOnHand} {m.unit}</p>
              </div>
              <input
                type="number"
                min={0}
                className="w-20 rounded border border-line px-2 py-1"
                value={qty[m.materialId] ?? 0}
                onChange={(e) => setQty({ ...qty, [m.materialId]: Number(e.target.value) })}
              />
              <span className="w-10 text-xs text-espresso-500">{m.unit}</span>
            </div>
          ))}
        </div>
        <Input label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ใช้งานปูพื้นสัปดาห์นี้" />
        <ErrorText error={create.error ?? materials.error} />
      </div>
    </Modal>
  );
}
