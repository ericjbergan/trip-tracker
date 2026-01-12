import dotenv from 'dotenv';

dotenv.config();

// Mount Gambier coordinates
const MOUNT_GAMBIER = { lat: -37.8287, lng: 140.7825 };

// Kangaroo Island Ferry (Cape Jervis) coordinates
const CAPE_JERVIS = { lat: -35.6000, lng: 138.1000 };

// Coastal waypoints to force the route along the coast
// Key coastal towns between Mount Gambier and Cape Jervis
const COASTAL_WAYPOINTS = [
  { lat: -37.5, lng: 140.3 },  // Near Beachport
  { lat: -37.1, lng: 139.8 },  // Near Robe
  { lat: -36.8, lng: 139.8 },  // Near Kingston SE
  { lat: -36.3, lng: 139.8 },  // Near Meningie
  { lat: -35.7, lng: 138.5 },  // Near Victor Harbor
];

async function calculateCoastalRoute() {
  try {
    // Get API key from frontend .env (since backend doesn't have it)
    // Or use the one from frontend if available
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not found in environment variables');
      console.log('Note: You may need to add GOOGLE_MAPS_API_KEY to your backend .env file');
      console.log('Or set it temporarily: $env:GOOGLE_MAPS_API_KEY="your-key-here"');
      return;
    }

    console.log('Calculating coastal route from Mount Gambier to Cape Jervis...\n');
    console.log('Start: Mount Gambier (-37.8287, 140.7825)');
    console.log('End: Cape Jervis (Kangaroo Island Ferry) (-35.6000, 138.1000)');
    console.log(`Waypoints: ${COASTAL_WAYPOINTS.length} coastal waypoints\n`);

    // Build waypoints string for Google Maps API
    const waypointsStr = COASTAL_WAYPOINTS.map(wp => `${wp.lat},${wp.lng}`).join('|');

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${MOUNT_GAMBIER.lat},${MOUNT_GAMBIER.lng}&destination=${CAPE_JERVIS.lat},${CAPE_JERVIS.lng}&waypoints=${waypointsStr}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.routes.length > 0) {
      const route = data.routes[0];
      
      // Calculate total distance and duration across all legs
      let totalDistance = 0;
      let totalDuration = 0;
      
      route.legs.forEach((leg: any) => {
        totalDistance += leg.distance.value; // distance in meters
        totalDuration += leg.duration.value; // duration in seconds
      });

      const distanceKm = (totalDistance / 1000).toFixed(1);
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);

      console.log('Route calculated successfully!\n');
      console.log(`Total Distance: ${distanceKm} km`);
      console.log(`Total Duration: ${hours}h ${minutes}m`);
      console.log(`\nRoute has ${route.legs.length} leg(s)`);
      
      // Show details for each leg
      route.legs.forEach((leg: any, index: number) => {
        console.log(`\nLeg ${index + 1}:`);
        console.log(`  From: ${leg.start_address || 'Unknown'}`);
        console.log(`  To: ${leg.end_address || 'Unknown'}`);
        console.log(`  Distance: ${leg.distance.text}`);
        console.log(`  Duration: ${leg.duration.text}`);
      });
    } else {
      console.error('Error calculating route:', data.status);
      console.error('Error message:', data.error_message || 'No error message');
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

calculateCoastalRoute();
