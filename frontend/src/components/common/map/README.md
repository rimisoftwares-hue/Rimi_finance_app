# GeoMap Component & Map Module

A modular, Google-Maps-styled map component built with Leaflet, React-Leaflet, and Tailwind CSS.
It is 100% self-contained with no domain or finance-specific dependencies.

---

## 1. Props Reference (`GeoMapProps`)

| Prop | Type | Default | Description |
|---|---|---|---|
| `markers` | `GeoMarker[]` | `[]` | List of markers to display |
| `circles` | `GeoCircle[]` | `[]` | Accuracy or geofence circles |
| `polylines` | `GeoPolyline[]` | `[]` | Routes, connections, or trails |
| `center` | `[number, number]` | `MAP_CONFIG.defaultCenter` | Initial map center |
| `zoom` | `number` | `MAP_CONFIG.defaultZoom` | Initial map zoom level |
| `fitKey` | `string \| number` | `undefined` | Re-fits viewport to markers whenever this value changes |
| `autoFit` | `boolean` | `true` | Automatically fit bounds on mount and `fitKey` change |
| `mode` | `'view' \| 'pick'` | `'view'` | View mode or pick mode (draggable pin & address lookup) |
| `value` | `[number, number] \| null` | `null` | Controlled coordinate value in pick mode |
| `onChange` | `(pos: [number, number]) => void` | `undefined` | Callback when pin is placed or dragged |
| `locateSetsPin` | `boolean` | `true` | In pick mode, clicking 'My Location' moves the pin |
| `search` | `boolean` | `true` | Show floating pill search bar |
| `locate` | `boolean` | `true` | Show 'My Location' control button |
| `layerSwitcher` | `boolean` | `true` | Show satellite / street layer toggle |
| `traffic` | `boolean` | `true` | Show traffic toggle (only if `VITE_TRAFFIC_TILE_URL` configured) |
| `clustering` | `boolean` | `false` | Enable clustering for customers, agents, and custom markers |
| `fetchAddress` | `boolean` | `false` | In pick mode, reverse-geocode picked coordinates |
| `onAddress` | `(addr: ParsedAddress \| null) => void` | `undefined` | Callback with parsed address suggestions |
| `compact` | `boolean` | `false` | Static preview mode: no controls, no user dragging/zooming |
| `height` | `number \| string` | `420` | Container height (e.g. `400`, `'60vh'`) |
| `className` | `string` | `''` | Extra CSS class names on outer wrapper |

---

## 2. Integration Recipes

### A. Pick or Fetch Customer / Office Address
```tsx
import { useState } from 'react';
import { MapPickerDialog, type MapPickResult } from '@/components/common/map';

function AddressForm() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);

  const handleConfirm = ({ lat, lng, address }: MapPickResult) => {
    setCoords([lat, lng]);
    if (address) {
      // Prefill empty fields without overwriting existing data
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)}>Pick Address on Map</button>
      <MapPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={coords}
        title="Pick customer address"
        extraMarkers={[{ id: 'office', position: [11.0168, 76.9558], kind: 'office', label: 'Office' }]}
        onConfirm={handleConfirm}
      />
    </>
  );
}
```

### B. Customer Location Tracking (Office + Customer + Geofence + Distance)
```tsx
import { GeoMap, formatDistance, haversineKm } from '@/components/common/map';

function CustomerTrackingView({ officePos, customerPos, geofenceM, customer }) {
  const distanceKm = haversineKm(officePos, customerPos);

  return (
    <GeoMap
      height={360}
      markers={[
        { id: 'office', position: officePos, kind: 'office', label: 'Office' },
        {
          id: 'customer',
          position: customerPos,
          kind: 'customer',
          label: customer.name,
          popup: {
            title: customer.name,
            subtitle: customer.phone,
            lines: [`${formatDistance(distanceKm)} from office`],
          },
        },
      ]}
      circles={[{ id: 'fence', center: officePos, radiusM: geofenceM, dashed: true, label: 'Office geofence' }]}
      polylines={[{ id: 'link', positions: [officePos, customerPos], dashed: true }]}
    />
  );
}
```

### C. Agent Live or Last-Known Location (Parent Polls API)
```tsx
import { GeoMap, type LatLngTuple } from '@/components/common/map';

function AgentLiveMap({ officePos, agents, trail, recenterNonce }) {
  return (
    <GeoMap
      height={480}
      clustering
      fitKey={recenterNonce} // bump on "Re-center" button; live updates do not hijack user pan/zoom
      markers={[
        { id: 'office', position: officePos, kind: 'office', label: 'Head Office' },
        ...agents.map((a) => ({
          id: `agent-${a.id}`,
          position: [a.lat, a.lng] as LatLngTuple,
          kind: 'agent' as const,
          pulse: a.isLive,
          accuracyM: a.accuracyM,
          label: a.name,
          popup: {
            title: a.name,
            subtitle: a.isLive ? 'Live Active' : `Last seen ${a.lastSeenText}`,
            lines: [`Accuracy: ±${a.accuracyM ?? '?'} m`],
          },
        })),
      ]}
      polylines={trail.length > 1 ? [{ id: 'trail', positions: trail, color: '#F97316' }] : []}
    />
  );
}
```

### D. Login-Session Audit (`agent_login_sessions`)
```tsx
import { GeoMap, type LatLngTuple } from '@/components/common/map';

function LoginAuditMap({ sessions, officePos, officeGeofenceM }) {
  return (
    <GeoMap
      height={450}
      clustering
      markers={[
        { id: 'office', position: officePos, kind: 'office', label: 'Office' },
        ...sessions.map((s) => ({
          id: `session-${s.id}`,
          position: [s.login_lat, s.login_lng] as LatLngTuple,
          kind: 'custom' as const,
          color: s.flagged ? '#EF4444' : '#10B981',
          label: `${s.username} (${s.source})`,
          popup: {
            title: s.username,
            subtitle: s.flagged ? `Flagged: ${s.flag_reason}` : 'Normal Login',
            lines: [
              `IP: ${s.ip_address || 'N/A'}`,
              `Distance from office: ${s.distance_from_office_km ?? '?'} km`,
            ],
          },
        })),
      ]}
      circles={[{ id: 'geofence', center: officePos, radiusM: officeGeofenceM, dashed: true, label: 'Office geofence' }]}
    />
  );
}
```

### E. Many Customers on Map (Clustered)
```tsx
import { GeoMap, type LatLngTuple } from '@/components/common/map';

function AllCustomersMap({ customers }) {
  return (
    <GeoMap
      height={500}
      clustering
      markers={customers.map((c) => ({
        id: `customer-${c.id}`,
        position: [c.latitude, c.longitude] as LatLngTuple,
        kind: 'customer' as const,
        label: c.name,
        popup: {
          title: c.name,
          subtitle: c.area || c.city,
          lines: [`Due: ₹${c.due_amount}`],
        },
      }))}
    />
  );
}
```

---

## 3. Provider Policies & Extensibility

- **OpenStreetMap Tiles**: Default tile server (`tile.openstreetmap.org`) is for testing and low volume. For production deployments, configure a keyed provider (e.g. Mapbox, Stadia, Protomaps) via `VITE_MAP_TILE_URL` in `.env`.
- **Photon**: As-you-type geocoding uses Komoot's Photon API. It is fair-use and free.
- **Nominatim**: Used strictly for reverse geocoding and explicit Enter key search fallback. Adheres strictly to the 1 request/second throttling policy.
- **Esri Satellite**: World Imagery tiles (`server.arcgisonline.com`) are used for satellite imagery. Review Esri terms for commercial use.
- **Centralized Provider Swapping**: `geo.config.ts` and `geocoder.ts` are the ONLY two files required to point to alternative or self-hosted map/geocoding providers.
- **Agent Tracking Privacy**: Live tracking of agents or location logging must be transparently disclosed to staff with proper consent or privacy notifications.

