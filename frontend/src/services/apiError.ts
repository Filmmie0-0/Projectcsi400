import { isAxiosError } from 'axios';
import type { ApiError } from '../types/order';

export function toApiError(err: unknown): ApiError {
  if (isAxiosError(err)) {
    const body = err.response?.data as Partial<ApiError> | undefined;
    return {
      status: err.response?.status ?? 0,
      code: body?.code ?? 'NETWORK_ERROR',
      message: body?.message ?? err.message,
    };
  }
  if (err && typeof err === 'object' && 'status' in err && 'message' in err) return err as ApiError;
  return { status: 0, code: 'UNKNOWN', message: String(err) };
}
