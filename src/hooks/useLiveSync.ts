import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { USE_MOCK } from '../services/config';
import { subscribeMockDb } from '../services/mock/mockDb';

// mock: refetch ทุก query เมื่อข้อมูลเปลี่ยน (รวมจากแท็บอื่น) — โหมด API จริงใช้ refetchInterval แทน
export function useLiveSync() {
  const qc = useQueryClient();
  useEffect(() => (USE_MOCK ? subscribeMockDb(() => void qc.invalidateQueries()) : undefined), [qc]);
}
