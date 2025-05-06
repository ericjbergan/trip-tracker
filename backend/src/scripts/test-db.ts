import { connectDB, disconnectDB } from '../config/database';
import Route from '../models/Route';
import Marker from '../models/Marker';

async function testDatabase() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected successfully!');

    // Test Route operations
    console.log('\nTesting Route operations...');
    
    // Create a test route
    const testRoute = new Route({
      start: { lat: 40.7128, lng: -74.0060 }, // New York
      end: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
      waypoints: [],
      overviewPath: [
        { lat: 40.7128, lng: -74.0060 },
        { lat: 34.0522, lng: -118.2437 }
      ],
      distance: '2,789 mi',
      duration: '41 hours 30 mins',
      color: '#FF0000'
    });

    const savedRoute = await testRoute.save();
    console.log('Created test route:', savedRoute._id);

    // Read the route
    const foundRoute = await Route.findById(savedRoute._id);
    console.log('Found route:', foundRoute ? 'Success' : 'Failed');

    // Test Marker operations
    console.log('\nTesting Marker operations...');
    
    // Create a test marker
    const testMarker = new Marker({
      position: { lat: 40.7128, lng: -74.0060 }
    });

    const savedMarker = await testMarker.save();
    console.log('Created test marker:', savedMarker._id);

    // Read the marker
    const foundMarker = await Marker.findById(savedMarker._id);
    console.log('Found marker:', foundMarker ? 'Success' : 'Failed');

    // Clean up test data
    console.log('\nCleaning up test data...');
    await Route.findByIdAndDelete(savedRoute._id);
    await Marker.findByIdAndDelete(savedMarker._id);
    console.log('Test data cleaned up');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Disconnect from MongoDB
    await disconnectDB();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the test
testDatabase(); 