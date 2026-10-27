import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-cream-50 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-espresso-300" />
      <p className="mt-3 font-medium text-espresso-900">{title}</p>
      {description && <p className="mt-1 text-sm text-espresso-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
