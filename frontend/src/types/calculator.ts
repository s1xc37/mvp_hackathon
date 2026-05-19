export interface CalcRequest {
  site_id: string;
  time_to_rain_min: number;
  mix_temp_c: number;
  paver_width_m: number;
  layer_type: 'standard' | 'thin';
}

export interface CalcResponse {
  site_id: string;
  time_to_rain_min: number;
  compaction_time_min: number;
  available_paving_min: number;
  max_tonnage_t: number;
  trucks_needed: number;
  recommendation: string;
  can_start: boolean;
}
