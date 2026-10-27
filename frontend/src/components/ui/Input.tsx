import type { InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, className, ...rest }: Props) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-espresso-700">{label}</span>}
      <input
        className={cn(
          'w-full rounded-lg border border-line bg-white px-3 py-2 text-espresso-900 placeholder:text-espresso-500 focus:border-walnut-400',
          className,
        )}
        {...rest}
      />
    </label>
  );
}
