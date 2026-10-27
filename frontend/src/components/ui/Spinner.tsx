import { cn } from '../../utils/cn';

export default function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={cn('inline-block h-6 w-6 animate-spin rounded-full border-2 border-beige-200 border-t-mocha-500', className)}
    />
  );
}
