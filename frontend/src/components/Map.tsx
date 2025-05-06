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

const Map: React.FC<MapProps> = ({ 
  initialCenter = { lat: 40.0964, lng: -82.2618 },
  initialZoom = 12
}) => {
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
  const [routePoints, setRoutePoints] = useState<{
    start: google.maps.LatLngLiteral | null;
    waypoints: google.maps.LatLngLiteral[];
  }>({
    start: null,
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

  // Handle map center changes from panning/zooming
  const handleMapCenterChanged = () => {
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      if (center) {
        const newCenter = {
          lat: center.lat(),
          lng: center.lng()
        };

        // Only update if the center has actually changed
        if (mapCenter.lat !== newCenter.lat || mapCenter.lng !== newCenter.lng) {
          // Clear any existing timer
          if (centerUpdateTimer.current) {
            clearTimeout(centerUpdateTimer.current);
          }

          // Set a new timer to update the center
          centerUpdateTimer.current = setTimeout(() => {
            setMapCenter(newCenter);
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

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) {
      setShowDeleteButton(false);
      setSelectedRoute(null);
      setShowColorPalette(false);
      return;
    }
    
    if (isAddingPin) {
      const newMarker = {
        _id: Date.now().toString(),
        position: {
          lat: e.latLng.lat(),
          lng: e.latLng.lng()
        }
      };
      setMarkers(prev => [...prev, newMarker]);
      setIsAddingPin(false);
    }
    
    setShowDeleteButton(false);
    setSelectedRoute(null);
    setShowColorPalette(false);
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
  const updateRouteState = useCallback(async (routeStep: 'start' | 'waypoint' | 'end', startLocation: google.maps.LatLngLiteral | null) => {
    try {
      const response = await fetch('http://localhost:3000/api/map/route-state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ routeStep, startLocation }),
      });
      if (!response.ok) throw new Error('Failed to update route state');
      return await response.json();
    } catch (error) {
      console.error('Error updating route state:', error);
      return null;
    }
  }, []);

  // Modify startNewRoute to use MongoDB state
  const startNewRoute = async () => {
    if (isAddingRoute) {
      // Cancel route creation
      console.log('Canceling route creation, resetting all route state');
      setIsAddingRoute(false);
      setDirections(null);
      setSearchQuery('');
      setRouteError(null);
      setRouteSuccess(null);
      await updateRouteState('waypoint', null);
    } else {
      // Start new route
      console.log('Starting new route, initializing route state');
      setIsAddingRoute(true);
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
  };

  // Modify handlePlaceSelection to update local state for UI
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

    // Get current route state
    const state = await fetchRouteState();
    if (!state) {
      console.error('Failed to fetch route state');
      return;
    }

    if (state.routeStep === 'start') {
      console.log('Setting start location');
      await updateRouteState('waypoint', location);
      // Update local state for UI
      setRoutePoints(prev => ({
        ...prev,
        start: location
      }));
      setMapCenter(location);
    } else if (state.routeStep === 'waypoint') {
      console.log('Adding waypoint');
      // Add waypoint logic here
      setRoutePoints(prev => ({
        ...prev,
        waypoints: [...prev.waypoints, location]
      }));
    }

    setSearchQuery('');
    
    // Update map center state and stop following location
    setMapCenter(location);
    setIsFollowingLocation(false);
    
    // Center map on selected location
    if (mapRef.current) {
      mapRef.current.panTo(location);
      mapRef.current.setZoom(14);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        handlePlaceSelection(place);
      }
    }
  };

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

  const cancelDelete = () => {
    console.log('Canceling deletion');
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  };

  const handleColorChange = (color: string) => {
    if (!selectedRoute) {
      console.log('No route selected');
      return;
    }

    console.log('Changing route color:', {
      from: selectedRoute.color,
      to: color,
      routeStart: selectedRoute.start,
      routeEnd: selectedRoute.end
    });
    
    // Find the exact route in savedRoutes
    const routeIndex = savedRoutes.findIndex(route => 
      route.start.lat === selectedRoute.start.lat &&
      route.start.lng === selectedRoute.start.lng &&
      route.end.lat === selectedRoute.end.lat &&
      route.end.lng === selectedRoute.end.lng
    );

    if (routeIndex === -1) {
      console.error('Could not find route to update');
      return;
    }

    // Create a new array without the route
    const routesWithoutTarget = savedRoutes.filter((_, i) => i !== routeIndex);
    
    // Create the updated route with new color
    const updatedRoute = {
      ...savedRoutes[routeIndex],
      color: color
    };

    // First remove the route
    setSavedRoutes(routesWithoutTarget);
    
    // Then add it back with the new color
    setTimeout(() => {
      const newRoutes = [...routesWithoutTarget];
      newRoutes.splice(routeIndex, 0, updatedRoute);
      setSavedRoutes(newRoutes);
      console.log('Route color updated:', {
        index: routeIndex,
        newColor: color,
        totalRoutes: newRoutes.length,
        uniqueColors: [...new Set(newRoutes.map(r => r.color))]
      });
    }, 50);
    
    // Clear the selected route and directions
    setSelectedRoute(null);
    setDirections(null);
    
    // Hide color palette
    setShowColorPalette(false);
  };

  const handleRouteSelect = (route: SavedRoute) => {
    if (!route._id) {
      console.error('Route missing _id:', route);
      return;
    }
    setSelectedRoute(route);
    setDirections(null);
    setRoutePoints({
      start: route.start,
      waypoints: route.waypoints
    });
    setPath(route.overviewPath);
    setShowDeleteButton(true);
  };

  const handleRouteColorChange = async (color: string) => {
    if (!selectedRoute || !selectedRoute._id) {
      console.error('Selected route missing _id:', selectedRoute);
      return;
    }

    try {
      console.log('Changing route color:', {
        routeId: selectedRoute._id,
        from: selectedRoute.color,
        to: color
      });

      const updatedRoute: SavedRoute = {
        ...selectedRoute,
        color
      };

      // Update local state immediately for better UX
      setSavedRoutes(prev => prev.map(route => 
        route._id === selectedRoute._id ? updatedRoute : route
      ));
      setSelectedRoute(updatedRoute);

      // Then update in backend
      const response = await mapApi.updateRoute(selectedRoute._id, updatedRoute);
      
      // Update with the response from the server to ensure consistency
      if (response.data) {
        setSavedRoutes(prev => prev.map(route => 
          route._id === selectedRoute._id ? response.data : route
        ));
        setSelectedRoute(response.data);
      }
      
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

  // Load routes and markers from API
  useEffect(() => {
    const loadData = async () => {
      try {
        const [routesResponse, markersResponse] = await Promise.all([
          mapApi.getRoutes(),
          mapApi.getMarkers()
        ]);
        
        setSavedRoutes(routesResponse.data);
        setMarkers(markersResponse.data.map((m: any) => ({
          _id: m._id,
          position: m.position
        })));
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, []);

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
        color: '#0000FF'
      };

      try {
        const response = await mapApi.saveRoute(routeData);
        console.log('Route saved successfully:', response.data._id);
        setRouteSuccess('Route saved successfully!');
        
        // Reset state
        setIsAddingRoute(false);
        setRoutePoints({
          start: null,
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

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading maps...</div>;

  return (
    <div className="relative w-full h-full">
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
                onKeyPress={handleKeyPress}
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
                  onClick={startNewRoute}
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
        zoom={initialZoom}
        onClick={handleMapClick}
        onLoad={map => {
          mapRef.current = map;
        }}
        onCenterChanged={handleMapCenterChanged}
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
            onClick={() => setIsAddingPin(!isAddingPin)}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              isAddingPin ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            } text-white text-sm`}
          >
            {isAddingPin ? 'Remove Pin' : 'Add Pin'}
          </button>
          
          <button
            onClick={startNewRoute}
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