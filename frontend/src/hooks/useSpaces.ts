import { useQuery } from '@tanstack/react-query';
import { spaceService } from '../services/spaceService';
import type { SpaceSearchParams } from '../types/space';

export const useSpaceSearch = (params: SpaceSearchParams) =>
  useQuery({ queryKey: ['spaces', params], queryFn: () => spaceService.search(params) });
