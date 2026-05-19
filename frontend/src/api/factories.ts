import { api } from './client';
import type { Factory, FactoryDetail } from '@/types/factory';

export const getFactories = () => api.get<Factory[]>('/factories').then(r => r.data);
export const getFactory = (id: string) => api.get<FactoryDetail>(`/factories/${id}`).then(r => r.data);
