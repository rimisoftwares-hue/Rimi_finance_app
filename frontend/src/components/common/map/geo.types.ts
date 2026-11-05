export type LatLngTuple = [number, number];
export type MarkerKind = 'office' | 'customer' | 'agent' | 'me' | 'picked' | 'custom';
export type MarkerGlyph = 'building' | 'home' | 'user' | 'navigation' | 'dot';

export interface GeoPopup {
  title: string;
  subtitle?: string;
  lines?: string[];
}

export interface GeoMarker {
  id: string;
  position: LatLngTuple;
  kind?: MarkerKind;          // default 'custom'
  glyph?: MarkerGlyph;        // default depends on kind
  color?: string;             // hex only, e.g. '#F97316'
  label?: string;             // hover tooltip
  pulse?: boolean;            // animated ring (live agent)
  accuracyM?: number;         // draws an accuracy circle when <= 5000
  draggable?: boolean;
  popup?: GeoPopup;
  zIndexOffset?: number;
}

export interface GeoCircle {
  id: string;
  center: LatLngTuple;
  radiusM: number;
  color?: string;
  dashed?: boolean;
  label?: string;
}

export interface GeoPolyline {
  id: string;
  positions: LatLngTuple[];
  color?: string;
  dashed?: boolean;
  weight?: number;
  label?: string;             // if omitted, total distance is shown on hover
}

export interface ParsedAddress {
  houseNo?: string;
  street?: string;
  village?: string;           // area / neighbourhood
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  displayName: string;
}

export interface GeoSearchResult {
  id: string;
  title: string;
  subtitle: string;
  position: LatLngTuple;
}

export interface GeoMapProps {
  markers?: GeoMarker[];
  circles?: GeoCircle[];
  polylines?: GeoPolyline[];

  center?: LatLngTuple;
  zoom?: number;
  /** Re-fit the view to all points when this value changes. Omit to fit once on mount only. */
  fitKey?: string | number;
  autoFit?: boolean;          // default true

  mode?: 'view' | 'pick';     // default 'view'
  value?: LatLngTuple | null; // pick mode: controlled pin
  onChange?: (pos: LatLngTuple) => void;
  locateSetsPin?: boolean;    // pick mode: "my location" moves the pin. default true

  onMarkerClick?: (marker: GeoMarker) => void;
  onMarkerDragEnd?: (id: string, pos: LatLngTuple) => void;

  search?: boolean;           // default true
  locate?: boolean;           // default true
  layerSwitcher?: boolean;    // default true
  traffic?: boolean;          // default true (button still hidden unless VITE_TRAFFIC_TILE_URL is set)
  clustering?: boolean;       // cluster customer/agent/custom markers. default false

  fetchAddress?: boolean;     // pick mode: reverse-geocode the pin
  onAddress?: (address: ParsedAddress | null) => void;

  compact?: boolean;          // static preview: no controls, no interaction
  height?: number | string;   // default 420
  className?: string;
}

