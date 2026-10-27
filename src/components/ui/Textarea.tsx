import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export default function Textarea({ label, className, rows = 3, ...rest }: Props) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-espresso-700">{label}</span>}
      <textarea
        rows={rows}
        className={cn(
          'w-full rounded-lg border border-line bg-white px-3 py-2 text-espresso-900 placeholder:text-espresso-500 focus:border-walnut-400',
          className,
        )}
        {...rest}
      />
    </label>
  );
}
