import type { VehicleSummary, Vehicle, VehicleType } from '@/types/vehicle';
import type { FactoryDetail } from '@/types/factory';
import type { ParkingDetail } from '@/types/parking';

export const VEHICLE_ICON: Record<VehicleType, string> = {
  dump_truck:        '🚛',
  transfer_machine:  '🏗️',
  paver:             '🚜',
  roller:            '🛞',
  closure_vehicle:   '🚧',
};
export const VEHICLE_LABEL: Record<VehicleType, string> = {
  dump_truck:        'Самосвал',
  transfer_machine:  'Перегружатель смеси',
  paver:             'Асфальтоукладчик (гусеничный)',
  roller:            'Каток гладковальцовый',
  closure_vehicle:   'Спецавтомобиль перекрытия дороги',
};

export type PanelState =
  | { type: 'parking'; data: ParkingDetail }
  | { type: 'factory'; data: FactoryDetail }
  | { type: 'fleet'; data: { vehicles: VehicleSummary[]; typeName: string; typeIcon: string } }
  | { type: 'vehicle'; data: Vehicle };

function PanelHeader({ title, subtitle, onClose, icon }: { title: string; subtitle?: string; onClose: () => void; icon?: string }) {
  return (
    <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-2xl shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="font-bold text-gray-900 text-sm leading-tight truncate">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors shrink-0 ml-2">✕</button>
    </div>
  );
}

function VehicleListItem({ v, onClick }: { v: VehicleSummary; onClick: (id: number) => void }) {
  const isTransit = v.location_type === 'transit';
  return (
    <button onClick={() => onClick(v.id)} className="w-full text-left px-4 py-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{VEHICLE_ICON[v.type] ?? '🚗'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{v.name}</p>
          <p className="text-xs text-gray-500">{VEHICLE_LABEL[v.type]}</p>
        </div>
        {v.location_type && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${isTransit ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
            {isTransit ? 'в пути' : v.location_name}
          </span>
        )}
      </div>
    </button>
  );
}

function ParkingPanel({ parking, onClose, onSelectVehicle }: { parking: ParkingDetail; onClose: () => void; onSelectVehicle: (id: number) => void }) {
  return (
    <>
      <PanelHeader icon="🅿️" title={parking.name} subtitle="Техника на стоянке" onClose={onClose} />
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Выберите технику для просмотра</p>
        <div className="space-y-2">{parking.vehicles.map(v => <VehicleListItem key={v.id} v={v} onClick={onSelectVehicle} />)}</div>
      </div>
    </>
  );
}

function FactoryPanel({ factory, onClose, onSelectVehicle }: { factory: FactoryDetail; onClose: () => void; onSelectVehicle: (id: number) => void }) {
  return (
    <>
      <PanelHeader icon="🏭" title={factory.name} subtitle="Асфальтобетонный завод" onClose={onClose} />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-xs text-gray-400 mb-0.5">Производительность</p><p className="text-sm font-bold text-gray-900">{factory.capacity_t_per_hour} т/ч</p></div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-xs text-gray-400 mb-0.5">Загрузка ТС</p><p className="text-sm font-bold text-gray-900">{factory.vehicle_count} ед.</p></div>
        </div>
        {factory.materials.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Материалы</p>
            <div className="space-y-1">{factory.materials.map((m, i) => <div key={i} className="flex items-center gap-2 text-xs text-gray-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{m}</div>)}</div>
          </div>
        )}
        {factory.vehicles.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Техника на загрузке</p>
            <div className="space-y-2">{factory.vehicles.map(v => <VehicleListItem key={v.id} v={v} onClick={onSelectVehicle} />)}</div>
          </div>
        ) : <div className="py-4 text-center text-gray-400 text-sm">Нет техники на загрузке</div>}
      </div>
    </>
  );
}

function FleetTypePanel({ vehicles, typeName, typeIcon, onClose, onSelectVehicle }: { vehicles: VehicleSummary[]; typeName: string; typeIcon: string; onClose: () => void; onSelectVehicle: (id: number) => void }) {
  return (
    <>
      <PanelHeader icon={typeIcon} title={typeName} subtitle={`Всего: ${vehicles.length} ед.`} onClose={onClose} />
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Все единицы техники</p>
        <div className="space-y-2">
          {vehicles.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Нет доступной техники</p>}
          {vehicles.map(v => <VehicleListItem key={v.id} v={v} onClick={onSelectVehicle} />)}
        </div>
      </div>
    </>
  );
}

function VehiclePanel({ vehicle, onClose, onFlyTo }: { vehicle: Vehicle; onClose: () => void; onFlyTo: (c: [number, number]) => void }) {
  const date = vehicle.schedule?.[0]?.date ?? '';
  const [y, m, d] = date ? date.split('-') : ['', '', ''];
  const dateLabel = date ? `${d}.${m}.${y}` : '';
  const isTransit = vehicle.location_type === 'transit';
  const coords = vehicle.coords;
  return (
    <>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{VEHICLE_ICON[vehicle.type] ?? '🚗'}</span>
          <div className="min-w-0"><h2 className="font-bold text-gray-900 text-sm leading-tight truncate">{vehicle.name}</h2><p className="text-xs text-gray-400 mt-0.5">{VEHICLE_LABEL[vehicle.type]}</p></div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors shrink-0 ml-2">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-lg p-3 border ${isTransit ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'}`}>
            <p className="text-xs text-gray-400 mb-0.5">Статус</p>
            <p className={`text-sm font-bold ${isTransit ? 'text-blue-600' : 'text-gray-700'}`}>{isTransit ? 'В пути' : 'На месте'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-xs text-gray-400 mb-0.5">Скорость</p><p className="text-sm font-bold text-gray-900">{vehicle.speed_kmh ?? 0} <span className="font-normal text-gray-500 text-xs">км/ч</span></p></div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Местоположение</p>
          {isTransit ? (coords ? <p className="text-sm font-mono text-gray-800">{coords[0].toFixed(5)}, {coords[1].toFixed(5)}</p> : <p className="text-sm text-gray-500">—</p>) : <p className="text-sm font-semibold text-gray-900">{vehicle.location_name ?? '—'}</p>}
        </div>
        <div className="bg-orange-50 rounded-lg p-3 border border-orange-100"><p className="text-xs text-gray-400 mb-1">Текущая задача</p><p className="text-sm font-semibold text-gray-900">{vehicle.current_task ?? '—'}</p></div>
        {coords && <button onClick={() => onFlyTo(coords as [number, number])} className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"><span>📍</span><span>Переместиться к технике</span></button>}
        {vehicle.schedule?.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-1">Маршрутный план — {dateLabel}</p>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200"><th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 w-14">Время</th><th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Место</th><th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Задача</th></tr></thead>
                <tbody>{vehicle.schedule.map((s, i) => <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50"><td className="px-3 py-2.5 font-mono text-xs font-bold text-blue-700">{s.time}</td><td className="px-3 py-2.5 text-xs text-gray-600">{s.location}</td><td className="px-3 py-2.5 text-xs text-gray-800">{s.task}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

interface Props { panel: PanelState; onClose: () => void; onSelectVehicle: (id: number) => void; onFlyToVehicle: (c: [number, number]) => void; }

export default function PanelVehicle({ panel, onClose, onSelectVehicle, onFlyToVehicle }: Props) {
  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white shadow-2xl overflow-y-auto z-10 flex flex-col">
      {panel.type === 'parking' && <ParkingPanel parking={panel.data} onClose={onClose} onSelectVehicle={onSelectVehicle} />}
      {panel.type === 'factory' && <FactoryPanel factory={panel.data} onClose={onClose} onSelectVehicle={onSelectVehicle} />}
      {panel.type === 'fleet'   && <FleetTypePanel vehicles={panel.data.vehicles} typeName={panel.data.typeName} typeIcon={panel.data.typeIcon} onClose={onClose} onSelectVehicle={onSelectVehicle} />}
      {panel.type === 'vehicle' && <VehiclePanel vehicle={panel.data} onClose={onClose} onFlyTo={onFlyToVehicle} />}
    </div>
  );
}
