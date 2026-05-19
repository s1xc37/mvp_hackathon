export type VehicleType = 'dump_truck' | 'transfer_machine' | 'paver' | 'roller' | 'closure_vehicle';

export interface ScheduleEntry {
  date: string;
  time: string;
  location: string;
  task: string;
}

export interface VehicleSummary {
  id: number;
  type: VehicleType;
  name: string;
  coords: [number, number] | null;
  speed_kmh: number;
  current_task: string | null;
  location_type: string | null;
  location_name: string | null;
  home_type: string | null;
  home_id: number | string | null;
  capacity_t?: number;
  load_t?: number;
}

export interface Vehicle extends VehicleSummary {
  home_type: string | null;
  home_id: number | string | null;
  schedule: ScheduleEntry[];
}
