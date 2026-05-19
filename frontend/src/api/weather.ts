import { api } from './client';
import type { WeatherForecast } from '@/types/weather';

export const getWeather = (siteId: string, hours = 24) =>
  api.get<WeatherForecast>(`/weather/${siteId}`, { params: { hours } }).then(r => r.data);
