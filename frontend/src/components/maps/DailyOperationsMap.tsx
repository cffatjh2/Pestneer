import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, MapPinned, Navigation, Route } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { optimizeDailyRoute, routeDateKey } from '../../utils/routeOptimization';
import { acquireGoogleMapsQuota, googleMapsConfigured, googleMapsMapId, googleMapsUrl, loadGoogleMaps } from '../../utils/googleMaps';

const statusMeta: Record<string, { label: string; color: string }> = {
  Planned: { label: 'Planlandı', color: '#2563eb' },
  InProgress: { label: 'Sahada', color: '#f97316' },
  Paused: { label: 'Duraklatıldı', color: '#d97706' },
  Completed: { label: 'Tamamlandı', color: '#16a34a' },
  Skipped: { label: 'Atlandı', color: '#64748b' },
  Cancelled: { label: 'İptal', color: '#dc2626' },
};

export default function DailyOperationsMap({ orders, date, onDateChange, title = 'Günlük operasyon haritası' }: {
  orders: WorkOrder[];
  date: string;
  onDateChange?: (date: string) => void;
  title?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState<string>();
  const dailyOrders = useMemo(() => orders.filter((item) => routeDateKey(item.scheduledAt) === date), [date, orders]);
  const locatedOrders = dailyOrders.filter((item) => item.branchLatitude != null && item.branchLongitude != null);
  const route = useMemo(() => optimizeDailyRoute(dailyOrders.filter((item) => !['Cancelled','Skipped'].includes(item.technicalStatus))), [dailyOrders]);
  const counts = useMemo(() => ({ completed: dailyOrders.filter((item)=>item.technicalStatus==='Completed').length, active: dailyOrders.filter((item)=>item.technicalStatus==='InProgress').length, remaining: dailyOrders.filter((item)=>['Planned','Paused'].includes(item.technicalStatus)).length }), [dailyOrders]);

  useEffect(() => {
    if (!googleMapsConfigured || !mapRef.current || locatedOrders.length === 0) return;
    let cancelled = false;
    void acquireGoogleMapsQuota('dynamic_maps').then(() => loadGoogleMaps()).then((runtime) => {
      if (cancelled || !mapRef.current) return;
      const maps = runtime.maps as Record<string, any>;
      const center = { lat: locatedOrders[0].branchLatitude!, lng: locatedOrders[0].branchLongitude! };
      const map = new maps.Map(mapRef.current, { center, zoom: 11, mapId: googleMapsMapId, streetViewControl: false, mapTypeControl: false, fullscreenControl: true, gestureHandling: 'greedy' });
      const bounds = new maps.LatLngBounds();
      const info = new maps.InfoWindow();
      const routeNumber = new Map(route?.ordered.map((item, index) => [item.order.recordId, index + 1]) ?? []);
      locatedOrders.forEach((order) => {
        const position = { lat: order.branchLatitude!, lng: order.branchLongitude! };
        const meta = statusMeta[order.technicalStatus] ?? statusMeta.Planned;
        const markerLabel = order.technicalStatus === 'Completed' ? '✓' : order.technicalStatus === 'Cancelled' ? '×' : order.technicalStatus === 'Skipped' ? '–' : String(routeNumber.get(order.recordId) ?? '•');
        const marker = new maps.Marker({ map, position, title: `${order.client} · ${order.branch}`, label: { text: markerLabel, color: '#fff', fontWeight: '800' }, icon: { path: maps.SymbolPath.CIRCLE, scale: 15, fillColor: meta.color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 } });
        marker.addListener('click', () => {
          const mapsUrl = order.branchMapUrl || googleMapsUrl(order.branchLatitude, order.branchLongitude);
          info.setContent(`<div class="map-info-window"><strong>${escapeHtml(order.client)} · ${escapeHtml(order.branch)}</strong><span>${escapeHtml(order.time)} · ${escapeHtml(order.service)}</span><em style="color:${meta.color}">${meta.label}</em><a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer">Google Maps'te aç</a></div>`);
          info.open({ map, anchor: marker });
        });
        bounds.extend(position);
      });
      if (route && route.ordered.length > 1) new maps.Polyline({ map, path: route.ordered.map((item)=>({lat:item.latitude,lng:item.longitude})), geodesic: true, strokeColor: '#0f6b5b', strokeOpacity: .75, strokeWeight: 4 });
      if (locatedOrders.length > 1) map.fitBounds(bounds, 48);
    }).catch((cause)=>setMapError(cause instanceof Error ? cause.message : 'Harita yüklenemedi.'));
    return () => { cancelled = true; };
  }, [date, orders]);

  return <section className="daily-operations-map surface">
    <header><div><p className="eyebrow">CANLI SAHA GÖRÜNÜMÜ</p><h2><MapPinned size={20}/>{title}</h2><span>İş durumu değiştikçe harita işaretleri otomatik renk değiştirir.</span></div>{onDateChange && <label>Gün<input type="date" value={date} onChange={(event)=>onDateChange(event.target.value)}/></label>}</header>
    <div className="daily-map-stats"><span><b>{dailyOrders.length}</b> toplam</span><span className="remaining"><b>{counts.remaining}</b> yapılacak</span><span className="active"><b>{counts.active}</b> sahada</span><span className="completed"><b>{counts.completed}</b> tamamlandı</span></div>
    {googleMapsConfigured && locatedOrders.length > 0 ? <div ref={mapRef} className="daily-map-canvas"/> : <div className="daily-map-fallback"><MapPinned size={28}/><strong>{locatedOrders.length ? 'Google Maps yayın anahtarı bekleniyor' : 'Bu gün için koordinatlı iş yok'}</strong><span>{locatedOrders.length ? 'İş listesi ve Google Maps rota bağlantıları kullanılabilir durumda.' : 'Müşteri veya şube kartından haritada konum seçildiğinde burada görünür.'}</span></div>}
    {mapError && <div className="location-picker-error">{mapError}</div>}
    <div className="daily-map-legend">{Object.entries(statusMeta).slice(0,4).map(([key,item])=><span key={key}><i style={{background:item.color}}/>{item.label}</span>)}</div>
    {dailyOrders.length > 0 && <div className="daily-map-mobile-list">{dailyOrders.map((order)=><a key={order.recordId} href={order.branchMapUrl || googleMapsUrl(order.branchLatitude,order.branchLongitude,order.branchAddress)} target="_blank" rel="noreferrer"><i style={{background:(statusMeta[order.technicalStatus]??statusMeta.Planned).color}}>{order.technicalStatus==='Completed'?<CheckCircle2 size={14}/>:<Clock3 size={14}/>}</i><span><strong>{order.client} · {order.branch}</strong><small>{order.time} · {(statusMeta[order.technicalStatus]??statusMeta.Planned).label}</small></span><ExternalLink size={14}/></a>)}</div>}
    <footer>{route && <><span><Route size={15}/>{route.ordered.length} durak · yaklaşık {route.distanceKm} km</span><a href={route.mapsUrl} target="_blank" rel="noreferrer"><Navigation size={15}/> Navigasyonu başlat</a></>}</footer>
  </section>;
}

function escapeHtml(value:string){return value.replace(/[&<>'"]/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]!))}
