// Grayscale Leaflet map with route and sit-here segments. Whitepaper 5.2, 6.4.
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Block, LatLon } from '../core/types';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toLatLngs(points: LatLon[]): L.LatLngExpression[] {
  return points.map((p) => [p.lat, p.lon]);
}

/** points is the full route (drawn once in ink); blocks overlay the stretches where a side matters. */
export function renderMap(container: HTMLElement, points: LatLon[], blocks: Block[]): void {
  container.replaceChildren();
  if (points.length === 0) return;

  const ink = cssVar('--ink') || '#151515';
  const accent = cssVar('--accent') || '#d9480f';

  const map = L.map(container, { attributionControl: true, zoomControl: true });

  // Whitepaper 6.4: grayscale raster tiles, but the route and markers stay in full colour.
  // The map has no view yet (fitBounds runs below), so Leaflet defers onAdd and getContainer()
  // would be null here; className bakes the class into the container when it's finally created.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    className: 'map-tiles-grayscale',
  }).addTo(map);

  L.polyline(toLatLngs(points), { color: ink, weight: 3, opacity: 0.9 }).addTo(map);

  for (const b of blocks) {
    if (b.sunSide !== 'left' && b.sunSide !== 'right') continue;
    L.polyline(toLatLngs(b.points), { color: accent, weight: 4, opacity: 1 }).addTo(map);
  }

  const markerStyle = {
    radius: 6,
    color: ink,
    weight: 2,
    fillColor: cssVar('--bg') || '#fafaf8',
    fillOpacity: 1,
  };
  L.circleMarker(toLatLngs([points[0]!])[0]!, markerStyle).addTo(map);
  L.circleMarker(toLatLngs([points.at(-1)!])[0]!, markerStyle).addTo(map);

  map.fitBounds(L.polyline(toLatLngs(points)).getBounds(), { padding: [16, 16] });
}
