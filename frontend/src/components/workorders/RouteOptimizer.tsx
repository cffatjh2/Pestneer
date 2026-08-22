import { useMemo, useState } from 'react';
import { LocateFixed, MapPinned, Navigation, Route, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { optimizeDailyRoute, routeDateKey } from '../../utils/routeOptimization';
import DailyOperationsMap from '../maps/DailyOperationsMap';

type Props = { orders: WorkOrder[]; onClose: () => void };

export default function RouteOptimizer({ orders, onClose }: Props) {
  const initialDate = routeDateKey(orders.find((item) => !['Completed', 'Cancelled', 'Skipped'].includes(item.technicalStatus))?.scheduledAt ?? new Date());
  const [date, setDate] = useState(initialDate);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number }>();
  const [locationError, setLocationError] = useState<string>();
  const dailyOrders = useMemo(() => orders.filter((item) => routeDateKey(item.scheduledAt) === date && !['Cancelled', 'Skipped'].includes(item.technicalStatus)), [date, orders]);
  const route = useMemo(() => optimizeDailyRoute(dailyOrders, origin), [dailyOrders, origin]);
  const missing = dailyOrders.filter((item) => item.branchLatitude == null || item.branchLongitude == null);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return setLocationError('Bu cihaz konum paylaşımını desteklemiyor.');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setOrigin({ latitude: coords.latitude, longitude: coords.longitude }); setLocationError(undefined); },
      () => setLocationError('Konum alınamadı. Tarayıcı konum iznini kontrol edin.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return <div className="modal-overlay route-modal-overlay"><section className="route-optimizer" role="dialog" aria-modal="true" aria-label="Akıllı rota optimizasyonu">
    <header><div><span><Route size={18} /> SAHA ROTA PLANI</span><h2>Akıllı günlük rota</h2><p>Konumlu işleri en kısa pratik sıraya dizer; plan cihazda çevrimdışı da görüntülenir.</p></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><X /></button></header>
    <div className="route-controls"><label>Rota günü<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button onClick={useCurrentLocation}><LocateFixed size={17} /> Başlangıç konumumu kullan</button>{route && <a href={route.mapsUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> Haritalar'da başlat</a>}</div>
    {route && route.mapsUrls.length > 1 && <div className="route-stage-links"><strong>Uzun rota {route.mapsUrls.length} güvenli etaba ayrıldı:</strong>{route.mapsUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">{index + 1}. etabı aç</a>)}</div>}
    {locationError && <div className="field-operation-error">{locationError}</div>}
    <div className="route-summary"><article><strong>{dailyOrders.length}</strong><span>planlı ziyaret</span></article><article><strong>{route?.ordered.length ?? 0}</strong><span>rotaya alınan</span></article><article><strong>{route?.distanceKm ?? 0} km</strong><span>tahmini saha mesafesi</span></article></div>
    <DailyOperationsMap orders={orders} date={date} title="İş durumu ve rota haritası" />
    {!route ? <div className="route-empty"><MapPinned size={30} /><strong>Bu gün için koordinatlı iş bulunamadı</strong><span>Müşteri veya şube kartına konum eklenince rota otomatik oluşur.</span></div> : <ol className="route-stop-list">{route.ordered.map(({ order }, index) => <li key={order.recordId}><b>{index + 1}</b><div><strong>{order.client} · {order.branch}</strong><span>{order.time} · {order.service}</span><small>{order.branchAddress}</small></div><a href={order.branchMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.branchLatitude},${order.branchLongitude}`)}`} target="_blank" rel="noreferrer">Aç</a></li>)}</ol>}
    {missing.length > 0 && <div className="route-missing"><strong>{missing.length} iş rotaya alınamadı</strong><span>{missing.map((item) => `${item.client} / ${item.branch}`).join(' · ')}</span></div>}
  </section></div>;
}
