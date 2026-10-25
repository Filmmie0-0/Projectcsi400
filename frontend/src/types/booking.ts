export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface Booking {
  bookingId: number;
  bookingCode: string;
  spaceId: number;
  tenantId: number;
  startDate: string;
  endDate: string;
  totalAmount: number;
  status: BookingStatus;
  rejectReason?: string;
}
