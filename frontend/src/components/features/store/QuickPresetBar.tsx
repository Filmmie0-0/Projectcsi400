import { Sparkles } from 'lucide-react';
import { PRODUCT_PRESETS } from '../../../constants/productPresets';
import { useApplyPreset } from '../../../hooks/useStore';
import { toApiError } from '../../../services/apiError';

export default function QuickPresetBar() {
  const apply = useApplyPreset();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-dashed border-beige-300 bg-beige-100/60 px-4 py-3">
      <span className="mr-1 flex items-center gap-1.5 text-sm font-medium text-espresso-700">
        <Sparkles className="h-4 w-4 text-mocha-400" /> Quick Preset
      </span>
      {PRODUCT_PRESETS.map((p) => (
        <button
          key={p.id}
          disabled={apply.isPending}
          onClick={() => apply.mutate([p.id])}
          className="rounded-full border border-line bg-white px-3 py-1 text-sm text-espresso-700 transition-colors hover:border-mocha-300 hover:bg-cream-50 disabled:opacity-50"
        >
          + {p.label} <span className="text-espresso-300">({p.products.length})</span>
        </button>
      ))}
      <span className="ml-auto text-xs text-espresso-500">
        {apply.isPending && 'กำลังโหลด...'}
        {apply.isSuccess && `เพิ่ม ${apply.data.added} รายการ${apply.data.skipped ? `, ข้าม ${apply.data.skipped} (SKU ซ้ำ)` : ''}`}
        {apply.isError && <span className="text-danger">{toApiError(apply.error).message}</span>}
      </span>
    </div>
  );
}
