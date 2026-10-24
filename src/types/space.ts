export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface Space {
  spaceId: number;
  ownerId: number;
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
