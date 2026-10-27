import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../ui/Button';
import StatusBadge from '../../common/StatusBadge';
import { ErrorText } from '../../common/QueryState';
import { useInventoryMutation } from '../../../hooks/useInventory';
import { inventoryService } from '../../../services/inventoryService';
import { formatDateTime } from '../../../utils/formatDate';
import type { Requisition } from '../../../types/inventory';
import type { Role } from '../../../types/user';

// แอดมิน: PENDING → จ่ายของ (แก้จำนวนจ่ายได้) / ไม่อนุมัติ
// ช่างเจ้าของใบเบิก: ISSUED → คืนของเหลือแล้วปิดใบเบิก
export default function RequisitionCard({ req, role, userId }: { req: Requisition; role: Role; userId: number }) {
  const canIssue = role === 'ADMIN' && req.status === 'PENDING';
  const canClose = role === 'TECHNICIAN' && req.status === 'ISSUED' && req.technicianId === userId;
  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(req.items.map((i) => [i.itemId, canIssue ? Math.min(i.qtyRequested, i.stockOnHand) : 0])));
  const issue = useInventoryMutation(inventoryService.issue);
  const reject = useInventoryMutation(inventoryService.reject);
  const close = useInventoryMutation(inventoryService.close);

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-medium">{req.reqCode}</span>
        <StatusBadge kind="requisition" status={req.status} />
        <Link to={`/jobs/${req.jobId}`} className="font-mono text-walnut-600 hover:underline">{req.jobCode}</Link>
        <span className="text-espresso-500">{req.technicianName} · {formatDateTime(req.createdAt)}</span>
      </div>
      {req.note && <p className="mt-1 text-sm text-espresso-500">{req.note}</p>}
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-espresso-500">
          <tr>
            <th className="pb-1">วัสดุ</th><th>ขอ</th><th>จ่าย</th><th>คืน</th>
            {canIssue && <th>คงคลัง</th>}
            {(canIssue || canClose) && <th>{canIssue ? 'จำนวนจ่าย' : 'จำนวนคืน'}</th>}
          </tr>
        </thead>
        <tbody>
          {req.items.map((i) => (
            <tr key={i.itemId} className="border-t border-line/60">
              <td className="py-1.5">{i.materialName} <span className="text-xs text-espresso-500">({i.unit})</span></td>
              <td>{i.qtyRequested}</td>
              <td>{i.qtyIssued}</td>
              <td>{i.qtyReturned}</td>
              {canIssue && <td className={i.stockOnHand < i.qtyRequested ? 'text-danger' : ''}>{i.stockOnHand}</td>}
              {(canIssue || canClose) && (
                <td>
                  <input
                    type="number"
                    min={0}
                    max={canIssue ? i.qtyRequested : i.qtyIssued}
                    className="w-20 rounded border border-line px-2 py-1"
                    value={qty[i.itemId]}
                    onChange={(e) => setQty({ ...qty, [i.itemId]: Number(e.target.value) })}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {req.rejectReason && <p className="mt-2 text-xs text-danger">เหตุผล: {req.rejectReason}</p>}
      <div className="mt-3 flex gap-2">
        {canIssue && (
          <>
            <Button onClick={() => issue.mutate([req.requisitionId, req.items.map((i) => ({ itemId: i.itemId, qtyIssued: qty[i.itemId] }))])} disabled={issue.isPending}>
              อนุมัติและจ่ายของ
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const reason = window.prompt('เหตุผลที่ไม่อนุมัติ');
                if (reason !== null) reject.mutate([req.requisitionId, reason]);
              }}
            >
              ไม่อนุมัติ
            </Button>
          </>
        )}
        {canClose && (
          <Button variant="secondary" onClick={() => close.mutate([req.requisitionId, req.items.map((i) => ({ itemId: i.itemId, qtyReturned: qty[i.itemId] }))])} disabled={close.isPending}>
            คืนของเหลือ & ปิดใบเบิก
          </Button>
        )}
      </div>
      <ErrorText error={issue.error ?? reject.error ?? close.error} />
    </div>
  );
}
