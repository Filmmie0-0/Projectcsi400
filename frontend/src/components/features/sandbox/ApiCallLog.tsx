import { Terminal } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ApiCall } from '../../../services/dormApiService';

export interface LoggedCall extends ApiCall<unknown> {
  id: number;
  at: Date;
}

const preview = (v: unknown) => JSON.stringify(v, null, 2).split('\n').slice(0, 40).join('\n');

export default function ApiCallLog({ calls, apiKey }: { calls: LoggedCall[]; apiKey: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card bg-espresso-900 text-cream-100 shadow-lift">
      <div className="flex items-center gap-2 border-b border-espresso-700 px-4 py-3 text-sm">
        <Terminal className="h-4 w-4 text-beige-300" />
        <span className="font-medium">API Request Log</span>
        <span className="ml-auto font-mono text-xs text-espresso-300">X-API-Key: {apiKey.slice(0, 8)}••••</span>
      </div>
      <div className="max-h-[560px] flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs">
        {!calls.length && <p className="text-espresso-300">รอ request แรก...</p>}
        {calls.map((c) => (
          <details key={c.id} className="group rounded-lg bg-espresso-800 p-3" open={c.id === calls[0].id && c.method === 'POST'}>
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 font-semibold', c.method === 'POST' ? 'bg-warning/30 text-beige-200' : 'bg-info/40 text-cream-100')}>
                {c.method}
              </span>
              <span className="truncate">/open/v1{c.path}</span>
              <span className={cn('ml-auto font-semibold', c.error ? 'text-danger-soft' : 'text-success-soft')}>{c.status || 'ERR'}</span>
              <span className="w-14 text-right text-espresso-300">{Math.round(c.durationMs)}ms</span>
            </summary>
            <div className="mt-2 space-y-2 border-t border-espresso-700 pt-2">
              <p className="text-espresso-300">{c.at.toLocaleTimeString('th-TH')}</p>
              {c.requestBody !== undefined && (
                <pre className="whitespace-pre-wrap text-beige-200">{'// request\n'}{preview(c.requestBody)}</pre>
              )}
              <pre className="whitespace-pre-wrap text-cream-200">{'// response\n'}{preview(c.error ?? c.data)}</pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
