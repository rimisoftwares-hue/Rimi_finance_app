import type { GeoSearchResult, LatLngTuple, ParsedAddress } from './geo.types';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const BBOX = import.meta.env.VITE_GEOCODER_BBOX || '68.1,6.5,97.4,35.7'; // minLon,minLat,maxLon,maxLat
const COUNTRY = import.meta.env.VITE_GEOCODER_COUNTRY || 'in';
const CONTACT_EMAIL = import.meta.env.VITE_GEOCODER_EMAIL || undefined;

interface PhotonProps {
  name?: string;
  housenumber?: string;
  street?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  osm_id?: number;
  osm_type?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProps;
}

const uniq = (parts: Array<string | undefined>) =>
  [...new Set(parts.filter((p): p is string => !!p && p.trim().length > 0))];

/** As-you-type suggestions (Photon is designed for this; Nominatim is not). */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  bias?: LatLngTuple,
): Promise<GeoSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en', bbox: BBOX });
  if (bias) {
    params.set('lat', String(bias[0]));
    params.set('lon', String(bias[1]));
  }
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  return (json.features ?? []).map((f, i) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const title = p.name || street || p.city || p.district || p.state || 'Unnamed place';
    const subtitle = uniq([p.name && street ? street : undefined, p.district, p.city, p.county, p.state, p.postcode])
      .filter((s) => s !== title)
      .join(', ');
    return {
      id: `${p.osm_type ?? 'x'}${p.osm_id ?? i}`,
      title,
      subtitle,
      position: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as LatLngTuple,
    };
  });
}

// Nominatim policy: max 1 request/second, no autocomplete.
let nextNominatimSlot = 0;
async function nominatimGate(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = now + wait + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Explicit-submit fallback only (user pressed Enter and Photon returned nothing). */
export async function searchNominatim(query: string, signal?: AbortSignal): Promise<GeoSearchResult[]> {
  await nominatimGate();
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    limit: '5',
    countrycodes: COUNTRY,
    'accept-language': 'en',
    ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const rows = (await res.json()) as Array<{ place_id: number; lat: string; lon: string; display_name: string }>;
  return rows.map((r) => {
    const [first, ...rest] = r.display_name.split(', ');
    return {
      id: `n${r.place_id}`,
      title: first,
      subtitle: rest.slice(0, 3).join(', '),
      position: [Number(r.lat), Number(r.lon)] as LatLngTuple,
    };
  });
}

const reverseCache = new Map<string, ParsedAddress | null>();

export async function reverseGeocode(pos: LatLngTuple, signal?: AbortSignal): Promise<ParsedAddress | null> {
  const key = `${pos[0].toFixed(5)},${pos[1].toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;
  await nominatimGate();
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(pos[0]),
    lon: String(pos[1]),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
    ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
  });
  const res = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const j = (await res.json()) as { error?: string; display_name?: string; address?: Record<string, string> };
  let parsed: ParsedAddress | null = null;
  if (!j.error && j.display_name) {
    const a = j.address ?? {};
    // Indian address data is inconsistent: treat these as SUGGESTIONS the user can edit.
    parsed = {
      houseNo: a.house_number,
      street: a.road,
      village: a.neighbourhood ?? a.suburb ?? a.hamlet ?? a.quarter ?? a.village,
      city: a.city ?? a.town ?? a.municipality ?? a.village ?? a.county,
      district: a.state_district ?? a.county,
      state: a.state,
      pincode: a.postcode,
      displayName: j.display_name,
    };
  }
  if (reverseCache.size > 50) reverseCache.clear();
  reverseCache.set(key, parsed);
  return parsed;
}

