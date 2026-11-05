import L from 'leaflet';
import type { MarkerGlyph, MarkerKind } from './geo.types';

export const KIND_COLOR: Record<MarkerKind, string> = {
  office: '#2563EB',
  customer: '#16A34A',
  agent: '#F97316',
  me: '#2563EB',
  picked: '#EF4444',
  custom: '#64748B',
};

const KIND_GLYPH: Record<MarkerKind, MarkerGlyph> = {
  office: 'building',
  customer: 'home',
  agent: 'navigation',
  me: 'dot',
  picked: 'dot',
  custom: 'dot',
};

export const KIND_Z: Record<MarkerKind, number> = {
  custom: 100,
  customer: 200,
  agent: 300,
  office: 400,
  me: 500,
  picked: 1000,
};

const HEX = /^#[0-9a-f]{3,8}$/i; // colors are interpolated into HTML: accept hex only

function glyphHtml(glyph: MarkerGlyph): string {
  switch (glyph) {
    case 'building':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>';
    case 'home':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    case 'user':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    case 'navigation':
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
    default:
      return '<span class="geo-pin-dot"></span>';
  }
}

const cache = new Map<string, L.DivIcon>();

export function getMarkerIcon(
  kind: MarkerKind,
  opts: { glyph?: MarkerGlyph; color?: string; pulse?: boolean } = {},
): L.DivIcon {
  const color = opts.color && HEX.test(opts.color) ? opts.color : KIND_COLOR[kind];
  const glyph = opts.glyph ?? KIND_GLYPH[kind];
  const key = `${kind}|${glyph}|${color}|${opts.pulse ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let icon: L.DivIcon;
  if (kind === 'me') {
    icon = L.divIcon({
      className: 'geo-icon',
      html: '<div class="geo-me"><span class="geo-me-pulse"></span><span class="geo-me-dot"></span></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  } else {
    const html =
      `<div class="geo-pin${opts.pulse ? ' geo-pin--pulse' : ''}" style="--geo-color:${color}">` +
      `<svg class="geo-pin-shape" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M18 1C9.2 1 2 8.2 2 17c0 11.5 13.4 24.3 15 25.7.6.5 1.4.5 2 0C20.6 41.3 34 28.5 34 17 34 8.2 26.8 1 18 1z" fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
      `</svg><span class="geo-pin-glyph">${glyphHtml(glyph)}</span></div>`;
    icon = L.divIcon({
      className: 'geo-icon', // overrides Leaflet's default white box divIcon style
      html,
      iconSize: [36, 46],
      iconAnchor: [18, 44],
      popupAnchor: [0, -40],
      tooltipAnchor: [0, -40],
    });
  }
  cache.set(key, icon);
  return icon;
}

