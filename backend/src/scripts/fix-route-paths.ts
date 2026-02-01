/**
 * Fix older routes that have a sparse overviewPath (zigzag point-to-point)
 * by re-requesting Google Directions and storing the road-following path.
 *
 * Run: npm run fix-routes
 *       FIX_ALL_ROUTES=1 npm run fix-routes  (to re-fetch all routes)
 *
 * Requires: A Google Maps API key that works for SERVER-SIDE requests.
 *   - Keys with "HTTP referrer" restrictions only work in the browser and will
 *     get REQUEST_DENIED when used from this script.
 *   - Use GOOGLE_MAPS_SERVER_API_KEY or GOOGLE_MAPS_API_KEY in backend .env
 *     with a key that has NO application restrictions, or "IP addresses" only.
 * Requires: MONGODB_URI in backend .env
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import Route from '../models/Route';

dotenv.config();
// Prefer server key (no referrer restrictions). Fallback: backend then frontend .env
if (!process.env.GOOGLE_MAPS_SERVER_API_KEY && !process.env.GOOGLE_MAPS_API_KEY && !process.env.VITE_GOOGLE_MAPS_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '../../../frontend/.env') });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trip-tracker';

interface LatLng {
  lat: number;
  lng: number;
}

/** Decode Google's encoded polyline (overview_polyline.points) to lat/lng array */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Route is "sparse" if path has few points (zigzag point-to-point, not smooth road-following) */
function isSparseRoute(route: { overviewPath: LatLng[]; waypoints: LatLng[] }): boolean {
  const pathLen = route.overviewPath?.length ?? 0;
  const numStops = (route.waypoints?.length ?? 0) + 2; // start + end + waypoints
  // Sparse: path has at most the stop points
  if (pathLen <= numStops) return true;
  // Sparse: very few points for a multi-leg route
  if (route.waypoints?.length && pathLen < 50) return true;
  // Sparse: path has fewer than ~150 points (Directions road path usually has hundreds)
  if (pathLen < 150) return true;
  return false;
}

async function fetchDirectionsPath(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  apiKey: string
): Promise<{ path: LatLng[]; distance: string; duration: string } | null> {
  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = `${destination.lat},${destination.lng}`;
  const waypointsStr = waypoints.length
    ? 'waypoints=' + waypoints.map((w) => `${w.lat},${w.lng}`).join('|') + '&'
    : '';

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&${waypointsStr}alternatives=false&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    console.warn('  Directions API:', data.status, data.error_message || '');
    if (data.status === 'REQUEST_DENIED' && /referrer|restriction/i.test(data.error_message || '')) {
      console.warn('  → Use an API key with NO HTTP referrer restrictions (e.g. "None" or "IP addresses" only) in Google Cloud Console → Credentials.');
    }
    return null;
  }

  const route = data.routes[0];
  const encoded = route.overview_polyline?.points;
  if (!encoded) return null;

  const path = decodePolyline(encoded);
  if (path.length < 2) return null;

  let totalDistance = 0;
  let totalDuration = 0;
  for (const leg of route.legs || []) {
    totalDistance += leg.distance?.value ?? 0;
    totalDuration += leg.duration?.value ?? 0;
  }
  const distanceText = totalDistance ? `${(totalDistance / 1000).toFixed(1)} km` : route.legs?.[0]?.distance?.text ?? '';
  const durationText = totalDuration
    ? `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m`
    : route.legs?.[0]?.duration?.text ?? '';

  return { path, distance: distanceText, duration: durationText };
}

async function main() {
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('Set GOOGLE_MAPS_SERVER_API_KEY or GOOGLE_MAPS_API_KEY in backend .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    const routes = await Route.find({}).sort({ createdAt: 1 });
    console.log(`Total routes: ${routes.length}`);

    const pathLengths = routes.map((r) => (r.overviewPath?.length ?? 0)).filter((n) => n > 0);
    if (pathLengths.length) {
      const min = Math.min(...pathLengths);
      const max = Math.max(...pathLengths);
      const under150 = pathLengths.filter((n) => n < 150).length;
      console.log(`Path lengths: min=${min}, max=${max}, routes with <150 points: ${under150}`);
    }

    const fixAll = process.env.FIX_ALL_ROUTES === '1' || process.env.FIX_ALL_ROUTES === 'true';
    const sparse = fixAll ? routes : routes.filter((r) => isSparseRoute(r));
    if (fixAll) console.log('FIX_ALL_ROUTES=1: re-fetching directions for every route.');
    console.log(`Routes to fix: ${sparse.length}\n`);

    let fixed = 0;
    let failed = 0;

    for (const route of sparse) {
      const waypoints = route.waypoints || [];
      const origin = route.start;
      const destination = route.end;
      if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
        console.warn(`  Skip route ${route._id}: missing start/end`);
        failed++;
        continue;
      }

      const result = await fetchDirectionsPath(origin, destination, waypoints, apiKey);
      if (!result) {
        console.warn(`  Skip route ${route._id}: Directions API failed or no path`);
        failed++;
        continue;
      }

      route.overviewPath = result.path;
      route.distance = result.distance;
      route.duration = result.duration;
      await route.save();
      fixed++;
      console.log(`  Fixed route ${route._id} (${result.path.length} points)`);

      // Avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`\nDone. Fixed: ${fixed}, Failed: ${failed}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main();
