import { api } from './client';
import type { Road } from '@/types/road';

export const getRoads = () => api.get<Road[]>('/roads').then(r => r.data);
export const getRoad = (id: string) => api.get<Road>(`/roads/${id}`).then(r => r.data);
