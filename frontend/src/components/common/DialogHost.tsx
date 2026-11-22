import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { useDialogStore } from '../../store/dialogStore';

// วางไว้ครั้งเดียวที่ root แล้วเรียก confirmDialog / promptDialog จากที่ไหนก็ได้
export default function DialogHost() {
  const { current: d, close } = useDialogStore();
  const [text, setText] = useState('');
  useEffect(() => setText(''), [d]);

  if (!d) return null;
  const blocked = !!d.input?.required && !text.trim();
  const ok = () => !blocked && close(d.input ? text.trim() : '');

  return (
    <Modal
      open
      title={d.title}
      onClose={() => close(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>ยกเลิก</Button>
          <Button variant={d.danger ? 'danger' : 'primary'} onClick={ok} disabled={blocked}>{d.confirmText ?? 'ตกลง'}</Button>
        </>
      }
    >
      {d.message && <p className="text-sm text-espresso-700">{d.message}</p>}
      {d.input && (
        <div className={d.message ? 'mt-3' : ''}>
          <Textarea
            autoFocus
            label={d.input.label}
            placeholder={d.input.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), ok())}
          />
          {!d.input.required && <p className="mt-1 text-xs text-espresso-500">เว้นว่างได้</p>}
        </div>
      )}
    </Modal>
  );
}
