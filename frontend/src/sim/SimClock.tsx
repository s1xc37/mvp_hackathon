import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PavingSpeed } from '@/types/paving';
import { SIM_TICK_MS } from './constants';

export type WeatherOverride = 'auto' | 'good' | 'bad';

interface SimClockContextValue {
  simNow: Date;
  speed: PavingSpeed;
  setSpeed: (s: PavingSpeed) => void;
  isRunning: boolean;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  weatherOverride: WeatherOverride;
  setWeatherOverride: (m: WeatherOverride) => void;
}

const SimClockContext = createContext<SimClockContextValue | null>(null);

function floorToHour(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(0, 0, 0);
  return out;
}

export function SimClockProvider({ children }: { children: ReactNode }) {
  const [simNow, setSimNow] = useState(() => floorToHour(new Date()));
  const [speed, setSpeed] = useState<PavingSpeed>(1);
  const [isRunning, setIsRunning] = useState(true);
  const [weatherOverride, setWeatherOverride] = useState<WeatherOverride>('auto');

  const speedRef = useRef(speed);
  speedRef.current = speed;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  useEffect(() => {
    const id = setInterval(() => {
      if (!isRunningRef.current) return;
      setSimNow(prev => new Date(prev.getTime() + SIM_TICK_MS * speedRef.current));
    }, SIM_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const pause = () => setIsRunning(false);
  const resume = () => setIsRunning(true);
  const reset = () => {
    setSimNow(floorToHour(new Date()));
    setSpeed(1);
    setIsRunning(true);
    setWeatherOverride('auto');
  };

  return (
    <SimClockContext.Provider value={{ simNow, speed, setSpeed, isRunning, pause, resume, reset, weatherOverride, setWeatherOverride }}>
      {children}
    </SimClockContext.Provider>
  );
}

export function useSimClock(): SimClockContextValue {
  const ctx = useContext(SimClockContext);
  if (!ctx) throw new Error('useSimClock must be used inside SimClockProvider');
  return ctx;
}
