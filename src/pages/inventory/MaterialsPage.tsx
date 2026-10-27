import { useState } from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Table, { Td, Th } from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { MOVEMENT } from '../../constants/labels';
import { useInventoryMutation, useMaterials, useMovements } from '../../hooks/useInventory';
import { inventoryService } from '../../services/inventoryService';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDateTime } from '../../utils/formatDate';
import type { Material, MaterialInput } from '../../types/inventory';

export default function MaterialsPage() {
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<{ material: Material; mode: 'in' | 'adjust' } | null>(null);
  const materials = useMaterials();
  const movements = useMovements();

  return (
    <>
      <PageHeader
        title="คลังวัสดุ"
        description="สต็อกเปลี่ยนผ่านการเคลื่อนไหว (รับเข้า / จ่ายตามใบเบิก / คืน / ปรับยอด) เท่านั้น"
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> เพิ่มวัสดุ</Button>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'สต็อกคงเหลือ' }, { value: 'movements', label: 'ประวัติเคลื่อนไหว' }]} />
      <div className="mt-4">
        {tab === 'stock' ? (
          <QueryState query={materials}>
            <Table>
              <thead><tr><Th>SKU</Th><Th>วัสดุ</Th><Th>หมวด</Th><Th className="text-right">ต้นทุน/หน่วย</Th><Th className="text-right">คงเหลือ</Th><Th /></tr></thead>
              <tbody>
                {materials.data?.map((m) => (
                  <tr key={m.materialId}>
                    <Td className="font-mono text-xs">{m.sku}</Td>
                    <Td>{m.name}</Td>
                    <Td className="text-sm text-espresso-500">{m.category}</Td>
                    <Td className="text-right">{formatCurrency(m.unitCost)}</Td>
                    <Td className="text-right">
                      {m.stockOnHand} {m.unit}
                      {m.isLowStock && <Badge tone="danger" className="ml-2">ใกล้หมด (≤{m.reorderLevel})</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button variant="secondary" onClick={() => setMoving({ material: m, mode: 'in' })}>รับเข้า</Button>
                      <Button variant="ghost" onClick={() => setMoving({ material: m, mode: 'adjust' })}>ปรับยอด</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </QueryState>
        ) : (
          <QueryState query={movements}>
            <Table>
              <thead><tr><Th>เวลา</Th><Th>ประเภท</Th><Th>วัสดุ</Th><Th className="text-right">จำนวน</Th><Th>อ้างอิง</Th></tr></thead>
              <tbody>
                {movements.data?.map((mv) => (
                  <tr key={mv.movementId}>
                    <Td className="whitespace-nowrap text-sm">{formatDateTime(mv.createdAt)}</Td>
                    <Td><Badge tone={MOVEMENT[mv.movementType].tone}>{MOVEMENT[mv.movementType].label}</Badge></Td>
                    <Td>{mv.materialName}</Td>
                    <Td className="text-right">{mv.movementType === 'OUT' ? -mv.qty : mv.qty} {mv.unit}</Td>
                    <Td className="text-sm text-espresso-500">{[mv.reqCode, mv.jobCode, mv.note].filter(Boolean).join(' · ')}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </QueryState>
        )}
      </div>
      {creating && <MaterialModal onClose={() => setCreating(false)} />}
      {moving && <MovementModal {...moving} onClose={() => setMoving(null)} />}
    </>
  );
}

function MaterialModal({ onClose }: { onClose: () => void }) {
  const create = useInventoryMutation(inventoryService.createMaterial);
  const [m, setM] = useState<MaterialInput>({ sku: '', name: '', category: '', unit: '', unitCost: 0, reorderLevel: 0 });
  const set = (k: keyof MaterialInput, num = false) => (e: { target: { value: string } }) =>
    setM({ ...m, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <Modal open title="เพิ่มวัสดุ" onClose={onClose} footer={<Button disabled={create.isPending} onClick={() => create.mutate([m], { onSuccess: onClose })}>บันทึก</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="SKU" value={m.sku} onChange={set('sku')} />
        <Input label="ชื่อวัสดุ" value={m.name} onChange={set('name')} />
        <Input label="หมวด" value={m.category} onChange={set('category')} placeholder="งานสี, ไฟฟ้า, ประปา" />
        <Input label="หน่วย" value={m.unit} onChange={set('unit')} placeholder="ถุง, แผ่น, ชุด" />
        <Input label="ต้นทุน/หน่วย" type="number" value={m.unitCost} onChange={set('unitCost', true)} />
        <Input label="จุดสั่งซื้อซ้ำ" type="number" value={m.reorderLevel} onChange={set('reorderLevel', true)} />
        <div className="col-span-2"><ErrorText error={create.error} /></div>
      </div>
    </Modal>
  );
}

function MovementModal({ material, mode, onClose }: { material: Material; mode: 'in' | 'adjust'; onClose: () => void }) {
  const stockIn = useInventoryMutation(inventoryService.stockIn);
  const adjust = useInventoryMutation(inventoryService.adjust);
  const [qty, setQty] = useState(0);
  const [unitCost, setUnitCost] = useState(material.unitCost);
  const [note, setNote] = useState('');
  const m = mode === 'in' ? stockIn : adjust;
  const submit = () =>
    mode === 'in'
      ? stockIn.mutate([{ materialId: material.materialId, qty, unitCost, note }], { onSuccess: onClose })
      : adjust.mutate([{ materialId: material.materialId, qty, note }], { onSuccess: onClose });
  return (
    <Modal
      open
      title={`${mode === 'in' ? 'รับเข้า' : 'ปรับยอด'}: ${material.name}`}
      onClose={onClose}
      footer={<Button disabled={!qty || m.isPending || (mode === 'adjust' && !note.trim())} onClick={submit}>บันทึก</Button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-espresso-500">คงเหลือปัจจุบัน {material.stockOnHand} {material.unit}</p>
        <Input label={mode === 'in' ? `จำนวนรับเข้า (${material.unit})` : 'จำนวนปรับ (+ เพิ่ม / - ลด)'} type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        {mode === 'in' && <Input label="ต้นทุนต่อหน่วยล่าสุด" type="number" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} />}
        <Input label={mode === 'in' ? 'หมายเหตุ (เลขใบส่งของ)' : 'เหตุผล'} value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorText error={m.error} />
      </div>
    </Modal>
  );
}
