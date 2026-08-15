import type { WorkOrder } from '../types';

export type RoutePoint = {
  order: WorkOrder;
  latitude: number;
  longitude: number;
};

export type RoutePlan = {
  ordered: RoutePoint[];
  distanceKm: number;
  mapsUrl: string;
  mapsUrls: string[];
};

export function optimizeDailyRoute(orders: WorkOrder[], origin?: { latitude: number; longitude: number }): RoutePlan | null {
  const points = orders.flatMap((order) => order.branchLatitude == null || order.branchLongitude == null
    ? []
    : [{ order, latitude: order.branchLatitude, longitude: order.branchLongitude }]);
  if (!points.length) return null;

  const start = origin ?? { latitude: points[0].latitude, longitude: points[0].longitude };
  const remaining = [...points];
  const ordered: RoutePoint[] = [];
  let cursor = start;
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = haversineKm(cursor, candidate);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = next;
  }

  improveTwoOpt(ordered, start);
  const distanceKm = routeDistance(ordered, start);
  const mapsUrls = buildGoogleMapsUrls(ordered, start);
  return { ordered, distanceKm, mapsUrl: mapsUrls[0], mapsUrls };
}

export function routeDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function improveTwoOpt(points: RoutePoint[], start: { latitude: number; longitude: number }) {
  if (points.length < 4) return;
  let improved = true;
  for (let pass = 0; pass < 3 && improved; pass++) {
    improved = false;
    for (let left = 0; left < points.length - 2; left++) {
      for (let right = left + 1; right < points.length - 1; right++) {
        const before = routeDistance(points, start);
        const candidate = [...points];
        candidate.splice(left, right - left + 1, ...candidate.slice(left, right + 1).reverse());
        if (routeDistance(candidate, start) + 0.05 < before) {
          points.splice(0, points.length, ...candidate);
          improved = true;
        }
      }
    }
  }
}

function routeDistance(points: RoutePoint[], start: { latitude: number; longitude: number }) {
  let total = 0;
  let previous = start;
  points.forEach((point) => { total += haversineKm(previous, point); previous = point; });
  return Math.round(total * 10) / 10;
}

function haversineKm(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const radius = 6371;
  const lat = radians(right.latitude - left.latitude);
  const lon = radians(right.longitude - left.longitude);
  const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(lon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildGoogleMapsUrls(points: RoutePoint[], start: { latitude: number; longitude: number }) {
  const urls: string[] = [];
  let legOrigin = start;
  for (let index = 0; index < points.length; index += 9) {
    const leg = points.slice(index, index + 9);
    const destination = leg[leg.length - 1];
    const waypoints = leg.slice(0, -1).map(formatPoint).join('|');
    const query = new URLSearchParams({ api: '1', origin: formatPoint(legOrigin), destination: formatPoint(destination), travelmode: 'driving' });
    if (waypoints) query.set('waypoints', waypoints);
    urls.push(`https://www.google.com/maps/dir/?${query.toString()}`);
    legOrigin = destination;
  }
  return urls;
}

function formatPoint(point: { latitude: number; longitude: number }) { return `${point.latitude},${point.longitude}`; }
function radians(value: number) { return value * Math.PI / 180; }
