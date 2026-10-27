import { cn } from '../../utils/cn';

interface Props<T extends string> {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}

export default function Tabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'border-walnut-500 text-walnut-700' : 'border-transparent text-espresso-500 hover:text-espresso-900',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-cream-200 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
