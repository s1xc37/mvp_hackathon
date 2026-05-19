import { api } from './client';
import type { GreenWindow } from '@/types/greenWindow';

export const getGreenWindows = () => api.get<GreenWindow[]>('/green-windows').then(r => r.data);

export const getGreenWindow = (
  siteId: string,
  opts?: { vehicleIds?: number[]; auto?: boolean },
) => {
  const params: Record<string, string> = {};
  if (opts?.vehicleIds && opts.vehicleIds.length > 0) {
    params.vehicle_ids = opts.vehicleIds.join(',');
  }
  if (opts?.auto) params.auto = 'true';
  return api.get<GreenWindow>(`/green-windows/${siteId}`, { params }).then(r => r.data);
};
