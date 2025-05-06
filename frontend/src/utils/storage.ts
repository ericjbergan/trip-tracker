import { SavedRoute, SavedMarker } from '../types/map';

// Storage keys
const ROUTES_KEY = 'saved_routes';
const MARKERS_KEY = 'saved_markers';

// Types
export interface SavedRoute {
  start: google.maps.LatLngLiteral;
  end: google.maps.LatLngLiteral;
  waypoints: google.maps.LatLngLiteral[];
  overviewPath: google.maps.LatLngLiteral[];
  distance: string;
  duration: string;
  color: string;
}

// Route functions
export const getRoutes = (): SavedRoute[] => {
  const routes = localStorage.getItem(ROUTES_KEY);
  return routes ? JSON.parse(routes) : [];
};

export const saveRoute = (route: SavedRoute): void => {
  const routes = getRoutes();
  routes.push(route);
  localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
};

export const deleteRoute = (id: string): void => {
  const routes = getRoutes();
  const index = routes.findIndex(route => route._id === id);
  if (index !== -1) {
    routes.splice(index, 1);
    localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
  }
};

export const updateRoute = (id: string, route: SavedRoute): void => {
  const routes = getRoutes();
  const index = routes.findIndex(r => r._id === id);
  if (index !== -1) {
    routes[index] = route;
    localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
  }
};

// Marker functions
export const getMarkers = (): SavedMarker[] => {
  const markers = localStorage.getItem(MARKERS_KEY);
  return markers ? JSON.parse(markers) : [];
};

export const saveMarker = (marker: SavedMarker): void => {
  const markers = getMarkers();
  markers.push(marker);
  localStorage.setItem(MARKERS_KEY, JSON.stringify(markers));
};

export const deleteMarker = (id: string): void => {
  const markers = getMarkers();
  const index = markers.findIndex(marker => marker._id === id);
  if (index !== -1) {
    markers.splice(index, 1);
    localStorage.setItem(MARKERS_KEY, JSON.stringify(markers));
  }
};

// Export all data
export const exportData = (): void => {
  const data = {
    routes: getRoutes(),
    markers: getMarkers()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'map-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import data
export const importData = (data: { routes: SavedRoute[], markers: google.maps.LatLngLiteral[] }) => {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(data.routes));
  localStorage.setItem(MARKERS_KEY, JSON.stringify(data.markers));
}; 