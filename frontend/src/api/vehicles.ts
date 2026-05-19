import { api } from './client';
import type { Vehicle, VehicleSummary } from '@/types/vehicle';

export const getVehicles = (type?: string) =>
  api.get<VehicleSummary[]>('/vehicles', { params: type ? { type } : {} }).then(r => r.data);
export const getVehicle = (id: number) => api.get<Vehicle>(`/vehicles/${id}`).then(r => r.data);
