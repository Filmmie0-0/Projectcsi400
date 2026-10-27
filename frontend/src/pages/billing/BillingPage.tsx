import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Table, { Td, Th } from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { BILLING_TYPE } from '../../constants/labels';
import { useContracts, useInvoices, useJobMutation } from '../../hooks/useJobs';
import { jobService } from '../../services/jobService';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import type { Invoice } from '../../types/job';

// ADMIN: ตรวจสลิป + ดูสัญญาทั้งหมด | USER: ชำระงวด + ดูสัญญาของตัวเอง
export default function BillingPage() {
  const role = useAuthStore((s) => s.user!.role);
  const [tab, setTab] = useState<'invoices' | 'contracts'>('invoices');
  const invoices = useInvoices();
  const contracts = useContracts();
  const waiting = (invoices.data ?? []).filter((v) => v.status === (role === 'ADMIN' ? 'PENDING_VERIFY' : 'UNPAID')).length;

  return (
    <>
      <PageHeader title={role === 'ADMIN' ? 'สัญญา & การเงิน' : 'สัญญา & การชำระเงิน'} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'invoices', label: role === 'ADMIN' ? 'งวดชำระ / ตรวจสลิป' : 'งวดชำระ', count: waiting },
          { value: 'contracts', label: 'สัญญา', count: contracts.data?.length },
        ]}
      />
      <div className="mt-4">
        {tab === 'invoices' ? (
          <QueryState query={invoices}>
            {invoices.data?.length ? (
              <Table>
                <thead><tr><Th>งวด</Th><Th>งาน / สัญญา</Th><Th>ครบกำหนด</Th><Th className="text-right">ยอด</Th><Th>สถานะ</Th><Th /></tr></thead>
                <tbody>{invoices.data.map((v) => <InvoiceRow key={v.invoiceId} invoice={v} role={role} />)}</tbody>
              </Table>
            ) : <EmptyState title="ยังไม่มีงวดชำระ" description="งวดชำระจะถูกสร้างเมื่อลงนามสัญญา" />}
          </QueryState>
        ) : (
          <QueryState query={contracts}>
            {contracts.data?.length ? (
              <Table>
                <thead><tr><Th>สัญญา</Th><Th>งาน</Th><Th>รูปแบบ</Th><Th>ระยะเวลา</Th><Th className="text-right">ยอดรวม</Th><Th>สถานะ</Th></tr></thead>
                <tbody>
                  {contracts.data.map((c) => (
                    <tr key={c.contractId}>
                      <Td className="font-mono text-sm">{c.contractNo}{c.contractType === 'ADDENDUM' && <Badge tone="warning" className="ml-2">เพิ่มเติม</Badge>}</Td>
                      <Td><Link to={`/jobs/${c.jobId}`} className="text-walnut-700 hover:underline">{c.jobTitle}</Link><div className="font-mono text-xs text-espresso-500">{c.jobCode}</div></Td>
                      <Td>{BILLING_TYPE[c.billingType].label} × {c.periodQty}</Td>
                      <Td className="whitespace-nowrap text-sm">{formatDate(c.startDate)} – {formatDate(c.endDate)}</Td>
                      <Td className="text-right">{formatCurrency(c.totalAmount)}</Td>
                      <Td><StatusBadge kind="contract" status={c.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <EmptyState title="ยังไม่มีสัญญา" />}
          </QueryState>
        )}
      </div>
    </>
  );
}

function InvoiceRow({ invoice: v, role }: { invoice: Invoice; role: string }) {
  const pay = useJobMutation(jobService.payInvoice);
  const verify = useJobMutation(jobService.verifyInvoice);
  return (
    <tr>
      <Td className="text-sm">{v.description}<div className="font-mono text-xs text-espresso-500">{v.invoiceNo}</div></Td>
      <Td className="text-sm"><Link to={`/jobs/${v.jobId}`} className="text-walnut-700 hover:underline">{v.jobTitle}</Link><div className="font-mono text-xs text-espresso-500">{v.contractNo}</div></Td>
      <Td className="whitespace-nowrap text-sm">{formatDate(v.dueDate)}</Td>
      <Td className="text-right">{formatCurrency(v.amount)}</Td>
      <Td>
        <StatusBadge kind="invoice" status={v.status} />
        {v.slipRef && <div className="mt-1 max-w-[160px] truncate text-xs text-espresso-500" title={v.slipRef}>สลิป: {v.slipRef}</div>}
      </Td>
      <Td className="whitespace-nowrap">
        {role === 'USER' && v.status === 'UNPAID' && (
          <Button
            onClick={() => {
              const slip = window.prompt('เลขอ้างอิงการโอน หรือลิงก์รูปสลิป');
              if (slip?.trim()) pay.mutate([v.invoiceId, slip]);
            }}
          >
            แจ้งชำระ
          </Button>
        )}
        {role === 'ADMIN' && v.status === 'PENDING_VERIFY' && (
          <div className="flex gap-1">
            <Button onClick={() => verify.mutate([v.invoiceId, true])} disabled={verify.isPending}>ยืนยัน</Button>
            <Button variant="ghost" onClick={() => verify.mutate([v.invoiceId, false])} disabled={verify.isPending}>ไม่ผ่าน</Button>
          </div>
        )}
        <ErrorText error={pay.error ?? verify.error} />
      </Td>
    </tr>
  );
}
