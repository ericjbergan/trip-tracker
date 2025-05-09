# Trip Tracker

A full-stack application for tracking travel routes and locations with an interactive map interface.

## Features

- Interactive map with Google Maps integration
- Route tracking and visualization
  - Create routes between points
  - Add waypoints
  - Color-coded routes
  - Save and manage routes
- Place markers and road overlays
  - Add custom markers
  - Markers persist between sessions
- Location tracking
  - Follow current location
  - Record travel paths
- MongoDB integration for data persistence

## Tech Stack

### Frontend
- React with TypeScript
- Google Maps API
- Tailwind CSS

### Backend
- Node.js with Express
- TypeScript
- MongoDB with Mongoose

## Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account
- Google Maps API key (Maps JavaScript API, Places API, Directions API)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. Configure environment variables:
   - Backend (.env):
     ```
     MONGODB_URI=your_mongodb_uri
     PORT=3000
     NODE_ENV=development
     ```
   - Frontend (.env):
     ```
     VITE_API_URL=http://localhost:3000/api
     VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
     ```

4. Start development servers:
   ```bash
   # Backend
   cd backend
   npm run dev

   # Frontend
   cd frontend
   npm run dev
   ```

## License
MIT License 