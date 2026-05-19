import { api } from './client';
import type { PlanRequest, PlanResponse } from '@/types/plan';

export const createPlan = (req: PlanRequest) =>
  api.post<PlanResponse>('/plans', req).then(r => r.data);
