import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

// ตารางแบบ composable: <Table><thead><tr><Th/></tr></thead><tbody><tr><Td/></tr></tbody></Table>
export default function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-soft">
      <table className={cn('w-full text-left text-sm', className)} {...rest} />
    </div>
  );
}

export const Th = ({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('border-b border-line bg-cream-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-espresso-500', className)} {...rest} />
);

export const Td = ({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-line/60 px-4 py-3 align-top text-espresso-900', className)} {...rest} />
);
