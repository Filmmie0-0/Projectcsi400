import type { ReactNode } from 'react';
import Spinner from '../ui/Spinner';
import { errorMessage } from '../../services/apiError';

// ใช้ครอบผลของ useQuery: แสดง loading / error ให้เหมือนกันทุกหน้า
export default function QueryState({ query, children }: { query: { isPending: boolean; error: unknown }; children: ReactNode }) {
  if (query.isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (query.error) return <ErrorText error={query.error} />;
  return <>{children}</>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errorMessage(error)}</p>;
}
