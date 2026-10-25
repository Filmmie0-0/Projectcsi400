export interface Dormitory {
  dormitoryId: number;
  ownerId: number;
  name: string;
  totalRooms: number;
  province: string;
  district?: string;
  address: string;
}
