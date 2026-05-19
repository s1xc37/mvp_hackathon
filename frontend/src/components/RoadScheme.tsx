import type { Lane, Condition } from '@/types/road';

const COND: Record<Condition, { accent: string; badge: string; bar: string; barW: string }> = {
  'Хорошее':            { accent: 'border-l-green-400',  badge: 'bg-green-900/60 text-green-300',   bar: 'bg-green-400',  barW: 'w-full' },
  'Удовлетворительное': { accent: 'border-l-yellow-400', badge: 'bg-yellow-900/60 text-yellow-300', bar: 'bg-yellow-400', barW: 'w-2/3'  },
  'Плохое':             { accent: 'border-l-orange-400', badge: 'bg-orange-900/60 text-orange-300', bar: 'bg-orange-400', barW: 'w-1/3'  },
  'Критическое':        { accent: 'border-l-red-400',    badge: 'bg-red-900/60 text-red-300',       bar: 'bg-red-400',    barW: 'w-1/6'  },
};
const COND_SHORT: Partial<Record<Condition, string>> = { 'Удовлетворительное': 'Удовл.' };

interface LaneStripProps {
  lane: Lane;
  isSelected: boolean;
  onClick: () => void;
  arrow: string;
  checkbox?: boolean;
  checked?: boolean;
}

function LaneStrip({ lane, isSelected, onClick, arrow, checkbox, checked }: LaneStripProps) {
  const c = COND[lane.condition] ?? { accent: 'border-l-gray-400', badge: 'bg-gray-700 text-gray-300', bar: 'bg-gray-400', barW: 'w-1/4' };
  const active = checkbox ? !!checked : isSelected;
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-3 border-l-4 ${c.accent} transition-all text-left ${active ? 'bg-white/20 ring-1 ring-inset ring-white/30' : 'hover:bg-white/10'}`}>
      {checkbox && (
        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-orange-500 border-orange-500' : 'border-white/30 bg-transparent'}`}>
          {checked && <span className="text-white text-xs leading-none">✓</span>}
        </span>
      )}
      <span className="text-white/40 text-xs font-bold shrink-0 w-3">{arrow}</span>
      <span className="text-white/90 text-xs font-medium shrink-0 w-14">{lane.name}</span>
      <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c.bar} ${c.barW}`} />
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 ${c.badge}`}>
        {COND_SHORT[lane.condition] ?? lane.condition}
      </span>
    </button>
  );
}

interface Props {
  lanes: Lane[];
  selectedLane: Lane | null;
  onSelectLane: (l: Lane) => void;
  mode?: 'view' | 'checkbox';
  checkedIds?: Set<number>;
  onToggleCheck?: (laneId: number) => void;
}

export default function RoadScheme({ lanes, selectedLane, onSelectLane, mode = 'view', checkedIds, onToggleCheck }: Props) {
  const isCheckbox = mode === 'checkbox';
  const msk = lanes.filter(l => l.direction === 'На Санкт-Петербург');
  const spb = lanes.filter(l => l.direction === 'На Москву');

  const handleClick = (lane: Lane) => {
    if (isCheckbox && onToggleCheck) onToggleCheck(lane.id);
    else onSelectLane(lane);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-gray-600 select-none">
      <div className="bg-gray-900 px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">На Санкт-Петербург</span>
        <span className="text-orange-400/50 text-xs tracking-widest font-mono">← ← ←</span>
      </div>
      <div className="bg-gray-800 divide-y divide-white/5">
        {msk.map(l => (
          <LaneStrip key={l.id} lane={l} arrow="←"
            isSelected={selectedLane?.id === l.id}
            onClick={() => handleClick(l)}
            checkbox={isCheckbox}
            checked={checkedIds?.has(l.id)} />
        ))}
      </div>
      <div className="bg-gray-950 px-3 py-2 flex items-center gap-2">
        <div className="flex-1 flex gap-1 items-center">{[...Array(7)].map((_, i) => <div key={i} className="flex-1 h-0.5 bg-yellow-400/40 rounded-full" />)}</div>
        <span className="text-xs text-gray-500 whitespace-nowrap shrink-0 mx-1">разделительная полоса</span>
        <div className="flex-1 flex gap-1 items-center">{[...Array(7)].map((_, i) => <div key={i} className="flex-1 h-0.5 bg-yellow-400/40 rounded-full" />)}</div>
      </div>
      <div className="bg-gray-800 divide-y divide-white/5">
        {spb.map(l => (
          <LaneStrip key={l.id} lane={l} arrow="→"
            isSelected={selectedLane?.id === l.id}
            onClick={() => handleClick(l)}
            checkbox={isCheckbox}
            checked={checkedIds?.has(l.id)} />
        ))}
      </div>
      <div className="bg-gray-900 px-3 py-2 flex items-center justify-between">
        <span className="text-blue-400/50 text-xs tracking-widest font-mono">→ → →</span>
        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">На Москву</span>
      </div>
    </div>
  );
}
