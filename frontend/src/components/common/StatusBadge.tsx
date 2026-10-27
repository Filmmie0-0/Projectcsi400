import Badge from '../ui/Badge';
import { CONTRACT_STATUS, INVOICE_STATUS, JOB_STATUS, REQUISITION_STATUS } from '../../constants/labels';

const MAPS = { job: JOB_STATUS, contract: CONTRACT_STATUS, invoice: INVOICE_STATUS, requisition: REQUISITION_STATUS };

type Props =
  | { kind: 'job'; status: keyof typeof JOB_STATUS }
  | { kind: 'contract'; status: keyof typeof CONTRACT_STATUS }
  | { kind: 'invoice'; status: keyof typeof INVOICE_STATUS }
  | { kind: 'requisition'; status: keyof typeof REQUISITION_STATUS };

export default function StatusBadge({ kind, status }: Props) {
  const { label, tone } = (MAPS[kind] as Record<string, { label: string; tone: Parameters<typeof Badge>[0]['tone'] }>)[status];
  return <Badge tone={tone}>{label}</Badge>;
}
