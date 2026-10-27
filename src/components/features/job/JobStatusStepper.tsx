import { Check } from 'lucide-react';
import { JOB_FLOW, JOB_STATUS } from '../../../constants/labels';
import { cn } from '../../../utils/cn';
import type { JobStatus } from '../../../types/job';

export default function JobStatusStepper({ status }: { status: JobStatus }) {
  if (status === 'CANCELLED') {
    return <p className="rounded-lg bg-cream-200 px-4 py-3 text-sm text-espresso-500">งานนี้ถูกยกเลิกแล้ว</p>;
  }
  const current = JOB_FLOW.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-y-3">
      {JOB_FLOW.map((s, i) => {
        const done = i < current || status === 'COMPLETED';
        const active = i === current && status !== 'COMPLETED';
        return (
          <li key={s} className="flex items-center">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-walnut-500 text-cream-50',
                active && 'bg-warning text-cream-50 ring-4 ring-warning-soft',
                !done && !active && 'bg-cream-200 text-espresso-500',
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn('ml-2 text-xs', active ? 'font-semibold text-espresso-900' : 'text-espresso-500')}>
              {JOB_STATUS[s].label}
            </span>
            {i < JOB_FLOW.length - 1 && <span className="mx-3 hidden h-px w-6 bg-line sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
