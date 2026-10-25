import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function PageHeader({ title, description, action }: Props) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-espresso-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-espresso-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
