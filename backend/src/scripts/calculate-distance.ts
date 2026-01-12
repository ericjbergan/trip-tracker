import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from '../models/Route';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trip-tracker';

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Mount Gambier coordinates
const MOUNT_GAMBIER = { lat: -37.8287, lng: 140.7825 };

// Kangaroo Island Ferry (Cape Jervis) coordinates  
const CAPE_JERVIS = { lat: -35.6000, lng: 138.1000 };

async function findCoastalRoute() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Search for routes that might be Mount Gambier to Cape Jervis
    const routes = await Route.find({}).sort({ createdAt: -1 });
    
    // Look for routes near Mount Gambier and Cape Jervis
    const coastalRoutes = routes.filter(route => {
      const startLat = route.start.lat;
      const startLng = route.start.lng;
      const endLat = route.end.lat;
      const endLng = route.end.lng;
      
      // Check if route is near Mount Gambier and Cape Jervis (within 50km)
      const distToMountGambier = calculateDistance(startLat, startLng, MOUNT_GAMBIER.lat, MOUNT_GAMBIER.lng);
      const distToCapeJervis = calculateDistance(endLat, endLng, CAPE_JERVIS.lat, CAPE_JERVIS.lng);
      
      const reverseDistToMountGambier = calculateDistance(endLat, endLng, MOUNT_GAMBIER.lat, MOUNT_GAMBIER.lng);
      const reverseDistToCapeJervis = calculateDistance(startLat, startLng, CAPE_JERVIS.lat, CAPE_JERVIS.lng);
      
      return (distToMountGambier < 50 && distToCapeJervis < 50) || 
             (reverseDistToMountGambier < 50 && reverseDistToCapeJervis < 50);
    });
    
    if (coastalRoutes.length > 0) {
      console.log('Found route(s) from Mount Gambier to Cape Jervis:\n');
      coastalRoutes.forEach((route, index) => {
        console.log(`Route ${index + 1}:`);
        console.log(`  ID: ${route._id}`);
        console.log(`  Start: ${route.start.lat.toFixed(4)}, ${route.start.lng.toFixed(4)}`);
        console.log(`  End: ${route.end.lat.toFixed(4)}, ${route.end.lng.toFixed(4)}`);
        console.log(`  Waypoints: ${route.waypoints.length}`);
        console.log(`  Distance: ${route.distance}`);
        console.log(`  Duration: ${route.duration}`);
        console.log('');
      });
    } else {
      console.log('No existing route found from Mount Gambier to Cape Jervis.');
      console.log('\nTo calculate this route:');
      console.log('1. Open your trip tracker app');
      console.log('2. Create a new route');
      console.log('3. Set start: Mount Gambier');
      console.log('4. Add waypoints along the coast (Beachport, Robe, Kingston SE, Meningie, Victor Harbor)');
      console.log('5. Set end: Cape Jervis');
      console.log('6. The app will calculate the distance and duration');
      console.log('\nStraight-line distance: ~' + calculateDistance(MOUNT_GAMBIER.lat, MOUNT_GAMBIER.lng, CAPE_JERVIS.lat, CAPE_JERVIS.lng).toFixed(1) + ' km');
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findCoastalRoute();
