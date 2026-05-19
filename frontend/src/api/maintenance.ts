import { api } from './client';
import type { MaintenanceRequest, MaintenanceResponse } from '@/types/maintenance';

export const scheduleMaintenance = (req: MaintenanceRequest) =>
  api.post<MaintenanceResponse>('/maintenance/schedule', req).then(r => r.data);
