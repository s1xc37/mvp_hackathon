import type { VehicleSummary, VehicleType } from './vehicle';

export interface PlanRequest {
  road_id: string;
  lane_id: number;
}

export interface PlanResponse {
  road_id: string;
  road_name: string;
  dump_trucks: number;
  transfer_machines: number;
  pavers: number;
  rollers: number;
  closure_vehicles: number;
  suggested_vehicles: Record<VehicleType, VehicleSummary[]>;
}
