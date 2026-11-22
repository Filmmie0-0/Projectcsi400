import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Paperclip, X } from 'lucide-react';
import Spinner from '../../ui/Spinner';
import { jobService } from '../../../services/jobService';
import { toast } from '../../../store/toastStore';
import type { ContractFile } from '../../../types/job';

export const CONTRACT_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export const MAX_CONTRACT_FILE_MB = 5;

// ตรวจฝั่งเบราว์เซอร์ก่อนส่ง (backend ตรวจซ้ำอีกรอบ)
export function checkContractFile(file: File): string | null {
  if (!CONTRACT_FILE_ACCEPT.split(',').includes(file.type)) return 'แนบได้เฉพาะไฟล์ JPG, PNG, WebP หรือ PDF';
  if (file.size > MAX_CONTRACT_FILE_MB * 1024 * 1024) return `ไฟล์ใหญ่เกิน ${MAX_CONTRACT_FILE_MB} MB`;
  return null;
}

// object URL ของ Blob/File: สร้างเมื่อได้ข้อมูล และคืนหน่วยความจำเมื่อเลิกใช้
export function useObjectUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// ไฟล์ต้องส่ง cookie ไปด้วย จึงโหลดผ่าน apiClient เป็น Blob แทน <img src> ตรง ๆ
export function ContractFileThumb({ file, onRemove }: { file: ContractFile; onRemove?: () => void }) {
  const blob = useQuery({
    queryKey: ['contract-file', file.contractId, file.fileId],
    queryFn: () => jobService.getContractFile(file.contractId, file.fileId),
    staleTime: Infinity,
  });
  const url = useObjectUrl(blob.data);
  const isImage = file.mimeType.startsWith('image/');

  return (
    <div className="group relative w-28">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={file.fileName}
        className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-cream-100 hover:border-walnut-400"
      >
        {!url ? (
          blob.isError ? <span className="px-2 text-center text-xs text-danger">โหลดไฟล์ไม่ได้</span> : <Spinner />
        ) : isImage ? (
          <img src={url} alt={file.fileName} className="h-full w-full bg-white object-contain" />
        ) : (
          <FileText className="h-10 w-10 text-walnut-500" />
        )}
      </a>
      <div className="mt-1 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-xs text-espresso-500" title={file.fileName}>{file.fileName}</p>
        {url && (
          <a
            href={url}
            download={file.fileName}
            onClick={() => toast.info(`ดาวน์โหลด ${file.fileName}`)}
            title={`ดาวน์โหลด ${file.fileName}`}
            aria-label={`ดาวน์โหลด ${file.fileName}`}
            className="shrink-0 rounded p-0.5 text-walnut-600 hover:bg-cream-100"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`ลบ ${file.fileName}`}
          className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-espresso-500 shadow hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ContractFileGroup({ title, files, onRemove }: { title: string; files: ContractFile[]; onRemove?: (f: ContractFile) => void }) {
  if (!files.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-espresso-500">{title}</p>
      <div className="flex flex-wrap gap-3">
        {files.map((f) => <ContractFileThumb key={f.fileId} file={f} onRemove={onRemove && (() => onRemove(f))} />)}
      </div>
    </div>
  );
}

// ปุ่มเลือกไฟล์ (ซ่อน <input type=file> ไว้หลังปุ่ม)
export function FilePickButton({ label, disabled, onPick }: { label: string; disabled?: boolean; onPick: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-walnut-300 px-3 py-2 text-sm text-walnut-600 hover:bg-cream-100 disabled:opacity-50"
      >
        <Paperclip className="h-4 w-4" /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={CONTRACT_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
    </>
  );
}
