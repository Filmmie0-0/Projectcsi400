export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface Space {
  spaceId: number;
  ownerId: number;
  dormitoryId?: number;
  dormitoryName?: string;
  dormitoryTotalRooms?: number;
  name: string;
  description?: string;
  sizeSqm: number;
  pricePerMonth: number;
  depositAmount: number;
  province: string;
  district?: string;
  address: string;
  availabilityStatus: AvailabilityStatus;
  coverImageUrl?: string;
}

export interface SpaceSearchParams {
  q?: string;
  province?: string;
  maxPrice?: number;
}
