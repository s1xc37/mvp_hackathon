import type { VehicleSummary } from './vehicle';

export interface Parking {
  id: number;
  name: string;
  coords: [number, number];
  vehicle_count: number;
}

export interface ParkingDetail extends Parking {
  vehicles: VehicleSummary[];
}
