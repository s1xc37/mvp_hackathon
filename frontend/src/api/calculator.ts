import { api } from './client';
import type { CalcRequest, CalcResponse } from '@/types/calculator';

export const calcBeforeRain = (req: CalcRequest) =>
  api.post<CalcResponse>('/calculator/before-rain', req).then(r => r.data);
