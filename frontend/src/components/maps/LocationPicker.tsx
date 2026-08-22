import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LocateFixed, MapPin, Search } from 'lucide-react';
import { coordinatesFromGoogleMapsUrl, googleMapsConfigured, googleMapsMapId, googleMapsUrl, loadGoogleMaps } from '../../utils/googleMaps';

export type LocationValue = { latitude?: number; longitude?: number; mapUrl?: string };

export default function LocationPicker({ value, address, onChange, compact = false }: {
  value: LocationValue;
  address?: string;
  onChange: (value: LocationValue, formattedAddress?: string) => void;
  compact?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autocompleteHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Record<string, unknown> | null>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const selectRef = useRef<((latitude: number, longitude: number, formattedAddress?: string) => void) | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const [loadError, setLoadError] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [hasPlacesWidget, setHasPlacesWidget] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!googleMapsConfigured || !mapRef.current) return;
    let cancelled = false;
    void loadGoogleMaps().then(async (runtime) => {
      if (cancelled || !mapRef.current) return;
      const maps = runtime.maps as Record<string, any>;
      runtimeRef.current = maps;
      const initial = value.latitude != null && value.longitude != null
        ? { lat: value.latitude, lng: value.longitude }
        : { lat: 39.0, lng: 35.0 };
      const map = new maps.Map(mapRef.current, {
        center: initial,
        zoom: value.latitude != null ? 16 : 6,
        mapId: googleMapsMapId,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: !compact,
        gestureHandling: 'greedy',
      });
      mapInstanceRef.current = map;
      const select = (lat: number, lng: number, formattedAddress?: string) => {
        const next = { latitude: Number(lat.toFixed(7)), longitude: Number(lng.toFixed(7)), mapUrl: googleMapsUrl(lat, lng) };
        onChangeRef.current(next, formattedAddress);
        if (!markerRef.current) {
          markerRef.current = new maps.Marker({ map, position: { lat, lng }, draggable: true, title: 'Müşteri konumu' });
          (markerRef.current as any).addListener('dragend', (event: any) => select(event.latLng.lat(), event.latLng.lng()));
        } else (markerRef.current as any).setPosition({ lat, lng });
        map.panTo({ lat, lng });
        map.setZoom(Math.max(map.getZoom() ?? 16, 15));
      };
      selectRef.current = select;
      map.addListener('click', (event: any) => select(event.latLng.lat(), event.latLng.lng()));
      if (value.latitude != null && value.longitude != null) select(value.latitude, value.longitude);

      const PlaceAutocompleteElement = maps.places?.PlaceAutocompleteElement;
      if (PlaceAutocompleteElement && autocompleteHostRef.current) {
        const autocomplete = new PlaceAutocompleteElement({ componentRestrictions: { country: 'tr' } });
        autocomplete.placeholder = 'İşletme adı veya adres ara';
        autocomplete.addEventListener('gmp-select', async (event: any) => {
          try {
            const place = event.placePrediction?.toPlace();
            if (!place) return;
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
            const location = place.location;
            if (location) {
              setLoadError(undefined);
              select(location.lat(), location.lng(), place.formattedAddress ?? place.displayName);
            }
          } catch {
            setLoadError('Seçilen konumun ayrıntıları alınamadı.');
          }
        });
        autocompleteHostRef.current.replaceChildren(autocomplete);
        setHasPlacesWidget(true);
      } else {
        const Autocomplete = maps.places?.Autocomplete;
        if (!Autocomplete || !searchRef.current) return;
        const autocomplete = new Autocomplete(searchRef.current, { fields: ['formatted_address', 'geometry', 'name'], componentRestrictions: { country: 'tr' } });
        autocomplete.bindTo('bounds', map);
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const location = place.geometry?.location;
          if (location) select(location.lat(), location.lng(), place.formatted_address ?? place.name);
        });
      }
    }).catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Harita yüklenemedi.'));
    return () => { cancelled = true; selectRef.current = undefined; };
  }, []);

  useEffect(() => {
    const marker = markerRef.current as any;
    const map = mapInstanceRef.current as any;
    if (marker && map && value.latitude != null && value.longitude != null) {
      marker.setPosition({ lat: value.latitude, lng: value.longitude });
      map.panTo({ lat: value.latitude, lng: value.longitude });
    }
  }, [value.latitude, value.longitude]);

  const locate = () => {
    if (!navigator.geolocation) return setLoadError('Bu cihaz konum paylaşımını desteklemiyor.');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLoadError(undefined);
      if (selectRef.current) selectRef.current(coords.latitude, coords.longitude);
      else onChangeRef.current({ latitude: coords.latitude, longitude: coords.longitude, mapUrl: googleMapsUrl(coords.latitude, coords.longitude) });
    }, () => setLoadError('Cihaz konumu alınamadı. Konum iznini kontrol edin.'), { enableHighAccuracy: true, timeout: 10_000 });
  };

  const findAddress = async () => {
    const query = searchRef.current?.value.trim() || address?.trim();
    const maps = runtimeRef.current as any;
    if (!query || !maps?.Geocoder) return;
    setSearching(true);
    try {
      const result = await new maps.Geocoder().geocode({ address: query, region: 'TR' });
      const location = result.results?.[0]?.geometry?.location;
      if (!location) return setLoadError('Adres Google Maps üzerinde bulunamadı.');
      const formattedAddress = result.results[0].formatted_address;
      const latitude = location.lat(); const longitude = location.lng();
      setLoadError(undefined);
      selectRef.current?.(latitude, longitude, formattedAddress);
    } catch {
      setLoadError('Adres aranırken Google Maps bağlantısı yanıt vermedi.');
    } finally { setSearching(false); }
  };

  const updateMapUrl = (mapUrl: string) => {
    const coordinates = coordinatesFromGoogleMapsUrl(mapUrl);
    onChange({ ...value, ...coordinates, mapUrl: mapUrl.trim() || undefined });
  };

  return <section className={`location-picker ${compact ? 'compact' : ''}`}>
    <div className="location-picker-heading"><div><MapPin size={17}/><span><strong>Haritadan konum seç</strong><small>Arayın, haritaya dokunun veya işareti sürükleyin.</small></span></div><button type="button" onClick={locate}><LocateFixed size={15}/> Bulunduğum yer</button></div>
    {googleMapsConfigured ? <>
      <div className="location-search">{!hasPlacesWidget && <Search size={16}/>}<div ref={autocompleteHostRef} className="location-place-autocomplete"/>{!hasPlacesWidget && <input ref={searchRef} defaultValue={address} placeholder="İşletme adı veya adres ara"/>}{!hasPlacesWidget && <button type="button" onClick={() => void findAddress()} disabled={searching}>{searching ? 'Aranıyor…' : 'Bul'}</button>}</div>
      <div ref={mapRef} className="location-map" aria-label="Google Maps konum seçici"/>
    </> : <div className="location-map-fallback"><MapPin size={22}/><span><strong>Harita seçici yayın anahtarı bekliyor</strong><small>Bağlantı veya koordinat girişi çalışmaya devam eder.</small></span></div>}
    {loadError && <div className="location-picker-error">{loadError}</div>}
    <details className="location-manual" open={!googleMapsConfigured}>
      <summary>Google Maps bağlantısı veya koordinat gir <small>Opsiyonel</small></summary>
      <label>Google Maps bağlantısı<input type="url" value={value.mapUrl ?? ''} onChange={(event)=>updateMapUrl(event.target.value)} placeholder="https://maps.google.com/…"/></label>
      <div><label>Enlem<input type="number" step="0.000001" value={value.latitude ?? ''} onChange={(event)=>onChange({ ...value, latitude: event.target.value ? Number(event.target.value) : undefined })}/></label><label>Boylam<input type="number" step="0.000001" value={value.longitude ?? ''} onChange={(event)=>onChange({ ...value, longitude: event.target.value ? Number(event.target.value) : undefined })}/></label></div>
    </details>
    {(value.latitude != null && value.longitude != null) && <div className="location-selected"><MapPin size={14}/><span>{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</span><a href={value.mapUrl || googleMapsUrl(value.latitude,value.longitude)} target="_blank" rel="noreferrer">Google Maps'te aç <ExternalLink size={12}/></a></div>}
  </section>;
}
