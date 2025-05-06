# Trip Tracker

A full-stack application for tracking travel routes, visited locations, and personal travel history.

## Features

- Interactive map interface with location-based search
- Custom route tracking and visualization
  - Create routes between any two points
  - Add multiple waypoints to routes
  - Color-coded routes for different users or purposes
  - Save and manage multiple routes
  - Delete routes with confirmation
  - View distance and duration for routes
- Place markers and road overlays
  - Add custom markers to the map
  - Markers persist between sessions
  - Delete markers with confirmation
- Location tracking
  - Follow your current location
  - Record your travel path
  - View distance and duration for routes
- MongoDB integration for data persistence
  - Routes and markers stored in MongoDB
  - Real-time data synchronization
  - Automatic route state management

## Project Status

### Current Status
- Frontend: ✅ Core Features Complete
- Backend: ✅ Core Features Complete
- Database: ✅ MongoDB Integration Complete
- AWS Integration: ⏳ Pending Setup
- Development Environment: ✅ Local Setup Complete

## Technical Stack

### Frontend
- React with TypeScript
- Vite for build tooling
- Google Maps API for map visualization
- Tailwind CSS for styling
- React Query for data fetching

### Backend
- Node.js with Express
- TypeScript
- MongoDB for database
- Mongoose for data modeling
- RESTful API architecture

### Infrastructure
- MongoDB Atlas for database
- Local development environment
- AWS Integration (planned)

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Atlas account
- Google Maps API key with the following APIs enabled:
  - Maps JavaScript API
  - Places API
  - Directions API

### Development Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   - Backend: Create `.env` file in `backend` directory
   - Frontend: Create `.env` file in `frontend` directory

4. Start development servers:
   ```bash
   # Start backend server
   cd backend
   npm run dev

   # Start frontend server
   cd frontend
   npm run dev
   ```

## Environment Variables

### Backend (.env)
```
MONGODB_URI=your_mongodb_uri
PORT=3000
NODE_ENV=development
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3000/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Features in Detail

### Map Interface
- Interactive Google Maps integration
- Search for locations using Google Places API
- Follow current location
- Record travel paths
- Add custom markers
- Create and save routes between locations

### Route Management
- Create routes between any two points
- Add multiple waypoints to routes
- Choose from 5 distinct colors for route visualization
- Save routes for future reference
- Delete routes with confirmation
- View route distance and estimated duration
- Routes persist in MongoDB

### Marker Management
- Add custom markers to the map
- Markers persist in MongoDB
- Delete markers with confirmation
- View marker details

### Location Tracking
- Real-time location tracking
- Path recording functionality
- Distance and duration calculations
- Follow mode for current location

## License
This project is licensed under the MIT License. 