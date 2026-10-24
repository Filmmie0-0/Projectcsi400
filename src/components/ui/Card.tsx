import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-white p-6 shadow-soft', className)} {...rest} />;
}
