import { useEffect, useState } from 'react';
import { Store as StoreIcon, Check } from 'lucide-react';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { useUpdateStore } from '../../../hooks/useStore';
import { toApiError } from '../../../services/apiError';
import { cn } from '../../../utils/cn';
import type { Store, StoreUpdate } from '../../../types/store';

export default function StoreProfileForm({ store }: { store: Store }) {
  const [form, setForm] = useState<StoreUpdate>(store);
  const update = useUpdateStore();
  useEffect(() => setForm(store), [store]);

  const set = <K extends keyof StoreUpdate>(key: K, value: StoreUpdate[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isOpen = form.status === 'OPEN';

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-cream-100">
          {form.logoUrl ? (
            <img src={form.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <StoreIcon className="h-7 w-7 text-mocha-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-espresso-500">ร้านของคุณที่ {store.dormitoryName}</p>
          <p className="truncate text-xl font-semibold text-espresso-900">{form.name || 'ยังไม่ได้ตั้งชื่อร้าน'}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOpen}
          onClick={() => set('status', isOpen ? 'CLOSED' : 'OPEN')}
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            isOpen ? 'bg-success-soft text-success' : 'bg-cream-200 text-espresso-500',
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', isOpen ? 'bg-success' : 'bg-espresso-300')} />
          {isOpen ? 'เปิดร้าน' : 'ปิดร้าน'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="ชื่อร้าน" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น ร้านส่งดี ใต้หอ" />
        <Input label="URL โลโก้" value={form.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value || undefined)} placeholder="https://..." />
      </div>
      <Input label="คำอธิบายร้าน" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="ขายส่งน้ำดื่ม ขนม ของใช้ในห้องพัก" />

      <div className="flex items-center justify-end gap-3">
        {update.isError && <p className="text-sm text-danger">{toApiError(update.error).message}</p>}
        {update.isSuccess && !update.isPending && (
          <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> บันทึกแล้ว</p>
        )}
        <Button disabled={update.isPending} onClick={() => update.mutate([form])}>
          {update.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้าน'}
        </Button>
      </div>
    </Card>
  );
}
