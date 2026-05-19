export type Condition = 'Хорошее' | 'Удовлетворительное' | 'Плохое' | 'Критическое';

export interface Lane {
  id: number;
  name: string;
  direction: string;
  condition: Condition;
  last_paved: string;
}

export interface LanePolygon {
  lane_id: number;
  polygon: [number, number][];
}

export interface Road {
  id: string;
  numeric_id: number;
  name: string;
  km_marker: number;
  lat: number;
  lon: number;
  coords: [number, number];
  polygon: [number, number][];
  photo?: string;
  lanes: Lane[];
  lane_polygons: LanePolygon[];
  width_m: number;
  length_m: number;
  layer_type: 'standard' | 'thin';
  plant_id: string;
  delivery_time_min: number;
  repair_hours: number;
  weather_suitable: boolean | null;
  weather_note: string;
  weather_windows: string[];
}
