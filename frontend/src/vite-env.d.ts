/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
  readonly VITE_SATELLITE_TILE_URL?: string;
  readonly VITE_SATELLITE_LABELS_URL?: string;
  readonly VITE_TRAFFIC_TILE_URL?: string;
  readonly VITE_MAP_DEFAULT_CENTER?: string;
  readonly VITE_MAP_DEFAULT_ZOOM?: string;
  readonly VITE_GEOCODER_BBOX?: string;
  readonly VITE_GEOCODER_COUNTRY?: string;
  readonly VITE_GEOCODER_EMAIL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
