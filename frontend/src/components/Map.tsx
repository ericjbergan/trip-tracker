import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useLoadScript, Marker, Polyline, Autocomplete, DirectionsRenderer, OverlayView } from '@react-google-maps/api';
import { getRoutes, saveRoute, deleteRoute, updateRoute, getMarkers, saveMarker, deleteMarker, exportData } from '../utils/storage';
import { SavedRoute, SavedMarker } from '../types/map';
import { mapApi } from '../services/api';

const libraries: ("places" | "drawing" | "geometry" | "visualization")[] = ['places', 'geometry'];

interface MapProps {
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
}

interface DeleteItem {
  type: 'marker' | 'route';
  id: string;
}

const ROUTE_COLORS = [
  { name: 'Blue', value: '#0000FF' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Purple', value: '#800080' },
  { name: 'Orange', value: '#FFA500' }
];

// Helper function to find index
const findIndex = <T extends { _id: string }>(item: T, array: T[]): number => {
  return array.findIndex(element => element._id === item._id);
};

interface RoutePoints {
  start: google.maps.LatLngLiteral | null;
  end: google.maps.LatLngLiteral | null;
  waypoints: google.maps.LatLngLiteral[];
}

interface Route {
  start: google.maps.LatLngLiteral;
  end: google.maps.LatLngLiteral;
  waypoints: google.maps.LatLngLiteral[];
  overviewPath: google.maps.LatLngLiteral[];
  distance: string;
  duration: string;
  color: string;
}

const Map: React.FC<MapProps> = ({ 
  initialCenter = { lat: 40.0964, lng: -82.2618 },
  initialZoom = 12
}) => {
  // Add a key state for forcing re-renders
  const [renderKey, setRenderKey] = useState(0);

  // Map state
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(() => {
    const savedCenter = localStorage.getItem('mapCenter');
    if (savedCenter) {
      try {
        return JSON.parse(savedCenter);
      } catch (e) {
        console.error('Error parsing saved center:', e);
        return initialCenter;
      }
    }
    return initialCenter;
  });

  const [mapZoom, setMapZoom] = useState<number>(() => {
    const savedZoom = localStorage.getItem('mapZoom');
    if (savedZoom) {
      try {
        return parseInt(savedZoom, 10);
      } catch (e) {
        console.error('Error parsing saved zoom:', e);
        return initialZoom;
      }
    }
    return initialZoom;
  });

  // Route state
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSuccess, setRouteSuccess] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [selectedColor, setSelectedColor] = useState(ROUTE_COLORS[0].value);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [routeUpdateTrigger, setRouteUpdateTrigger] = useState(0);
  const [lastColorChange, setLastColorChange] = useState<number>(0);
  const [routePoints, setRoutePoints] = useState<RoutePoints>({
    start: null,
    end: null,
    waypoints: []
  });

  // Marker state
  const [markers, setMarkers] = useState<SavedMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<SavedMarker | null>(null);
  const [isAddingPin, setIsAddingPin] = useState(false);

  // Location tracking state
  const [isRecording, setIsRecording] = useState(false);
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [isFollowingLocation, setIsFollowingLocation] = useState(false);
  const [hasInitializedLocation, setHasInitializedLocation] = useState(() => {
    return localStorage.getItem('hasInitializedLocation') === 'true';
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.PlaceResult | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DeleteItem | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);

  // Refs
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const polylineRefs = useRef<{[key: string]: google.maps.Polyline}>({});
  const centerUpdateTimer = useRef<number | null>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  // Update the useEffect for route changes
  useEffect(() => {
    localStorage.setItem('savedMarkers', JSON.stringify(markers));
  }, [markers]);

  useEffect(() => {
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
  }, [savedRoutes]);

  // Save initialization state
  useEffect(() => {
    if (hasInitializedLocation) {
      localStorage.setItem('hasInitializedLocation', 'true');
    }
  }, [hasInitializedLocation]);

  // Handle map center and zoom changes
  const handleMapCenterChanged = () => {
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      
      if (center && zoom) {
        const newCenter = {
          lat: center.lat(),
          lng: center.lng()
        };

        // Only update if the center or zoom has actually changed
        if (mapCenter.lat !== newCenter.lat || 
            mapCenter.lng !== newCenter.lng || 
            mapZoom !== zoom) {
          // Clear any existing timer
          if (centerUpdateTimer.current) {
            clearTimeout(centerUpdateTimer.current);
          }

          // Set a new timer to update the state
          centerUpdateTimer.current = setTimeout(() => {
            setMapCenter(newCenter);
            setMapZoom(zoom);
            localStorage.setItem('mapCenter', JSON.stringify(newCenter));
            localStorage.setItem('mapZoom', zoom.toString());
          }, 100); // 100ms debounce
        }
      }
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (centerUpdateTimer.current) {
        clearTimeout(centerUpdateTimer.current);
      }
    };
  }, []);

  // Separate effect for location tracking
  useEffect(() => {
    if (!isLoaded) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setCurrentLocation(newLocation);
        
        if (isRecording) {
          setPath(prev => [...prev, newLocation]);
        }

        // Only update map center if explicitly following location
        if (isFollowingLocation) {
          setMapCenter(newLocation);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        if (isFollowingLocation) {
          let errorMessage = 'Unable to get your location. ';
          switch (error.code) {
            case error.TIMEOUT:
              errorMessage += 'Location request timed out. Please check your GPS signal and try again.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'Location information is unavailable. Please check your device settings.';
              break;
            case error.PERMISSION_DENIED:
              errorMessage += 'Location permission denied. Please enable location services in your browser settings.';
              break;
            default:
              errorMessage += 'An unknown error occurred. Please try again.';
          }
          setRouteError(errorMessage);
          setIsFollowingLocation(false);
        }
      },
      {
        enableHighAccuracy: false, // Changed to false to be less strict
        timeout: 30000, // Increased timeout to 30 seconds
        maximumAge: 60000 // Allow using cached position up to 1 minute old
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isLoaded, isRecording, isFollowingLocation]);

  useEffect(() => {
    if (isLoaded && window.google) {
      console.log('Initializing DirectionsService');
      directionsService.current = new window.google.maps.DirectionsService();
    }
  }, [isLoaded]);

  // Add useEffect to focus search input when adding route or pin
  useEffect(() => {
    if ((isAddingRoute || isAddingPin) && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isAddingRoute, isAddingPin]);

  // Update the useEffect for directions state changes
  useEffect(() => {
    if (directions) {
      console.log('Directions state changed:', {
        routes: directions.routes?.length,
        legs: directions.routes?.[0]?.legs?.length
      });
    }
  }, [directions]);

  const handleMapClick = async (e: google.maps.MapMouseEvent) => {
    if (!isAddingRoute || !e.latLng) return;

    const latLngLiteral = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };

    if (!routePoints.start) {
      setRoutePoints({ ...routePoints, start: latLngLiteral, end: null });
      setShowColorPalette(true);
    } else if (!routePoints.end) {
      // Get the current route state including the saved color
      const state = await fetchRouteState();
      if (!state) {
        console.error('Failed to fetch route state');
        return;
      }

      // Use the saved color from the route state
      const routeColor = state.color || selectedColor;
      console.log('Using route color:', routeColor);

      setRoutePoints({ ...routePoints, end: latLngLiteral });
      try {
        const result = await directionsService.current?.route({
          origin: routePoints.start,
          destination: latLngLiteral,
          travelMode: google.maps.TravelMode.DRIVING,
        });

        if (result?.routes?.[0]) {
          const newRoute: Route = {
            start: routePoints.start,
            end: latLngLiteral,
            waypoints: [],
            overviewPath: result.routes[0].overview_path.map((point: google.maps.LatLng) => ({
              lat: point.lat(),
              lng: point.lng(),
            })),
            distance: result.routes[0].legs[0].distance?.text || '',
            duration: result.routes[0].legs[0].duration?.text || '',
            color: routeColor // Use the color from route state
          };

          try {
            console.log('Saving route with color:', newRoute.color);
            const response = await mapApi.saveRoute(newRoute);
            
            if (response.data) {
              console.log('Route saved with color:', response.data.color);
              setSavedRoutes([...savedRoutes, response.data]);
              setRouteSuccess('Route saved successfully!');
              setTimeout(() => setRouteSuccess(null), 3000);
            } else {
              throw new Error('Failed to save route');
            }
          } catch (error) {
            console.error('Error saving route:', error);
            setRouteError('Failed to save route. Please try again.');
            setTimeout(() => setRouteError(null), 3000);
          }
        }
      } catch (error) {
        console.error('Error calculating route:', error);
        setRouteError('Failed to calculate route. Please try again.');
        setTimeout(() => setRouteError(null), 3000);
      }
      setRoutePoints({ start: null, end: null, waypoints: [] });
      setIsAddingRoute(false);
      setShowColorPalette(false);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      setPath([]); // Clear previous path when starting new recording
    }
    setIsRecording(!isRecording);
  };

  // Add function to fetch route state
  const fetchRouteState = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3000/api/map/route-state');
      if (!response.ok) throw new Error('Failed to fetch route state');
      const state = await response.json();
      return state;
    } catch (error) {
      console.error('Error fetching route state:', error);
      return null;
    }
  }, []);

  // Add function to update route state
  const updateRouteState = useCallback(async (routeStep: 'start' | 'waypoint' | 'end' | 'color', data: google.maps.LatLngLiteral | string | null) => {
    try {
      const response = await fetch('http://localhost:3000/api/map/route-state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          routeStep, 
          ...(typeof data === 'string' ? { color: data } : { startLocation: data })
        }),
      });
      if (!response.ok) throw new Error('Failed to update route state');
      return await response.json();
    } catch (error) {
      console.error('Error updating route state:', error);
      return null;
    }
  }, []);

  // Load routes and markers from API
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Fetching fresh data from database...');
        const [routesResponse, markersResponse] = await Promise.all([
          mapApi.getRoutes(),
          mapApi.getMarkers()
        ]);
        
        // Ensure routes have their colors preserved
        const routesWithColors = routesResponse.data.map((route: any) => ({
          ...route,
          color: route.color || '#0000FF' // Default to blue if no color is set
        }));
        
        setSavedRoutes(routesWithColors);
        setMarkers(markersResponse.data.map((m: any) => ({
          _id: m._id,
          position: m.position
        })));
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, [renderKey]);

  // Remove duplicate route handling functions and consolidate into a single approach
  const saveRoute = async (route: SavedRoute) => {
    try {
      // Remove _id if it exists to let MongoDB generate it
      const { _id, ...routeData } = route;
      
      // Check if a similar route already exists
      const isDuplicate = savedRoutes.some(existingRoute => 
        Math.abs(existingRoute.start.lat - routeData.start.lat) < 0.000001 &&
        Math.abs(existingRoute.start.lng - routeData.start.lng) < 0.000001 &&
        Math.abs(existingRoute.end.lat - routeData.end.lat) < 0.000001 &&
        Math.abs(existingRoute.end.lng - routeData.end.lng) < 0.000001
      );

      if (isDuplicate) {
        console.log('Duplicate route detected, not saving');
        setRouteError('A similar route already exists');
        setTimeout(() => setRouteError(null), 3000);
        return;
      }

      const response = await mapApi.saveRoute(routeData);
      setSavedRoutes(prev => [...prev, response.data]);
      setRouteSuccess('Route saved successfully!');
      setTimeout(() => setRouteSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving route:', error);
      setRouteError('Error saving route');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  // Delete route from API
  const deleteRoute = async (id: string) => {
    try {
      await mapApi.deleteRoute(id);
      setSavedRoutes(prev => prev.filter(route => route._id !== id));
      setRouteSuccess('Route deleted successfully!');
      setTimeout(() => setRouteSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting route:', error);
      setRouteError('Error deleting route');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  // Save marker to API
  const saveMarker = async (position: google.maps.LatLngLiteral) => {
    try {
      const response = await mapApi.saveMarker({ position });
      setMarkers(prev => [...prev, {
        _id: response.data._id,
        position
      }]);
    } catch (error) {
      console.error('Error saving marker:', error);
    }
  };

  // Delete marker from API
  const deleteMarker = async (id: string) => {
    try {
      await mapApi.deleteMarker(id);
      setMarkers(prev => prev.filter(marker => marker._id !== id));
    } catch (error) {
      console.error('Error deleting marker:', error);
    }
  };

  // Add export function
  const handleExport = () => {
    const data = exportData();
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

  // Add a function to get the current route step
  const getCurrentRouteStep = useCallback(async () => {
    const state = await fetchRouteState();
    return state?.routeStep || 'waypoint';
  }, [fetchRouteState]);

  // Update the handleFinishRoute function
  const handleFinishRoute = async () => {
    try {
      const state = await fetchRouteState();
      if (!state) {
        console.error('Failed to fetch route state');
        return;
      }

      if (!state.startLocation) {
        setRouteError('Please set a start location first');
        return;
      }

      if (routePoints.waypoints.length === 0) {
        setRouteError('Please add at least one waypoint');
        return;
      }

      const lastWaypoint = routePoints.waypoints[routePoints.waypoints.length - 1];
      
      const routeConfig: google.maps.DirectionsRequest = {
        origin: state.startLocation,
        destination: lastWaypoint,
        waypoints: routePoints.waypoints.slice(0, -1).map(point => ({
          location: new google.maps.LatLng(point.lat, point.lng),
          stopover: true
        })),
        travelMode: google.maps.TravelMode.DRIVING
      };

      if (!directionsService.current) {
        console.error('DirectionsService not initialized');
        return;
      }

      const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsService.current?.route(routeConfig, (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      setDirections(result);

      // Use the color from route state or fallback to selected color
      const routeColor = state.color || selectedColor;

      const routeData = {
        start: state.startLocation,
        end: lastWaypoint,
        waypoints: routePoints.waypoints.slice(0, -1),
        overviewPath: result.routes[0].overview_path.map(point => ({
          lat: point.lat(),
          lng: point.lng()
        })),
        distance: result.routes[0].legs[0].distance?.text || '',
        duration: result.routes[0].legs[0].duration?.text || '',
        color: routeColor // Use the color from route state
      };

      try {
        const response = await mapApi.saveRoute(routeData);
        console.log('Route saved successfully:', response.data._id);
        setRouteSuccess('Route saved successfully!');
        
        // Reset state
        setIsAddingRoute(false);
        setRoutePoints({
          start: null,
          end: null,
          waypoints: []
        });
        await updateRouteState('waypoint', null);
        setSearchQuery('');
      } catch (error) {
        console.error('Error saving route:', error);
        setRouteError('Error saving route. Please try again.');
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      setRouteError('Error calculating route. Please try again.');
    }
  };

  // Update the JSX to handle async getCurrentRouteStep
  const [currentStep, setCurrentStep] = useState<'start' | 'waypoint' | 'end'>('waypoint');

  useEffect(() => {
    const updateStep = async () => {
      const step = await getCurrentRouteStep();
      setCurrentStep(step);
    };
    updateStep();
  }, [getCurrentRouteStep]);

  // Update handleColorSelect to be more explicit
  const handleColorSelect = async (color: string) => {
    console.log('Color selected:', color);
    setSelectedColor(color);
    
    // Save the selected color to MongoDB
    try {
      const response = await updateRouteState('color', color);
      console.log('Color saved to route state:', response);
      
      // Update local state
      setShowColorPalette(false);
      
      // If we have a selected route, update its color
      if (selectedRoute) {
        await handleRouteColorChange(color);
      }
    } catch (error) {
      console.error('Error saving color:', error);
      setRouteError('Failed to save color selection');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  // Update the handleAddWaypoint function
  const handleAddWaypoint = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng || !selectedRoute) return;
    
    const newWaypoint = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };
    
    setRoutePoints(prev => ({
      start: prev.start,
      end: prev.end,
      waypoints: [...prev.waypoints, newWaypoint]
    }));
  };

  // Update the button click handlers
  const handleAddPin = async () => {
    setIsAddingPin(!isAddingPin);
    setRenderKey(prev => prev + 1); // Force re-render and data refetch
  };

  const handleStartNewRoute = async () => {
    if (isAddingRoute) {
      // Cancel route creation
      console.log('Canceling route creation, resetting all route state');
      setIsAddingRoute(false);
      setDirections(null);
      setSearchQuery('');
      setRouteError(null);
      setRouteSuccess(null);
      setShowColorPalette(false);
      await updateRouteState('waypoint', null);
    } else {
      // Start new route
      console.log('Starting new route, initializing route state');
      setIsAddingRoute(true);
      setShowColorPalette(true);
      
      // Fetch current route state to get saved color
      const state = await fetchRouteState();
      if (state?.color) {
        setSelectedColor(state.color);
      }
      
      await updateRouteState('start', null);
      setDirections(null);
      setRouteError(null);
      setRouteSuccess(null);
      setSearchQuery('');
      
      // Focus the search input after a short delay to ensure it's mounted
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 100);
    }
    setRenderKey(prev => prev + 1); // Force re-render and data refetch
  };

  // Add back the missing functions
  const handleRouteColorChange = async (color: string) => {
    if (!selectedRoute) {
      console.error('No route selected for color change');
      return;
    }

    try {
      console.log('Changing route color:', {
        routeId: selectedRoute._id,
        from: selectedRoute.color,
        to: color
      });

      // Update local state immediately for better UX
      const updatedRoute = {
        ...selectedRoute,
        color
      };
      setSavedRoutes(prev => prev.map(route => 
        route._id === selectedRoute._id ? updatedRoute : route
      ));
      setSelectedRoute(updatedRoute);

      // Then update in backend
      const response = await fetch(`http://localhost:3000/api/map/routes/${selectedRoute._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ color })
      });

      if (!response.ok) {
        throw new Error('Failed to update route color');
      }

      const updatedRouteData = await response.json();
      
      // Update with the response from the server to ensure consistency
      setSavedRoutes(prev => prev.map(route => 
        route._id === selectedRoute._id ? updatedRouteData : route
      ));
      setSelectedRoute(updatedRouteData);
      
      // Hide color palette
      setShowColorPalette(false);
    } catch (error) {
      console.error('Error updating route color:', error);
      setRouteError('Failed to update route color');
      
      // Revert local state on error
      setSavedRoutes(prev => prev.map(route => 
        route._id === selectedRoute._id ? selectedRoute : route
      ));
      setSelectedRoute(selectedRoute);
    }
  };

  // Add back the handlePlaceSelection function
  const handlePlaceSelection = async (place: google.maps.places.PlaceResult) => {
    if (!place.geometry?.location) {
      console.error('No location found for selected place');
      return;
    }

    const location = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    console.log('Selected place:', {
      name: place.name,
      location
    });

    if (isAddingPin) {
      try {
        const response = await mapApi.saveMarker({ position: location });
        setMarkers(prev => [...prev, response.data]);
        setRouteSuccess('Marker added successfully!');
        setTimeout(() => setRouteSuccess(null), 3000);
        setIsAddingPin(false);
        setSearchQuery(''); // Clear search field
      } catch (error) {
        console.error('Error saving marker:', error);
        setRouteError('Failed to save marker. Please try again.');
        setTimeout(() => setRouteError(null), 3000);
      }
    } else {
      // Get current route state
      const state = await fetchRouteState();
      if (!state) {
        console.error('Failed to fetch route state');
        return;
      }

      if (!state.startLocation) {
        console.log('Setting start location');
        setRoutePoints(prev => ({
          ...prev,
          start: location,
          end: null
        }));
        await updateRouteState('start', location);
        setSearchQuery(''); // Clear search field
      } else {
        console.log('Setting end location');
        setRoutePoints(prev => ({
          ...prev,
          end: location,
          waypoints: [...prev.waypoints, location]
        }));
        setSearchQuery(''); // Clear search field
        
        // Show the finish route button
        if (state.startLocation && location) {
          try {
            const result = await directionsService.current?.route({
              origin: state.startLocation,
              destination: location,
              travelMode: google.maps.TravelMode.DRIVING,
            });

            if (result?.routes?.[0]) {
              setDirections(result);
            }
          } catch (error) {
            console.error('Error calculating route:', error);
            setRouteError('Failed to calculate route. Please try again.');
            setTimeout(() => setRouteError(null), 3000);
          }
        }
      }
    }

    // Update map center state and stop following location
    setMapCenter(location);
    setIsFollowingLocation(false);
    
    // Center map on selected location
    if (mapRef.current) {
      mapRef.current.panTo(location);
      mapRef.current.setZoom(14);
    }
  };

  const handleMarkerClick = (marker: SavedMarker) => {
    setSelectedMarker(marker);
    setSelectedRoute(null);
  };

  const handleRouteClick = (route: SavedRoute, index: number) => {
    console.log('Route clicked:', route, 'at index:', index);
    setSelectedRoute(route);
    setShowColorPalette(true);
    setShowDeleteButton(true);
  };

  const handleDeleteClick = (type: 'marker' | 'route', id: string | undefined) => {
    if (!id) {
      console.error('No ID provided for deletion');
      return;
    }
    setItemToDelete({ type, id });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'marker') {
      const updatedMarkers = markers.filter(marker => marker._id !== itemToDelete.id);
      setMarkers(updatedMarkers);
      deleteMarker(itemToDelete.id);
    } else if (itemToDelete.type === 'route') {
      const updatedRoutes = savedRoutes.filter(route => route._id !== itemToDelete.id);
      setSavedRoutes(updatedRoutes);
      deleteRoute(itemToDelete.id);
      
      if (selectedRoute && selectedRoute._id === itemToDelete.id) {
        setDirections(null);
      }
    }

    setShowDeleteConfirm(false);
    setItemToDelete(null);
    setSelectedMarker(null);
    setSelectedRoute(null);
    setShowDeleteButton(false);
  };

  // Add back the onPlaceSelected function
  const onPlaceSelected = () => {
    if (!autocompleteRef.current) {
      console.error('Autocomplete reference is not available');
      return;
    }

    const place = autocompleteRef.current.getPlace();
    if (place && place.geometry && place.geometry.location) {
      handlePlaceSelection(place);
    }
  };

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading maps...</div>;

  return (
    <div className="relative w-full h-full" key={renderKey}>
      {/* Search Input */}
      {(isAddingRoute || isAddingPin) && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-white p-4 rounded-lg shadow-lg w-96">
          <div className="flex flex-col space-y-2">
            <div className="text-sm font-medium text-gray-700">
              {isAddingRoute ? (
                currentStep === 'start' ? 'Select start location' :
                currentStep === 'waypoint' ? 'Add waypoint' :
                'Select end location'
              ) : 'Select location for pin'}
            </div>
            <Autocomplete
              onLoad={autocomplete => {
                autocompleteRef.current = autocomplete;
              }}
              onPlaceChanged={onPlaceSelected}
            >
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for a location..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Autocomplete>
            {routeError && (
              <div className="text-red-500 text-sm">{routeError}</div>
            )}
            {routeSuccess && (
              <div className="text-green-500 text-sm">{routeSuccess}</div>
            )}
            {isAddingRoute && (
              <div className="flex justify-between mt-2">
                <button
                  onClick={handleStartNewRoute}
                  className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                >
                  Cancel Route
                </button>
                {routePoints.start && (
                  <button
                    onClick={handleFinishRoute}
                    className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                  >
                    Finish Route
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <GoogleMap
        mapContainerClassName="w-full h-full"
        center={mapCenter}
        zoom={mapZoom}
        onClick={handleMapClick}
        onLoad={map => {
          mapRef.current = map;
        }}
        onCenterChanged={handleMapCenterChanged}
        onZoomChanged={handleMapCenterChanged}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false
        }}
      >
        {/* Current location marker */}
        {currentLocation && (
          <Marker
            position={currentLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }}
          />
        )}

        {/* Recorded path */}
        {path.length > 1 && (
          <Polyline
            path={path}
            options={{
              strokeColor: '#FF0000',
              strokeOpacity: 1,
              strokeWeight: 3
            }}
          />
        )}

        {/* Placed markers */}
        {markers.map((marker) => (
          <Marker
            key={marker._id}
            position={marker.position}
            onClick={() => handleMarkerClick(marker)}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#FF0000',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }}
          />
        ))}

        {/* Current route */}
        {directions && (
          <>
            <DirectionsRenderer 
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: selectedRoute ? '#FFD700' : selectedColor,
                  strokeWeight: 5,
                  strokeOpacity: selectedRoute ? 1 : 0.7,
                  clickable: true,
                  zIndex: selectedRoute ? 1 : 0
                }
              }}
            />
            <Polyline
              path={directions.routes[0].overview_path.map(latLng => ({
                lat: latLng.lat(),
                lng: latLng.lng()
              }))}
              options={{
                strokeColor: 'transparent',
                strokeWeight: 20,
                clickable: true
              }}
              onClick={() => {
                const currentRoute: SavedRoute = {
                  _id: Date.now().toString(),
                  start: routePoints.start!,
                  end: routePoints.waypoints[routePoints.waypoints.length - 1]!,
                  waypoints: routePoints.waypoints.slice(0, -1),
                  overviewPath: directions.routes[0].overview_path.map(latLng => ({
                    lat: latLng.lat(),
                    lng: latLng.lng()
                  })),
                  distance: directions.routes[0].legs[0].distance?.text || '',
                  duration: directions.routes[0].legs[0].duration?.text || '',
                  color: selectedColor
                };
                handleRouteClick(currentRoute, -1);
              }}
            />
          </>
        )}

        {/* Saved routes */}
        {savedRoutes.map((route, index) => (
          <Polyline
            key={`${index}-${route.color}`}
            path={route.overviewPath}
            options={{
              strokeColor: selectedRoute === route ? '#FFD700' : route.color,
              strokeWeight: 5,
              strokeOpacity: selectedRoute === route ? 1 : 0.7,
              clickable: true,
              zIndex: selectedRoute === route ? 1 : 0
            }}
            onClick={() => handleRouteClick(route, index)}
          />
        ))}

        {/* Selected marker info window */}
        {selectedMarker && (
          <OverlayView
            position={selectedMarker.position}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="bg-white p-2 rounded shadow-lg">
              <button
                onClick={() => handleDeleteClick('marker', selectedMarker._id)}
                className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
              >
                Delete
              </button>
            </div>
          </OverlayView>
        )}

        {/* Selected route color palette */}
        {selectedRoute && selectedRoute._id && (
          <OverlayView
            position={selectedRoute.start}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div 
              className="bg-white rounded shadow-lg p-3 space-y-3 min-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Change Color button clicked');
                    setShowColorPalette(!showColorPalette);
                  }}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  {showColorPalette ? 'Hide Colors' : 'Change Color'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedRoute._id) {
                      handleDeleteClick('route', selectedRoute._id);
                    }
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                >
                  Delete Route
                </button>
              </div>
              {showColorPalette && (
                <div className="border-t pt-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select Color</div>
                  <div className="grid grid-cols-1 gap-2">
                    {ROUTE_COLORS.map((color) => (
                      <button
                        key={color.value}
                        className={`flex items-center w-full px-3 py-2 rounded-lg border-2 transition-all hover:bg-gray-50 ${
                          selectedRoute.color === color.value 
                            ? 'border-black bg-gray-50' 
                            : 'border-transparent'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Color button clicked:', color.value);
                          handleRouteColorChange(color.value);
                        }}
                      >
                        <div 
                          className="w-6 h-6 rounded-full mr-3"
                          style={{ backgroundColor: color.value }}
                        />
                        <span className="text-sm text-gray-700">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </OverlayView>
        )}

        {isAddingRoute && showColorPalette && (
          <div className="absolute top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-10">
            <div className="flex flex-col space-y-2">
              <span className="text-sm font-medium text-gray-700">Select Route Color</span>
              <div className="grid grid-cols-5 gap-2">
                {ROUTE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => handleColorSelect(color.value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      selectedColor === color.value ? 'border-black scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </GoogleMap>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && itemToDelete && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-4 rounded shadow-lg z-50">
          <p>Are you sure you want to delete this {itemToDelete.type}?</p>
          <div className="flex justify-end mt-4 space-x-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white p-4 rounded-lg shadow-lg">
        <div className="space-y-2">
          <button
            onClick={() => {
              setIsFollowingLocation(!isFollowingLocation);
              if (!isFollowingLocation && currentLocation) {
                setMapCenter(currentLocation);
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              isFollowingLocation ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'
            } text-white text-sm`}
          >
            {isFollowingLocation ? 'Following Location' : 'Follow Location'}
          </button>
          
          <button
            onClick={toggleRecording}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            } text-white text-sm`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          
          <button
            onClick={handleAddPin}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              isAddingPin ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            } text-white text-sm`}
          >
            {isAddingPin ? 'Remove Pin' : 'Add Pin'}
          </button>
          
          <button
            onClick={handleStartNewRoute}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              isAddingRoute ? 'bg-red-500 hover:bg-red-600' : 'bg-yellow-500 hover:bg-yellow-600'
            } text-white text-sm`}
          >
            {isAddingRoute ? 'Cancel Route' : 'Start New Route'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Map;