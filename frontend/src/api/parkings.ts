import { api } from './client';
import type { Parking, ParkingDetail } from '@/types/parking';

export const getParkings = () => api.get<Parking[]>('/parkings').then(r => r.data);
export const getParking = (id: number) => api.get<ParkingDetail>(`/parkings/${id}`).then(r => r.data);
