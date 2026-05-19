export interface TimeSlot {
  start: string;
  end: string;
  duration_min: number;
  max_tonnage_t: number;
  is_optimal: boolean;
  yellow_start: string;
  rate_t_per_min: number;
  optimal_tonnage_t: number;
  bottleneck: 'paver' | 'demand' | 'plant' | 'delivery';
}

export interface PrepInfo {
  to_plant_min: number;
  load_min: number;
  delivery_min: number;
  total_min: number;
  has_brigade: boolean;
  mix_temp_start_c: number;
  mix_temp_arrival_c: number;
  mix_usable: boolean;
  mix_optimal: boolean;
  heated_share: number;
  cool_rate: number;
  cool_rate_waiting: number;
  site_wait_min: number;
  required_mix_temp_c: number;
  drying_min: number;
  air_temp_c: number | null;
  wind_ms: number | null;
}

export interface BrigadeMember {
  id: number;
  type: string;
  name: string;
  to_plant_km: number;
  to_plant_min: number;
  capacity_t: number;
  is_heated: boolean;
}

export interface GreenWindow {
  site_id: string;
  site_name: string;
  date: string;
  slots: TimeSlot[];
  order_deadline: string | null;
  warnings: string[];
  prep?: PrepInfo;
  brigade?: BrigadeMember[];
  plant_name?: string;
  road_total_t: number;
  road_area_m2: number;
}
