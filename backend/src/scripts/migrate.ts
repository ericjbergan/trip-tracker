import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Route } from '../models/Route';
import { Marker } from '../models/Marker';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trip-tracker')
  .then(async () => {
    console.log('Connected to MongoDB');

    try {
      // Get the localStorage data from the frontend
      const localStorageData = {
        routes: JSON.parse(process.argv[2] || '[]'),
        markers: JSON.parse(process.argv[3] || '[]')
      };

      console.log('Migrating data:', {
        routesCount: localStorageData.routes.length,
        markersCount: localStorageData.markers.length
      });

      // Migrate routes
      if (localStorageData.routes.length > 0) {
        const routes = localStorageData.routes.map((route: any) => ({
          start: route.start,
          end: route.end,
          waypoints: route.waypoints || [],
          overviewPath: route.overviewPath,
          distance: route.distance,
          duration: route.duration,
          color: route.color
        }));

        await Route.insertMany(routes);
        console.log(`Migrated ${routes.length} routes`);
      }

      // Migrate markers
      if (localStorageData.markers.length > 0) {
        const markers = localStorageData.markers.map((position: any) => ({
          position: {
            lat: position.lat,
            lng: position.lng
          }
        }));

        await Marker.insertMany(markers);
        console.log(`Migrated ${markers.length} markers`);
      }

      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Error during migration:', error);
    } finally {
      await mongoose.disconnect();
    }
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  }); 