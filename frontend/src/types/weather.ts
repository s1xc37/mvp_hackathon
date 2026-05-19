export interface WeatherPoint {
  time: string;
  temp_c: number;
  feels_like_c: number | null;
  wind_ms: number;
  wind_gust_ms: number | null;
  precip_mm: number;
  precip_probability: number | null;
  humidity_pct: number;
  pressure_hpa: number | null;
  cloudiness_pct: number | null;
  description: string;
  has_precipitation: boolean;
}

export interface WeatherForecast {
  site_id: string;
  lat: number;
  lon: number;
  fetched_at: string;
  points: WeatherPoint[];
  source: string;
}
