import { apiClient } from './apiClient';
import { USE_MOCK } from './config';
import { mockDb } from './mock/mockDb';
import type { Space, SpaceSearchParams } from '../types/space';

export const spaceService = {
  search: (params: SpaceSearchParams): Promise<Space[]> =>
    USE_MOCK ? mockDb.searchSpaces(params) : apiClient.get<Space[]>('/spaces', { params }).then((r) => r.data),
};
