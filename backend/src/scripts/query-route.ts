import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Route from '../models/Route';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trip-tracker';

async function queryRoute() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Search for routes that might be Warrnambool to Adelaide
    // Warrnambool is approximately: -38.3833, 142.4833
    // Adelaide is approximately: -34.9285, 138.6007
    
    const routes = await Route.find({}).sort({ createdAt: -1 });
    
    console.log(`\nFound ${routes.length} total routes\n`);
    
    // Look for routes that might be in Australia (negative latitudes)
    const australianRoutes = routes.filter(route => 
      route.start.lat < 0 && route.end.lat < 0 &&
      route.start.lng > 100 && route.end.lng > 100
    );
    
    console.log(`Found ${australianRoutes.length} routes in Australia\n`);
    
    // Look for routes that might be Warrnambool to Adelaide
    // Check if start is near Warrnambool (-38.38, 142.48) or Adelaide (-34.93, 138.60)
    // and end is near the other city
    const warrnamboolToAdelaide = routes.filter(route => {
      const startLat = route.start.lat;
      const startLng = route.start.lng;
      const endLat = route.end.lat;
      const endLng = route.end.lng;
      
      // Check if start is near Warrnambool and end is near Adelaide
      const startNearWarrnambool = Math.abs(startLat - (-38.38)) < 1 && Math.abs(startLng - 142.48) < 1;
      const endNearAdelaide = Math.abs(endLat - (-34.93)) < 1 && Math.abs(endLng - 138.60) < 1;
      
      // Or vice versa
      const startNearAdelaide = Math.abs(startLat - (-34.93)) < 1 && Math.abs(startLng - 138.60) < 1;
      const endNearWarrnambool = Math.abs(endLat - (-38.38)) < 1 && Math.abs(endLng - 142.48) < 1;
      
      return (startNearWarrnambool && endNearAdelaide) || (startNearAdelaide && endNearWarrnambool);
    });
    
    if (warrnamboolToAdelaide.length > 0) {
      console.log('Found Warrnambool to Adelaide route(s):\n');
      warrnamboolToAdelaide.forEach((route, index) => {
        console.log(`Route ${index + 1}:`);
        console.log(`  ID: ${route._id}`);
        console.log(`  Start: ${route.start.lat.toFixed(4)}, ${route.start.lng.toFixed(4)}`);
        console.log(`  End: ${route.end.lat.toFixed(4)}, ${route.end.lng.toFixed(4)}`);
        console.log(`  Waypoints: ${route.waypoints.length}`);
        console.log(`  Distance: ${route.distance}`);
        console.log(`  Duration: ${route.duration}`);
        console.log(`  Color: ${route.color}`);
        console.log(`  Created: ${route.createdAt}`);
        console.log('');
      });
    } else {
      console.log('No Warrnambool to Adelaide route found. Showing all Australian routes:\n');
      australianRoutes.slice(0, 10).forEach((route, index) => {
        console.log(`Route ${index + 1}:`);
        console.log(`  ID: ${route._id}`);
        console.log(`  Start: ${route.start.lat.toFixed(4)}, ${route.start.lng.toFixed(4)}`);
        console.log(`  End: ${route.end.lat.toFixed(4)}, ${route.end.lng.toFixed(4)}`);
        console.log(`  Waypoints: ${route.waypoints.length}`);
        console.log(`  Distance: ${route.distance}`);
        console.log(`  Duration: ${route.duration}`);
        console.log('');
      });
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

queryRoute();
