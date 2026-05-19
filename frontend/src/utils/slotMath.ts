import type { PrepInfo, TimeSlot } from '@/types/greenWindow';

export type SlotStatus = 'planned' | 'preparing' | 'paving_now' | 'tight' | 'lost' | 'expired';

export interface EffectiveSlot {
  status: SlotStatus;
  delayMin: number;            // на сколько simNow позже yellow_start
  prepStart: Date;             // когда реально начнётся (или уже шла) подготовка
  pavingStart: Date;           // когда реально начнётся укладка
  pavingEnd: Date;             // = slot.end
  pavingMin: number;           // минут эффективной укладки
  tonnage: number;             // эффективные тонны
  roadPct: number;             // 0..1 от всей дороги
  lostMin: number;             // сколько минут окна упущено
  lostTonnage: number;         // тонн упущено
}

export function computeEffectiveSlot(
  simNow: Date,
  slot: TimeSlot,
  prep: PrepInfo | undefined,
  roadTotalT: number,
): EffectiveSlot {
  const yellow = new Date(slot.yellow_start);
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const prepMin = prep?.total_min ?? 0;
  const totalPavingMin = (end.getTime() - start.getTime()) / 60000;
  const maxTonnage = slot.rate_t_per_min * totalPavingMin;

  const delayMin = Math.max(0, (simNow.getTime() - yellow.getTime()) / 60000);

  // Реальный старт подготовки = max(simNow, yellow_start)
  const prepStart = simNow > yellow ? simNow : yellow;
  // Реальный старт укладки = max(slot.start, prepStart + prepMin)
  const earliestPaving = new Date(prepStart.getTime() + prepMin * 60000);
  const pavingStart = earliestPaving > start ? earliestPaving : start;
  const pavingEnd = end;

  const pavingMin = Math.max(0, (pavingEnd.getTime() - pavingStart.getTime()) / 60000);
  const tonnage = Math.round(slot.rate_t_per_min * pavingMin * 10) / 10;
  const roadPct = roadTotalT > 0 ? Math.min(1, tonnage / roadTotalT) : 0;
  const lostMin = Math.max(0, totalPavingMin - pavingMin);
  const lostTonnage = Math.round((maxTonnage - tonnage) * 10) / 10;

  let status: SlotStatus;
  if (simNow >= end) status = 'expired';
  else if (pavingMin <= 0) status = 'lost';
  else if (simNow >= start) status = 'paving_now';
  else if (simNow >= yellow && pavingStart > start) status = 'tight';
  else if (simNow >= yellow) status = 'preparing';
  else status = 'planned';

  return { status, delayMin, prepStart, pavingStart, pavingEnd, pavingMin, tonnage, roadPct, lostMin, lostTonnage };
}

export function fmtMin(min: number): string {
  if (min < 1) return '< 1 мин';
  if (min < 60) return `${Math.round(min)} мин`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}
