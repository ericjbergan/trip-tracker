# Data Backup Guide

## Protecting Your Trip Tracker Data

Your routes and markers are valuable! Here are multiple ways to safeguard your data:

## 1. **In-App Backup (Recommended)**

### Create a Backup
1. Click the **"📥 Backup Data"** button in the control panel (top left)
2. A JSON file will download with all your routes and markers
3. Save this file in a safe location (cloud storage, external drive, etc.)

### Restore from Backup
1. Click the **"📤 Restore Data"** button
2. Select your backup JSON file
3. Your data will be imported (added to existing data)

**Tip:** Create backups regularly, especially before making major changes!

## 2. **Command Line Backup**

Run this command from the `backend` directory:
```bash
npm run backup
```

This creates a timestamped backup file in the `backups/` directory:
- `trip-tracker-backup-YYYY-MM-DD-HH-MM-SS.json`
- `latest-backup.json` (always the most recent)

## 3. **MongoDB Atlas Backups** (If using MongoDB Atlas)

If you're using MongoDB Atlas:
1. Go to your Atlas cluster
2. Navigate to **Backups** in the left sidebar
3. Enable **Cloud Backup** (automatic daily backups)
4. You can restore from any point in time

## 4. **Manual MongoDB Export**

Export directly from MongoDB:
```bash
mongodump --uri="your_mongodb_uri" --out=./backup
```

Restore:
```bash
mongorestore --uri="your_mongodb_uri" ./backup
```

## 5. **Best Practices**

✅ **Regular Backups**
- Weekly backups for active use
- Before major trips or route planning sessions
- After adding many routes/markers

✅ **Multiple Locations**
- Local computer
- Cloud storage (Google Drive, Dropbox, OneDrive)
- External hard drive
- Email to yourself

✅ **Version Your Backups**
- Keep multiple backup files with dates
- Don't overwrite old backups immediately

✅ **Test Your Backups**
- Periodically restore a backup to verify it works
- Better to discover issues before you need it!

## Backup File Format

Backup files are JSON and contain:
- Export date and version
- All routes (with coordinates, distances, colors, etc.)
- All markers (with positions, names, sizes, etc.)
- Timestamps for when items were created/updated

## Restore Process

When restoring:
- Data is **added** to your existing database (not replaced)
- If you want to replace everything, clear your database first
- Duplicate routes/markers may be created if restoring the same backup twice

## Emergency Recovery

If you lose your database:
1. Use your most recent backup file
2. Use the "Restore Data" button in the app
3. Or use the MongoDB restore commands above

## Questions?

If you need help with backups or data recovery, check:
- Your backup files in the `backups/` directory
- MongoDB Atlas backup snapshots (if using Atlas)
- Your cloud storage for downloaded backup files
