import type { VehicleSummary } from './vehicle';

export interface Factory {
  id: string;
  name: string;
  lat: number;
  lon: number;
  coords?: [number, number];
  capacity_t_per_hour: number;
  mix_temp_c: number;
  active: boolean;
  materials: string[];
  vehicle_ids: number[];
  vehicle_count: number;
}

export interface FactoryDetail extends Factory {
  vehicles: VehicleSummary[];
  vehicle_count: number;
}
