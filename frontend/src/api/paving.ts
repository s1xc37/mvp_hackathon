import { api } from './client';
import type { PavingRoute, PavingCompleteResponse, AutoBrigadeResponse } from '@/types/paving';

export const buildPavingRoute = (roadId: string, vehicleIds?: number[], plantId?: string) =>
  api.post<PavingRoute>('/paving/route', {
    road_id: roadId,
    plant_id: plantId,
    vehicle_ids: vehicleIds && vehicleIds.length > 0 ? vehicleIds : null,
  }).then(r => r.data);

export const autoBrigade = (roadId: string) =>
  api.post<AutoBrigadeResponse>('/paving/auto-brigade', { road_id: roadId }).then(r => r.data);

export const completePaving = (roadId: string, laneNums?: number[], vehicleIds?: number[]) =>
  api.post<PavingCompleteResponse>('/paving/complete', {
    road_id: roadId,
    lane_nums: laneNums && laneNums.length > 0 ? laneNums : null,
    vehicle_ids: vehicleIds && vehicleIds.length > 0 ? vehicleIds : null,
  }).then(r => r.data);

export const resetDemo = () =>
  api.post<{ reset: number; message: string }>('/paving/reset-demo').then(r => r.data);

export const SIM_WS_URL =
  (import.meta.env.VITE_SIM_WS_URL as string | undefined) ?? 'ws://localhost:8001/ws/simulate';
