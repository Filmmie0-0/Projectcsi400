import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export default function Select({ label, options, placeholder, className, ...rest }: Props) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-espresso-700">{label}</span>}
      <select
        className={cn('w-full rounded-lg border border-line bg-white px-3 py-2 text-espresso-900 focus:border-walnut-400', className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
