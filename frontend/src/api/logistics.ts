import { api } from './client';
import type { RerouteRequest, RerouteResponse } from '@/types/reroute';

export const rerouteTrucks = (req: RerouteRequest) =>
  api.post<RerouteResponse>('/logistics/reroute', req).then(r => r.data);
