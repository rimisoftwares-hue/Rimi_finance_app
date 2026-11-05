import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './geo-map.css';
import {
  Copy,
  ExternalLink,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Plus,
  Satellite,
  TrafficCone,
} from 'lucide-react';
import { toast } from 'sonner';
import { DevicePermissionService } from '../../../services/devicePermissionService';
import { MAP_CONFIG } from './geo.config';
import {
  formatDistance,
  googleMapsDirectionsUrl,
  googleMapsPlaceUrl,
  openExternal,
  pathLengthKm,
} from './geo.utils';
import { reverseGeocode } from './geocoder';
import { KIND_Z, getMarkerIcon } from './markerIcons';
import { MapSearchBox } from './MapSearchBox';
import { useDeviceLocation } from './useDeviceLocation';
import type { GeoMapProps, GeoMarker, LatLngTuple, ParsedAddress } from './geo.types';

const PICK_ID = '__picked';
const ME_ID = '__me';
const SEARCH_ID = '__search';

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

function FitController({
  points,
  fitKey,
  enabled,
}: {
  points: LatLngTuple[];
  fitKey?: string | number;
  enabled: boolean;
}) {
  const map = useMap();
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    if (!enabled) return;
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    map.invalidateSize();
    if (pts.length === 1) {
      map.setView(pts[0], 16);
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 17 });
    }
  }, [fitKey, enabled, map]);

  return null;
}

function MapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (p: LatLngTuple) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onPick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

function FollowValue({ value }: { value: LatLngTuple | null }) {
  const map = useMap();
  useEffect(() => {
    if (value && map.getBounds().isValid() && !map.getBounds().contains(value)) {
      map.panTo(value);
    }
  }, [value?.[0], value?.[1], map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function GeoMap(props: GeoMapProps) {
  const {
    markers = [],
    circles = [],
    polylines = [],
    center,
    zoom,
    fitKey,
    autoFit = true,
    mode = 'view',
    value = null,
    onChange,
    locateSetsPin = true,
    onMarkerClick,
    onMarkerDragEnd,
    search = true,
    locate: showLocate = true,
    layerSwitcher = true,
    traffic,
    clustering = false,
    fetchAddress = false,
    onAddress,
    compact = false,
    height = 420,
    className = '',
  } = props;

  const [map, setMap] = useState<L.Map | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [trafficOn, setTrafficOn] = useState(false);
  const [me, setMe] = useState<{ position: LatLngTuple; accuracyM?: number; source?: string } | null>(null);
  const [searchHit, setSearchHit] = useState<{ position: LatLngTuple; title: string } | null>(null);
  const [address, setAddress] = useState<ParsedAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  const { locate, modal, busy: hookBusy } = useDeviceLocation();
  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;

  const trafficAvailable = traffic !== false && !!MAP_CONFIG.trafficUrl;

  // 1. Build composite markers
  const allMarkers = useMemo(() => {
    const list: GeoMarker[] = [...markers];

    // Picked marker
    if (mode === 'pick' && value) {
      list.push({
        id: PICK_ID,
        position: value,
        kind: 'picked',
        draggable: true,
        zIndexOffset: KIND_Z.picked,
      });
    }

    // Current user location marker
    if (me) {
      list.push({
        id: ME_ID,
        position: me.position,
        kind: 'me',
        accuracyM: me.accuracyM,
        zIndexOffset: KIND_Z.me,
      });
    }

    // Temporary search marker in view mode
    if (mode === 'view' && searchHit) {
      list.push({
        id: SEARCH_ID,
        position: searchHit.position,
        kind: 'custom',
        color: '#EF4444',
        label: searchHit.title,
        zIndexOffset: 900,
      });
    }

    return list;
  }, [markers, mode, value, me, searchHit]);

  // 2. Build points list for FitController
  const fitPoints = useMemo(() => {
    const pts: LatLngTuple[] = [];
    for (const m of markers) pts.push(m.position);
    for (const c of circles) pts.push(c.center);
    for (const pl of polylines) pts.push(...pl.positions);
    if (value) pts.push(value);
    if (me) pts.push(me.position);
    if (searchHit) pts.push(searchHit.position);
    return pts;
  }, [markers, circles, polylines, value, me, searchHit]);

  // 3. Reverse geocode in pick mode
  useEffect(() => {
    if (mode !== 'pick' || !fetchAddress || !value) {
      setAddress(null);
      setAddressLoading(false);
      return;
    }

    const ac = new AbortController();
    setAddressLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const addr = await reverseGeocode(value, ac.signal);
        if (!ac.signal.aborted) {
          setAddress(addr);
          onAddressRef.current?.(addr);
        }
      } catch (err: unknown) {
        if (!ac.signal.aborted) {
          console.warn('Reverse geocoding failed:', err);
          setAddress(null);
          onAddressRef.current?.(null);
        }
      } finally {
        if (!ac.signal.aborted) {
          setAddressLoading(false);
        }
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [mode, fetchAddress, value?.[0], value?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4. Handle Locate button click
  const handleLocate = useCallback(async () => {
    setLocating(true);
    try {
      const res = await locate();
      if (res.granted && res.data) {
        const pos: LatLngTuple = [res.data.latitude, res.data.longitude];
        setMe({ position: pos, accuracyM: res.data.accuracy, source: res.data.source });
        if (map) {
          map.flyTo(pos, 16);
        }
        if (mode === 'pick' && locateSetsPin && onChange) {
          onChange(pos);
        }
      } else if (!res.granted && res.error && !res.blocked) {
        try {
          const ipLoc = await DevicePermissionService.ipLocationFallback();
          const ipPos: LatLngTuple = [ipLoc.latitude, ipLoc.longitude];
          setMe({ position: ipPos, source: 'ip' });
          if (map) {
            map.flyTo(ipPos, 11);
          }
          toast.info('Could not read your device location. Showing your approximate area.');
          if (mode === 'pick' && locateSetsPin && onChange) {
            onChange(ipPos);
          }
        } catch {
          toast.error('Could not get your location. Search for a place or click the map.');
        }
      }
    } catch (err: unknown) {
      console.warn('Location query error:', err);
      toast.error('Could not get your location. Search for a place or click the map.');
    } finally {
      setLocating(false);
    }
  }, [locate, map, mode, locateSetsPin, onChange]);

  // Marker drag / pick change
  const handlePick = useCallback(
    (pos: LatLngTuple) => {
      if (onChange) onChange(pos);
    },
    [onChange]
  );

  const renderMarker = (m: GeoMarker) => {
    const kind = m.kind ?? 'custom';
    const icon = getMarkerIcon(kind, {
      glyph: m.glyph,
      color: m.color,
      pulse: m.pulse,
    });
    const zOffset = m.zIndexOffset ?? KIND_Z[kind];

    return (
      <div key={m.id}>
        <Marker
          position={m.position}
          icon={icon}
          draggable={m.draggable}
          zIndexOffset={zOffset}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              onMarkerClick?.(m);
            },
            dragend: (e) => {
              const target = e.target as L.Marker;
              const newPos: LatLngTuple = [target.getLatLng().lat, target.getLatLng().lng];
              if (m.id === PICK_ID) {
                handlePick(newPos);
              }
              onMarkerDragEnd?.(m.id, newPos);
            },
          }}
        >
          {m.label && <Tooltip>{m.label}</Tooltip>}
          {m.popup && (
            <Popup>
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-foreground">{m.popup.title}</p>
                {m.popup.subtitle && <p className="text-muted-foreground">{m.popup.subtitle}</p>}
                {m.popup.lines && m.popup.lines.length > 0 && (
                  <div className="space-y-0.5 border-t border-border pt-1 text-[11px] text-muted-foreground">
                    {m.popup.lines.map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 border-t border-border pt-1.5 font-medium">
                  <button
                    type="button"
                    onClick={() => openExternal(googleMapsPlaceUrl(m.position))}
                    className="text-primary hover:underline"
                  >
                    Open in Google Maps
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={() => openExternal(googleMapsDirectionsUrl(m.position))}
                    className="text-primary hover:underline"
                  >
                    Directions
                  </button>
                </div>
              </div>
            </Popup>
          )}
        </Marker>
        {m.accuracyM && m.accuracyM <= 5000 && (
          <Circle
            center={m.position}
            radius={m.accuracyM}
            pathOptions={{
              color: m.color ?? '#2563EB',
              fillColor: m.color ?? '#2563EB',
              fillOpacity: 0.12,
              weight: 1,
            }}
          />
        )}
      </div>
    );
  };

  // Group clusterable vs non-clusterable markers
  const clusterableMarkers: GeoMarker[] = [];
  const nonClusterableMarkers: GeoMarker[] = [];

  for (const m of allMarkers) {
    const k = m.kind ?? 'custom';
    if (clustering && (k === 'customer' || k === 'agent' || k === 'custom') && m.id !== PICK_ID && m.id !== ME_ID && m.id !== SEARCH_ID) {
      clusterableMarkers.push(m);
    } else {
      nonClusterableMarkers.push(m);
    }
  }

  const initialCenter = center ?? value ?? MAP_CONFIG.defaultCenter;
  const initialZoom = zoom ?? (value ? 16 : MAP_CONFIG.defaultZoom);

  return (
    <div
      className={`geo-map ${mode === 'pick' && !compact ? 'geo-map--pick' : ''} ${className}`}
      style={{ height }}
    >
      <MapContainer
        ref={setMap}
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={false}
        scrollWheelZoom={!compact}
        dragging={!compact}
        doubleClickZoom={!compact}
        touchZoom={!compact}
        keyboard={!compact}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Base Layer */}
        {satellite ? (
          <>
            <TileLayer
              url={MAP_CONFIG.satelliteUrl}
              attribution={MAP_CONFIG.satelliteAttribution}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer url={MAP_CONFIG.labelsUrl} maxNativeZoom={18} maxZoom={19} />
          </>
        ) : (
          <TileLayer url={MAP_CONFIG.tileUrl} attribution={MAP_CONFIG.tileAttribution} />
        )}

        {/* Optional Traffic Layer */}
        {trafficOn && MAP_CONFIG.trafficUrl && <TileLayer url={MAP_CONFIG.trafficUrl} />}

        <ResizeFix />
        <FitController points={fitPoints} fitKey={fitKey} enabled={autoFit && !compact} />
        <MapClickHandler enabled={mode === 'pick' && !compact} onPick={handlePick} />
        <FollowValue value={mode === 'pick' ? value : null} />

        {/* Markers */}
        {clustering && clusterableMarkers.length > 0 ? (
          <MarkerClusterGroup chunkedLoading>
            {clusterableMarkers.map(renderMarker)}
          </MarkerClusterGroup>
        ) : (
          clusterableMarkers.map(renderMarker)
        )}
        {nonClusterableMarkers.map(renderMarker)}

        {/* Circles */}
        {circles.map((c) => (
          <Circle
            key={c.id}
            center={c.center}
            radius={c.radiusM}
            pathOptions={{
              color: c.color ?? '#2563EB',
              fillColor: c.color ?? '#2563EB',
              fillOpacity: 0.15,
              dashArray: c.dashed ? '6 6' : undefined,
              weight: 2,
            }}
          >
            {c.label && <Tooltip sticky>{c.label}</Tooltip>}
          </Circle>
        ))}

        {/* Polylines */}
        {polylines.map((pl) => (
          <Polyline
            key={pl.id}
            positions={pl.positions}
            pathOptions={{
              color: pl.color ?? '#2563EB',
              weight: pl.weight ?? 3,
              dashArray: pl.dashed ? '6 6' : undefined,
            }}
          >
            <Tooltip sticky>
              {pl.label ?? formatDistance(pathLengthKm(pl.positions))}
            </Tooltip>
          </Polyline>
        ))}
      </MapContainer>

      {/* Interactive Overlays Layer */}
      {!compact && (
        <div className="pointer-events-none absolute inset-0 z-[1100]">
          {/* Top-Left: Search Bar */}
          {search && (
            <div className="pointer-events-auto absolute left-3 top-3 w-[min(380px,calc(100%-84px))]">
              <MapSearchBox
                bias={value ?? center ?? (map ? [map.getCenter().lat, map.getCenter().lng] : undefined)}
                onSelect={(res) => {
                  if (map) {
                    map.flyTo(res.position, 17);
                  }
                  if (mode === 'pick') {
                    handlePick(res.position);
                  } else {
                    setSearchHit({ position: res.position, title: res.title });
                  }
                }}
                onClear={() => setSearchHit(null)}
              />
            </div>
          )}

          {/* Top-Right: Control Stack */}
          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col gap-2">
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={() => map?.zoomIn()}
                className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => map?.zoomOut()}
                className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              {showLocate && (
                <button
                  type="button"
                  onClick={handleLocate}
                  disabled={locating || hookBusy}
                  className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  aria-label="My location"
                  title="My location"
                >
                  {locating || hookBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <LocateFixed className="h-4 w-4 text-primary" />
                  )}
                </button>
              )}
            </div>

            {/* Layer Switcher */}
            {layerSwitcher && (
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur">
                <button
                  type="button"
                  onClick={() => setSatellite((prev) => !prev)}
                  className={`flex h-9 w-9 items-center justify-center transition-colors ${
                    satellite
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  aria-label={satellite ? 'Switch to Street Map' : 'Switch to Satellite'}
                  title={satellite ? 'Street Map' : 'Satellite'}
                >
                  {satellite ? <MapIcon className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
                </button>
                {trafficAvailable && (
                  <button
                    type="button"
                    onClick={() => setTrafficOn((prev) => !prev)}
                    className={`flex h-9 w-9 items-center justify-center transition-colors ${
                      trafficOn
                        ? 'bg-amber-500 text-white'
                        : 'text-foreground hover:bg-muted'
                    }`}
                    aria-label="Toggle Traffic"
                    title="Traffic"
                  >
                    <TrafficCone className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom-Left: Pick Info Card */}
          {mode === 'pick' && (
            <div className="pointer-events-auto absolute bottom-3 left-3 max-w-[min(420px,calc(100%-24px))]">
              <div className="rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
                {value ? (
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-semibold text-foreground">
                          {addressLoading
                            ? 'Finding address…'
                            : address?.displayName || 'Selected location'}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {value[0].toFixed(5)}, {value[1].toFixed(5)}
                          </code>
                          {me && (
                            <span className="text-[10px] text-muted-foreground">
                              {me.source === 'ip' ? 'Approximate' : me.accuracyM ? `±${me.accuracyM} m` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${value[0].toFixed(7)}, ${value[1].toFixed(7)}`);
                            toast.success('Coordinates copied');
                          }}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Copy coordinates"
                          title="Copy coordinates"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openExternal(googleMapsPlaceUrl(value))}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Open in Google Maps"
                          title="Open in Google Maps"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Search for a place or click the map to drop a pin.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Permission modal */}
      {modal}
    </div>
  );
}

