export interface VehiclePlan {
  vehicle_id: number;
  vehicle_type: string;
  vehicle_name: string;
  start_coords: [number, number];
  to_plant_route: [number, number][];
  to_plant_min: number;
  to_plant_km: number;
  capacity_t: number;
}

export interface PrepBreakdown {
  to_plant_min: number;
  load_min: number;
  delivery_min: number;
  total_min: number;
}

export interface BrigadeVehicle {
  id: number;
  type: string;
  name: string;
  coords: [number, number] | null;
  capacity_t: number;
  to_plant_km: number;
  to_plant_min: number;
}

export interface AutoBrigadeResponse {
  road_id: string;
  plant_id: string;
  plant_name: string;
  vehicles: BrigadeVehicle[];
  prep: PrepBreakdown;
}

export interface PavingRoute {
  road_id: string;
  plant_id: string;
  plant_name: string;
  route: [number, number][];
  distance_km: number;
  duration_min: number;
  start: [number, number];
  end: [number, number];
  source: 'osrm' | 'fallback';
  paving_path: [number, number][];
  paving_length_m: number;
  vehicles: VehiclePlan[];
  prep: PrepBreakdown;
  load_minutes: number;
}

export interface TruckTelemetry {
  type: 'telemetry';
  session_id: string;
  t: number;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  distance: number;
  status: 'moving' | 'stopping' | 'stopped';
}

export interface SimControlMessage {
  type: 'started' | 'finished' | 'error';
  session_id: string;
  message?: string;
}

export type SimMessage = TruckTelemetry | SimControlMessage;

export type PavingPhase =
  | 'idle'
  | 'connecting'
  | 'buffering'
  | 'to_plant'
  | 'loading'
  | 'delivery'
  | 'waiting_weather'
  | 'paving'
  | 'done'
  | 'error';

export type PavingSpeed = 1 | 10 | 100 | 1000;

export interface PavingCompleteResponse {
  road_id: string;
  lanes_updated: number;
  last_paved: string;
  new_condition: string;
}
