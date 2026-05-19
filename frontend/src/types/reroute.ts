export interface RerouteRequest {
  blocked_site_id: string;
  available_tonnage_t: number;
}

export interface RerouteOption {
  site_id: string;
  site_name: string;
  distance_km: number;
  extra_time_min: number;
  has_green_window: boolean;
  recommended_tonnage_t: number;
}

export interface RerouteResponse {
  blocked_site_id: string;
  options: RerouteOption[];
  recommendation: string;
}
