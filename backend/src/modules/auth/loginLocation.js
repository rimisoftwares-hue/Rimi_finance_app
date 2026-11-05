const geoip = require('geoip-lite');

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function validCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
         !(lat === 0 && lng === 0);
}

function getClientIp(req) {
  // Only trust x-forwarded-for if app.set('trust proxy', ...) is configured; req.ip honors it.
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);   // IPv4-mapped IPv6 only; keep real IPv6 intact
  if (ip === '::1') ip = '127.0.0.1';
  return ip.slice(0, 45);
}

function lookupIp(ip) {
  const g = geoip.lookup(ip);                         // null for private/localhost IPs
  if (!g || !Array.isArray(g.ll)) return null;
  return { lat: g.ll[0], lng: g.ll[1], city: g.city || null, region: g.region || null, country: g.country || null };
}

module.exports = { haversineKm, validCoords, getClientIp, lookupIp };

