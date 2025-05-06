import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const mapApi = {
  // Routes
  getRoutes: () => api.get('/map/routes'),
  saveRoute: (route: any) => api.post('/map/routes', route),
  updateRoute: (id: string, route: any) => api.put(`/map/routes/${id}`, route),
  deleteRoute: (id: string) => api.delete(`/map/routes/${id}`),

  // Markers
  getMarkers: () => api.get('/map/markers'),
  saveMarker: (marker: any) => api.post('/map/markers', marker),
  deleteMarker: (id: string) => api.delete(`/map/markers/${id}`),
}; 