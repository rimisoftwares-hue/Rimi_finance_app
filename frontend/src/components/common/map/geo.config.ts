import type { LatLngTuple } from './geo.types';

function parseCenter(raw: string | undefined): LatLngTuple | null {
  if (!raw) return null;
  const [a, b] = raw.split(',').map((s) => Number(s.trim()));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

export const MAP_CONFIG = {
  tileUrl: import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  satelliteUrl:
    import.meta.env.VITE_SATELLITE_TILE_URL ||
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  satelliteAttribution: 'Tiles &copy; Esri',
  labelsUrl:
    import.meta.env.VITE_SATELLITE_LABELS_URL ||
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  trafficUrl: import.meta.env.VITE_TRAFFIC_TILE_URL || undefined,
  defaultCenter: (parseCenter(import.meta.env.VITE_MAP_DEFAULT_CENTER) ?? [11.1271, 78.6569]) as LatLngTuple,
  defaultZoom: Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM) || 7,
};

