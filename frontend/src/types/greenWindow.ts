export interface TimeSlot {
  start: string;
  end: string;
  duration_min: number;
  max_tonnage_t: number;
  is_optimal: boolean;
  yellow_start: string;
  rate_t_per_min: number;
}

export interface PrepInfo {
  to_plant_min: number;
  load_min: number;
  delivery_min: number;
  total_min: number;
  has_brigade: boolean;
}

export interface BrigadeMember {
  id: number;
  type: string;
  name: string;
  to_plant_km: number;
  to_plant_min: number;
  capacity_t: number;
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
