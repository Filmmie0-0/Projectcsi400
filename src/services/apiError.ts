import { isAxiosError } from 'axios';
import type { ApiError } from '../types/api';

export function toApiError(err: unknown): ApiError {
  if (isAxiosError(err)) {
    const body = err.response?.data as Partial<ApiError> | undefined;
    return {
      status: err.response?.status ?? 0,
      code: body?.code ?? 'NETWORK_ERROR',
      message: body?.message ?? (err.response ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เปิด npm run stack:up แล้วหรือยัง?)'),
    };
  }
  if (err && typeof err === 'object' && 'status' in err && 'message' in err) return err as ApiError;
  return { status: 0, code: 'UNKNOWN', message: String(err) };
}

export const errorMessage = (err: unknown) => (err ? toApiError(err).message : '');
