import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Route from '../models/Route';
import Marker from '../models/Marker';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trip-tracker';

async function backupData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Fetch all data
    const routes = await Route.find({}).sort({ createdAt: -1 });
    const markers = await Marker.find({}).sort({ createdAt: -1 });

    console.log(`Found ${routes.length} routes`);
    console.log(`Found ${markers.length} markers\n`);

    // Prepare backup data
    const backupData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      routes: routes.map(route => ({
        _id: route._id.toString(),
        start: route.start,
        end: route.end,
        waypoints: route.waypoints,
        overviewPath: route.overviewPath,
        distance: route.distance,
        duration: route.duration,
        color: route.color,
        createdAt: route.createdAt,
        updatedAt: route.updatedAt
      })),
      markers: markers.map(marker => ({
        _id: marker._id.toString(),
        position: marker.position,
        name: marker.name,
        isLarge: marker.isLarge,
        color: marker.color,
        showLabel: marker.showLabel,
        createdAt: marker.createdAt,
        updatedAt: marker.updatedAt
      }))
    };

    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `trip-tracker-backup-${timestamp}.json`;
    const filepath = path.join(backupDir, filename);

    // Write backup file
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log(`✅ Backup created successfully!`);
    console.log(`📁 Location: ${filepath}`);
    console.log(`📊 Routes: ${routes.length}`);
    console.log(`📍 Markers: ${markers.length}\n`);

    // Also create a "latest" backup
    const latestBackupPath = path.join(backupDir, 'latest-backup.json');
    fs.writeFileSync(latestBackupPath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`📌 Latest backup also saved to: ${latestBackupPath}\n`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    process.exit(1);
  }
}

backupData();
