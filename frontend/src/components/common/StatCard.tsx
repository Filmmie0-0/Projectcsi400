import type { LucideIcon } from 'lucide-react';
import Card from '../ui/Card';

export default function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon?: LucideIcon; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-espresso-500">{label}</p>
        {Icon && <Icon className="h-5 w-5 text-walnut-400" />}
      </div>
      <p className="mt-2 text-2xl font-semibold text-espresso-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-espresso-500">{hint}</p>}
    </Card>
  );
}
