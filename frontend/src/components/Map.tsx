import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useLoadScript, Polyline, Autocomplete, DirectionsRenderer, OverlayView } from '@react-google-maps/api';
import { SavedRoute, SavedMarker } from '../types/map';
import { mapApi } from '../services/api';

const libraries: ("places" | "drawing" | "geometry" | "visualization" | "marker")[] = ['places', 'geometry', 'marker'];

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

// Helper function to extract full path from DirectionsResult (handles waypoints correctly)
const extractFullPath = (directionsResult: google.maps.DirectionsResult): google.maps.LatLngLiteral[] => {
  const allPathPoints: google.maps.LatLngLiteral[] = [];
  directionsResult.routes[0].legs.forEach((leg: google.maps.DirectionsLeg) => {
    leg.steps.forEach((step: google.maps.DirectionsStep) => {
      step.path.forEach((point: google.maps.LatLng) => {
        allPathPoints.push({
          lat: point.lat(),
          lng: point.lng()
        });
      });
    });
  });
  return allPathPoints.length > 0 ? allPathPoints : directionsResult.routes[0].overview_path.map(point => ({
    lat: point.lat(),
    lng: point.lng()
  }));
};

// Helper function to calculate total distance and duration from all legs
const calculateRouteTotals = (directionsResult: google.maps.DirectionsResult) => {
  const totalDistance = directionsResult.routes[0].legs.reduce((sum: number, leg: google.maps.DirectionsLeg) => {
    return sum + (leg.distance?.value || 0);
  }, 0);
  const totalDuration = directionsResult.routes[0].legs.reduce((sum: number, leg: google.maps.DirectionsLeg) => {
    return sum + (leg.duration?.value || 0);
  }, 0);

  const distanceText = totalDistance > 0 
    ? `${(totalDistance / 1000).toFixed(1)} km` 
    : directionsResult.routes[0].legs[0].distance?.text || '';
  const durationText = totalDuration > 0
    ? `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m`
    : directionsResult.routes[0].legs[0].duration?.text || '';

  return { distanceText, durationText };
};

interface RoutePoints {
  start: google.maps.LatLngLiteral | null;
  end: google.maps.LatLngLiteral | null;
  waypoints: google.maps.LatLngLiteral[];
}

// AdvancedMarker component to replace deprecated Marker
interface AdvancedMarkerProps {
  position: google.maps.LatLngLiteral;
  map: google.maps.Map | null;
  onClick?: () => void;
  color?: string;
  scale?: number;
  label?: string;
}

const AdvancedMarker: React.FC<AdvancedMarkerProps> = ({ position, map, onClick, color = '#FF0000', scale = 8, label }) => {
  const markerRef = useRef<any>(null);
  const pinElementRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef<string | undefined>(label);

  // Separate effect for label updates - doesn't affect pin rendering
  useEffect(() => {
    // Only update label if it changed and marker exists
    if (markerRef.current && markerRef.current.map === map && labelRef.current !== label) {
      labelRef.current = label;
      
      // Find the container from the marker's content
      let container: HTMLElement | null = null;
      const markerContent = markerRef.current.content;
      if (markerContent && markerContent instanceof HTMLElement) {
        const wrapper = markerContent.firstElementChild as HTMLElement;
        if (wrapper) {
          container = wrapper.firstElementChild as HTMLElement;
        }
      }
      
      if (container) {
        // Remove existing label if present
        const existingLabel = container.querySelector('.marker-label');
        if (existingLabel) {
          existingLabel.remove();
        }
        
        // Add label if needed - PIN IS ALREADY THERE, just update label
        if (label && label.trim()) {
          const labelElement = document.createElement('div');
          labelElement.className = 'marker-label';
          labelElement.textContent = label;
          labelElement.style.marginLeft = '6px';
          labelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
          labelElement.style.padding = '4px 8px';
          labelElement.style.borderRadius = '4px';
          labelElement.style.fontSize = '12px';
          labelElement.style.fontWeight = '500';
          labelElement.style.color = '#333';
          labelElement.style.whiteSpace = 'nowrap';
          labelElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
          labelElement.style.border = '1px solid rgba(0,0,0,0.1)';
          labelElement.style.pointerEvents = 'none';
          labelElement.style.userSelect = 'none';
          labelElement.style.zIndex = '1000';
          container.appendChild(labelElement);
        }
      }
    }
  }, [label, map]);

  // Main effect for creating/updating the marker - PIN ALWAYS RENDERS
  useEffect(() => {
    if (!map || !google?.maps?.marker?.AdvancedMarkerElement) {
      // Fallback: if AdvancedMarkerElement is not available, silently fail
      // The old Marker would have worked, but we're migrating away from it
      return;
    }

    // If marker already exists and is on the same map, just update the label
    // PIN ALWAYS STAYS VISIBLE - only label changes
    if (markerRef.current && markerRef.current.map === map) {
      // Ensure marker is still on the map (safety check)
      if (!markerRef.current.map) {
        markerRef.current.map = map;
      }
      
      // Find the container from the marker's content
      let container: HTMLElement | null = null;
      
      const markerContent = markerRef.current.content;
      if (markerContent && markerContent instanceof HTMLElement) {
        // Structure: wrapper > container (inline-flex) > pinElement + labelElement
        const wrapper = markerContent.firstElementChild as HTMLElement;
        if (wrapper) {
          container = wrapper.firstElementChild as HTMLElement;
        }
      }
      
      if (container) {
        // Remove existing label if present
        const existingLabel = container.querySelector('.marker-label');
        if (existingLabel) {
          existingLabel.remove();
        }
        
        // Add label if needed - PIN IS ALREADY THERE, just update label
        if (label && label.trim()) {
          const labelElement = document.createElement('div');
          labelElement.className = 'marker-label';
          labelElement.textContent = label;
          labelElement.style.marginLeft = '6px';
          labelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
          labelElement.style.padding = '4px 8px';
          labelElement.style.borderRadius = '4px';
          labelElement.style.fontSize = '12px';
          labelElement.style.fontWeight = '500';
          labelElement.style.color = '#333';
          labelElement.style.whiteSpace = 'nowrap';
          labelElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
          labelElement.style.border = '1px solid rgba(0,0,0,0.1)';
          labelElement.style.pointerEvents = 'none';
          labelElement.style.userSelect = 'none';
          labelElement.style.zIndex = '1000';
          container.appendChild(labelElement);
        }
      }
      // Marker (pin) stays on map - only label was updated
      return;
    }

    // Only create new marker if it doesn't exist
    // Clean up existing marker first (shouldn't happen, but safety check)
    if (markerRef.current) {
      markerRef.current.map = null;
      markerRef.current = null;
      pinElementRef.current = null;
    }

    // Create container for pin and label
    // AdvancedMarkerElement centers content at position by default
    // To left-justify: pin at left edge of container, then offset container right by 50% width
    const pinSize = scale * 2;
    
    // Inner container with pin and label
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.cursor = 'pointer';
    container.style.pointerEvents = 'auto';

    // Create pin element at left edge of container - PIN ALWAYS RENDERS
    const pinElement = document.createElement('div');
    pinElement.style.width = `${pinSize}px`;
    pinElement.style.height = `${pinSize}px`;
    pinElement.style.borderRadius = '50%';
    pinElement.style.backgroundColor = color;
    pinElement.style.border = '2px solid #FFFFFF';
    pinElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    pinElement.style.flexShrink = '0';
    pinElementRef.current = pinElement;

    container.appendChild(pinElement);

    // Create label element if name is provided - LABEL IS CONDITIONAL
    // PIN IS ALWAYS CREATED ABOVE - label is optional
    if (label && label.trim()) {
      const labelElement = document.createElement('div');
      labelElement.className = 'marker-label';
      labelElement.textContent = label;
      labelElement.style.marginLeft = '6px';
      labelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
      labelElement.style.padding = '4px 8px';
      labelElement.style.borderRadius = '4px';
      labelElement.style.fontSize = '12px';
      labelElement.style.fontWeight = '500';
      labelElement.style.color = '#333';
      labelElement.style.whiteSpace = 'nowrap';
      labelElement.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
      labelElement.style.border = '1px solid rgba(0,0,0,0.1)';
      labelElement.style.pointerEvents = 'none';
      labelElement.style.userSelect = 'none';
      labelElement.style.zIndex = '1000';
      container.appendChild(labelElement);
    }

    // Wrapper to left-justify the container
    // AdvancedMarkerElement centers the wrapper, so we offset right by 50% of container width
    // This makes the left edge of the container (where pin is) align with the position
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.transform = 'translateX(50%)'; // Shift right by 50% of container width
    wrapper.appendChild(container);

    // Create the marker - PIN IS ALWAYS VISIBLE, label is optional
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map, // Marker is ALWAYS added to map - never removed due to label changes
      position,
      content: wrapper, // Contains pin (always) + label (conditional)
    });

    if (onClick) {
      marker.addListener('click', onClick);
    }

    markerRef.current = marker;
    labelRef.current = label; // Store initial label value

    // Cleanup: only remove marker when component unmounts or map/position changes
    // Label changes should NOT cause marker removal - handled in separate effect
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
      pinElementRef.current = null;
    };
  }, [map, position, onClick, color, scale]); // Removed 'label' from dependencies - label updates are handled in separate effect

  return null; // This component doesn't render anything
};

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
  const [routeDirections, setRouteDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [showRouteDirections, setShowRouteDirections] = useState(false);
  const [routePoints, setRoutePoints] = useState<RoutePoints>({
    start: null,
    end: null,
    waypoints: []
  });
  const [routePointNames, setRoutePointNames] = useState<{
    start?: string;
    waypoints: string[];
    end?: string;
  }>({
    waypoints: []
  });

  // Marker state
  const [markers, setMarkers] = useState<SavedMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<SavedMarker | null>(null);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [markerPlaceName, setMarkerPlaceName] = useState<string>('');
  const [isLoadingMarkerName, setIsLoadingMarkerName] = useState(false);
  const [selectedMarkerColor, setSelectedMarkerColor] = useState(ROUTE_COLORS[1].value); // Default to red
  const [showMarkerColorPalette, setShowMarkerColorPalette] = useState(false);
  const lastPlaceSelectionRef = useRef<string>('');
  const isProcessingWaypointRef = useRef<boolean>(false);
  const isProcessingPlaceSelectionRef = useRef<boolean>(false);

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
  const [showPinLabels, setShowPinLabels] = useState(true);

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

  // Don't save routes to localStorage - they're stored in the database
  // The overviewPath arrays are too large and cause QuotaExceededError
  // Routes are fetched from the database on component mount

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



  // Helper function to get place name from coordinates
  const getPlaceName = async (location: google.maps.LatLngLiteral): Promise<string> => {
    return new Promise((resolve) => {
      if (!google?.maps?.Geocoder) {
        resolve(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
        return;
      }
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          // Try to get a meaningful name - prefer formatted_address, then name, then types
          const address = results[0].formatted_address;
          const name = results[0].name;
          const types = results[0].types;
          
          // If it's a point of interest, use the name
          if (name && types && (types.includes('establishment') || types.includes('point_of_interest'))) {
            resolve(name);
          } else if (address) {
            resolve(address);
          } else if (name) {
            resolve(name);
          } else {
            resolve(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
          }
        } else {
          resolve(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
        }
      });
    });
  };

  // Helper functions for route creation
  const isDuplicateWaypoint = (location: google.maps.LatLngLiteral, waypoints: google.maps.LatLngLiteral[]): boolean => {
    return waypoints.some(wp => 
      Math.abs(wp.lat - location.lat) < 0.0001 && 
      Math.abs(wp.lng - location.lng) < 0.0001
    );
  };

  const buildWaypointsForDirections = (waypoints: google.maps.LatLngLiteral[]) => {
    // The last waypoint becomes the destination, all others are intermediate stops
    return waypoints.slice(0, -1).map(point => ({
      location: new google.maps.LatLng(point.lat, point.lng),
      stopover: true
    }));
  };

  const createDirectionsRequest = (
    start: google.maps.LatLngLiteral,
    waypoints: google.maps.LatLngLiteral[]
  ): google.maps.DirectionsRequest => {
    const destination = waypoints[waypoints.length - 1];
    const waypointsForRoute = buildWaypointsForDirections(waypoints);
    
    return {
      origin: start,
      destination: destination,
      waypoints: waypointsForRoute,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false // Don't optimize - follow exact order of waypoints
    };
  };

  // Helper function to recalculate route when points change
  const recalculateRoute = async (currentRoutePoints?: RoutePoints) => {
    const points = currentRoutePoints || routePoints;
    
    if (!points.start || !directionsService.current || points.waypoints.length === 0) {
      setDirections(null);
      return;
    }

    try {
      const routeConfig = createDirectionsRequest(points.start, points.waypoints);
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
    } catch (error) {
      console.error('Error recalculating route:', error);
      setDirections(null);
    }
  };

  const handleMapClick = async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;

    // If not adding a route, close any open popups
    if (!isAddingRoute) {
      if (selectedMarker) {
        setSelectedMarker(null);
        setMarkerPlaceName('');
        setIsLoadingMarkerName(false);
      }
      if (selectedRoute) {
        setSelectedRoute(null);
        setShowColorPalette(false);
        setShowDeleteButton(false);
        setShowRouteDirections(false);
        setRouteDirections(null);
      }
      return;
    }

    // Route creation logic
    const latLngLiteral = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };

    if (!routePoints.start) {
      // Set start point - use coordinates as name since we can't geocode
      // Preserve existing waypoints if any were clicked before setting start
      const placeName = `${latLngLiteral.lat.toFixed(4)}, ${latLngLiteral.lng.toFixed(4)}`;
      setRoutePoints(prev => ({ 
        ...prev, 
        start: latLngLiteral, 
        end: null, 
        waypoints: prev.waypoints // Keep existing waypoints!
      }));
      setRoutePointNames(prev => ({ 
        start: placeName, 
        waypoints: prev.waypoints, // Keep existing waypoint names!
        end: undefined 
      }));
      setShowColorPalette(true);
      await updateRouteState('start', latLngLiteral);
    } else {
      // Prevent duplicate processing
      if (isProcessingWaypointRef.current) {
        console.log('Already processing waypoint, skipping duplicate call');
        return;
      }
      
      // Add waypoint (end will be set when finishing the route)
      const placeName = `${latLngLiteral.lat.toFixed(4)}, ${latLngLiteral.lng.toFixed(4)}`;
      isProcessingWaypointRef.current = true;
      
      // Check for duplicates before updating state
      if (isDuplicateWaypoint(latLngLiteral, routePoints.waypoints)) {
        isProcessingWaypointRef.current = false;
        return;
      }
      
      // Update both waypoints and names together to keep them in sync
      setRoutePoints(prev => {
        const updated = {
          ...prev,
          waypoints: [...prev.waypoints, latLngLiteral]
        };
        // Recalculate route with the updated waypoints immediately
        setTimeout(() => {
          recalculateRoute(updated);
        }, 50);
        return updated;
      });
      
      setRoutePointNames(prev => ({
        ...prev,
        waypoints: [...prev.waypoints, placeName]
      }));
      
      await updateRouteState('waypoint', null);
      
      // Reset processing flag after a short delay
      setTimeout(() => {
        isProcessingWaypointRef.current = false;
      }, 200);
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
          position: m.position,
          name: m.name,
          isLarge: m.isLarge || false,
          color: m.color || '#FF0000', // Default to red if no color is set
          showLabel: m.showLabel // Keep undefined if not set, so it uses global toggle
        })));
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, []); // Only load data on mount, not when renderKey changes

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
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
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
      setRouteSuccess('Route deleted successfully!');
      setTimeout(() => setRouteSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting route:', error);
      setRouteError('Error deleting route');
      setTimeout(() => setRouteError(null), 3000);
      throw error; // Re-throw so confirmDelete knows it failed
    }
  };

  // Save marker to API
  const saveMarker = async (position: google.maps.LatLngLiteral, name?: string) => {
    try {
      const response = await mapApi.saveMarker({ position, name });
      setMarkers(prev => [...prev, {
        _id: response.data._id,
        position,
        name: response.data.name,
        isLarge: response.data.isLarge || false
      }]);
    } catch (error) {
      console.error('Error saving marker:', error);
    }
  };

  // Update marker size
  const toggleMarkerSize = async (id: string, currentIsLarge: boolean) => {
    try {
      const response = await mapApi.updateMarker(id, { isLarge: !currentIsLarge });
      
      // Update markers state
      setMarkers(prev => prev.map(marker => 
        marker._id === id 
          ? { ...marker, isLarge: response.data.isLarge }
          : marker
      ));
      
      // Update selected marker if it's the one being toggled
      if (selectedMarker && selectedMarker._id === id) {
        setSelectedMarker({ ...selectedMarker, isLarge: response.data.isLarge });
      }
      
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
    } catch (error) {
      console.error('Error updating marker size:', error);
      setRouteError('Failed to update marker size');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  // Update marker color
  const updateMarkerColor = async (id: string, color: string) => {
    try {
      const response = await mapApi.updateMarker(id, { color });
      
      // Update markers state
      setMarkers(prev => prev.map(marker => 
        marker._id === id 
          ? { ...marker, color: response.data.color }
          : marker
      ));
      
      // Update selected marker if it's the one being updated
      if (selectedMarker && selectedMarker._id === id) {
        setSelectedMarker({ ...selectedMarker, color: response.data.color });
      }
      
      setShowMarkerColorPalette(false);
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
    } catch (error) {
      console.error('Error updating marker color:', error);
      setRouteError('Failed to update marker color');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  // Delete marker from API
  const deleteMarker = async (id: string) => {
    try {
      await mapApi.deleteMarker(id);
      setMarkers(prev => prev.filter(marker => marker._id !== id));
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting marker:', error);
    }
  };

  // Backup/Export function - exports from database
  const handleBackup = async () => {
    try {
      setRouteError(null);
      const response = await mapApi.exportData();
      const data = response.data;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.href = url;
      a.download = `trip-tracker-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setRouteSuccess(`Backup created! Exported ${data.routes?.length || 0} routes and ${data.markers?.length || 0} markers.`);
      setTimeout(() => setRouteSuccess(null), 5000);
    } catch (error) {
      console.error('Error backing up data:', error);
      setRouteError('Failed to create backup. Please try again.');
      setTimeout(() => setRouteError(null), 5000);
    }
  };

  // Restore/Import function
  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        setRouteError(null);
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.routes || !data.markers) {
          setRouteError('Invalid backup file format.');
          setTimeout(() => setRouteError(null), 5000);
          return;
        }

        // Confirm before importing
        const confirmed = window.confirm(
          `This will import ${data.routes.length} routes and ${data.markers.length} markers.\n\n` +
          `Note: This will ADD to your existing data (not replace). Continue?`
        );

        if (!confirmed) return;

        const response = await mapApi.importData(data);
        setRouteSuccess(response.data.message || 'Data imported successfully!');
        setTimeout(() => setRouteSuccess(null), 5000);
        
        // Refresh the data
        setRenderKey(prev => prev + 1);
      } catch (error) {
        console.error('Error restoring data:', error);
        setRouteError('Failed to restore backup. Please check the file format.');
        setTimeout(() => setRouteError(null), 5000);
      }
    };
    input.click();
  };

  // Add a function to get the current route step
  const getCurrentRouteStep = useCallback(async () => {
    const state = await fetchRouteState();
    return state?.routeStep || 'waypoint';
  }, [fetchRouteState]);

  // Update the handleFinishRoute function
  const handleFinishRoute = async () => {
    try {
      // Check local state first (more reliable)
      if (!routePoints.start) {
        setRouteError('Please set a start location first');
        return;
      }

      // Need at least one waypoint (the last one becomes the destination)
      if (routePoints.waypoints.length === 0) {
        setRouteError('Please add at least one waypoint');
        return;
      }

      // Get server state for color, but use local state for route points
      const state = await fetchRouteState();
      if (!state) {
        console.error('Failed to fetch route state');
        return;
      }

      const routeConfig = createDirectionsRequest(routePoints.start, routePoints.waypoints);

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

      // Extract full path and calculate totals (handles waypoints correctly)
      const fullPath = extractFullPath(result);
      const { distanceText, durationText } = calculateRouteTotals(result);

      // Validate path data
      if (!fullPath || fullPath.length === 0) {
        setRouteError('Failed to generate route path. Please try again.');
        return;
      }

      // Ensure all path points are valid numbers
      const validPath = fullPath.filter(point => 
        point && 
        typeof point.lat === 'number' && 
        typeof point.lng === 'number' && 
        !isNaN(point.lat) && 
        !isNaN(point.lng) &&
        isFinite(point.lat) &&
        isFinite(point.lng)
      );

      if (validPath.length === 0) {
        setRouteError('Invalid route path data. Please try again.');
        return;
      }

      // The last waypoint becomes the destination
      const destination = routePoints.waypoints[routePoints.waypoints.length - 1];

      const routeData = {
        start: routePoints.start, // Use local state instead of server state
        end: destination,
        waypoints: routePoints.waypoints.slice(0, -1), // All waypoints except the last (which is the end)
        overviewPath: validPath,
        distance: distanceText,
        duration: durationText,
        color: routeColor // Use the color from route state
      };

      try {
        const response = await mapApi.saveRoute(routeData);
        setRouteSuccess('Route saved successfully!');
        
        // Reset state and clear route creation markers
        setIsAddingRoute(false);
        setRoutePoints({
          start: null,
          end: null,
          waypoints: []
        });
        setRoutePointNames({ waypoints: [] });
        setDirections(null); // Clear the route display
        await updateRouteState('waypoint', null);
        setSearchQuery('');
        setRouteError(null);
        setRouteSuccess(null);
        // Force re-render to update the map
        setRenderKey(prev => prev + 1);
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
    if (!isAddingPin) {
      // When starting to add a pin, reset color to default
      setSelectedMarkerColor(ROUTE_COLORS[1].value); // Red
    }
    setRenderKey(prev => prev + 1); // Force re-render and data refetch
  };

  const handleStartNewRoute = async () => {
    if (isAddingRoute) {
      // Cancel route creation
      console.log('Canceling route creation, resetting all route state');
      setIsAddingRoute(false);
      setDirections(null);
      setRoutePoints({ start: null, end: null, waypoints: [] });
      setRoutePointNames({ waypoints: [] });
      setSearchQuery('');
      setRouteError(null);
      setRouteSuccess(null);
      setShowColorPalette(false);
      await updateRouteState('waypoint', null);
    } else {
      // Start new route
      setIsAddingRoute(true);
      setShowColorPalette(true);
      setRoutePoints({ start: null, end: null, waypoints: [] });
      setRoutePointNames({ waypoints: [] });
      
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
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
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
      // Force re-render to update the map after backend update
      setRenderKey(prev => prev + 1);
      
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

  // Handle adding a marker from place selection
  // Main handler for place selection (from autocomplete)
  const handlePlaceSelection = useCallback(async (place: google.maps.places.PlaceResult) => {
    // Prevent duplicate processing
    if (isProcessingPlaceSelectionRef.current) {
      console.log('Already processing place selection, skipping duplicate call');
      return;
    }

    if (!place.geometry?.location) {
      console.error('No location found for selected place');
      return;
    }

    // Set processing flag immediately to prevent duplicate calls
    isProcessingPlaceSelectionRef.current = true;

    const location = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    const placeName = place.name || place.formatted_address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

    if (isAddingPin) {
      // Handle marker creation
      try {
        const placeNameForMarker = place.name || place.formatted_address || undefined;
        const response = await mapApi.saveMarker({ 
          position: location, 
          name: placeNameForMarker,
          color: selectedMarkerColor
        });
        setMarkers(prev => [...prev, {
          _id: response.data._id,
          position: location,
          name: response.data.name,
          isLarge: response.data.isLarge || false,
          color: response.data.color || selectedMarkerColor
        }]);
        setRouteSuccess('Marker added successfully!');
        setTimeout(() => setRouteSuccess(null), 3000);
        setIsAddingPin(false);
        setSearchQuery('');
        setShowMarkerColorPalette(false);
        // Force re-render to update the map
        setRenderKey(prev => prev + 1);
      } catch (error) {
        console.error('Error saving marker:', error);
        setRouteError('Failed to save marker. Please try again.');
        setTimeout(() => setRouteError(null), 3000);
      }
    } else {
      // For route creation, use functional update to handle both start and waypoint cases
      setRoutePoints(prev => {
        if (!prev.start) {
          // No start point - set this as the start
          const newState = {
            ...prev,
            start: location,
            end: null,
            waypoints: prev.waypoints // Keep existing waypoints if any
          };
          
          // Update names and server state outside the callback
          setTimeout(() => {
            setRoutePointNames(prevNames => ({ 
              start: placeName, 
              waypoints: prevNames.waypoints || [], // Keep existing waypoint names
              end: undefined 
            }));
            updateRouteState('start', location);
            setSearchQuery('');
          }, 0);
          
          return newState;
        } else {
          // Start point exists - add as waypoint
          // Check for duplicates first
          if (isDuplicateWaypoint(location, prev.waypoints)) {
            console.log('Skipping waypoint - duplicate detected');
            return prev;
          }

          // Check if already processing - if so, check if waypoint already exists
          // IMPORTANT: If processing, we should NOT return prev unless it's a duplicate,
          // because returning prev might overwrite a pending update from a previous call
          if (isProcessingWaypointRef.current) {
            const alreadyExists = isDuplicateWaypoint(location, prev.waypoints);
            if (alreadyExists) {
              return prev; // Safe to return prev if it's a duplicate
            }
            // If processing but waypoint doesn't exist, it's a race condition
            // CRITICAL: Don't return prev here as it might overwrite a pending update!
            // Instead, we need to merge with any pending waypoints
            console.warn('Processing flag set but waypoint not found - race condition detected');
            // Check if prev.waypoints is actually empty (shouldn't be if we just added one)
            // If it is empty, we should still add the waypoint, but log a warning
            if (prev.waypoints.length === 0) {
              console.error('WARNING: waypoints array is empty but processing flag is set - this is a bug!');
              // Still proceed to add the waypoint
            }
          }

          // Set processing flag BEFORE state update to prevent concurrent updates
          isProcessingWaypointRef.current = true;
          
          // Create updated waypoints array - this is the source of truth
          const updatedWaypoints = [...prev.waypoints, location];
          
          // CRITICAL: Return updated state immediately - this must happen synchronously
          // This is the ONLY state update in this callback - no other setters here!
          const newState = {
            ...prev,
            waypoints: updatedWaypoints
          };
          
          // Schedule all other updates AFTER React processes the state update
          // Use setTimeout to ensure React has committed the state update
          setTimeout(() => {
            // Update names
            setRoutePointNames(prevNames => {
              const currentWaypoints = prevNames.waypoints || [];
              // Only add if it's not already there (prevent duplicates from double calls)
              if (currentWaypoints.length >= updatedWaypoints.length) {
                return prevNames;
              }
              const newWaypoints = [...currentWaypoints, placeName];
              return {
                ...prevNames,
                waypoints: newWaypoints
              };
            });
            
            // Update server state
            updateRouteState('waypoint', location);
            
            // Recalculate route with updated waypoints
            recalculateRoute(newState);
            
            // Clear search query
            setSearchQuery('');
            
            // Reset processing flag
            setTimeout(() => {
              isProcessingWaypointRef.current = false;
            }, 500);
          }, 100); // Increased timeout to ensure React has processed the state
          
          // Return the new state - this is the ONLY state update in this callback
          return newState;
        }
      });
    }

    // Update map center and pan to location
    setMapCenter(location);
    setIsFollowingLocation(false);
    if (mapRef.current) {
      mapRef.current.panTo(location);
      mapRef.current.setZoom(14);
    }

    // Reset processing flag after all updates complete
    setTimeout(() => {
      isProcessingPlaceSelectionRef.current = false;
    }, 600); // Longer timeout to ensure all state updates complete
  }, [isAddingPin, updateRouteState, recalculateRoute, selectedMarkerColor, mapApi]);

  const handleMarkerClick = async (marker: SavedMarker) => {
    // Get the most up-to-date marker from state to ensure we have the latest showLabel value
    const currentMarker = markers.find(m => m._id === marker._id) || marker;
    // Keep showLabel as-is (can be undefined to use global toggle)
    setSelectedMarker(currentMarker);
    setSelectedRoute(null);
    // Use stored name if available, otherwise show coordinates
    setMarkerPlaceName(marker.name || `${marker.position.lat.toFixed(4)}, ${marker.position.lng.toFixed(4)}`);
    setIsLoadingMarkerName(false);
    setSelectedMarkerColor(marker.color || '#FF0000');
    setShowMarkerColorPalette(false);
  };

  const handleRouteClick = (route: SavedRoute, index: number) => {
    setSelectedRoute(route);
    setShowColorPalette(false);
    setShowDeleteButton(true);
    setShowRouteDirections(false);
    setRouteDirections(null);
  };

  // Fetch directions for a saved route
  const fetchRouteDirections = async (route: SavedRoute) => {
    if (!directionsService.current) {
      console.error('DirectionsService not initialized');
      return;
    }

    try {
      const routeConfig: google.maps.DirectionsRequest = {
        origin: route.start,
        destination: route.end,
        waypoints: route.waypoints.map(point => ({
          location: new google.maps.LatLng(point.lat, point.lng),
          stopover: true
        })),
        travelMode: google.maps.TravelMode.DRIVING
      };

      const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsService.current?.route(routeConfig, (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      setRouteDirections(result);
      setShowRouteDirections(true);
    } catch (error) {
      console.error('Error fetching route directions:', error);
      setRouteError('Failed to fetch directions');
      setTimeout(() => setRouteError(null), 3000);
    }
  };

  const handleDeleteClick = (type: 'marker' | 'route', id: string | undefined) => {
    if (!id) {
      console.error('No ID provided for deletion');
      return;
    }
    setItemToDelete({ type, id });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'marker') {
      const updatedMarkers = markers.filter(marker => marker._id !== itemToDelete.id);
      setMarkers(updatedMarkers);
      await deleteMarker(itemToDelete.id);
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
    } else if (itemToDelete.type === 'route') {
      const updatedRoutes = savedRoutes.filter(route => route._id !== itemToDelete.id);
      setSavedRoutes(updatedRoutes);
      await deleteRoute(itemToDelete.id);
      
      if (selectedRoute && selectedRoute._id === itemToDelete.id) {
        setDirections(null);
      }
      // Force re-render to update the map
      setRenderKey(prev => prev + 1);
    }

    setShowDeleteConfirm(false);
    setItemToDelete(null);
    setSelectedMarker(null);
    setMarkerPlaceName('');
    setIsLoadingMarkerName(false);
    setSelectedRoute(null);
    setShowDeleteButton(false);
  };

  // Add back the onPlaceSelected function
  const onPlaceSelected = useCallback(() => {
    if (!autocompleteRef.current) {
      console.error('Autocomplete reference is not available');
      return;
    }

    const place = autocompleteRef.current.getPlace();
    
    if (!place || !place.geometry || !place.geometry.location) {
      return;
    }

    // For pin placement, don't use duplicate prevention (user might want to place multiple pins)
    if (isAddingPin) {
      handlePlaceSelection(place);
      return;
    }

    // For route creation, use duplicate prevention
    const placeId = place.place_id || `${place.geometry.location.lat()}-${place.geometry.location.lng()}`;
    
    // If this is the same place and was selected recently, skip it
    if (lastPlaceSelectionRef.current === placeId) {
      return;
    }
    
    // Also check if handlePlaceSelection is already processing
    if (isProcessingPlaceSelectionRef.current) {
      return;
    }
    
    // Set the flag immediately to prevent duplicate processing
    lastPlaceSelectionRef.current = placeId;
    
    // Call handlePlaceSelection
    handlePlaceSelection(place);
    
    // Reset after 2 seconds to allow selecting the same place again if needed
    setTimeout(() => {
      if (lastPlaceSelectionRef.current === placeId) {
        lastPlaceSelectionRef.current = '';
      }
    }, 2000);
  }, [isAddingPin, handlePlaceSelection]);

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
            {isAddingPin && (
              <div className="text-xs text-gray-600 mb-2">
                Pin Color:
                <div className="flex space-x-2 mt-1">
                  {ROUTE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setSelectedMarkerColor(color.value)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        selectedMarkerColor === color.value ? 'border-black scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            )}
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
              <>
                {/* Route Points List */}
                {(routePoints.start || routePoints.waypoints.length > 0) && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Route Points:</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {/* Start Point */}
                      {routePoints.start && (
                        <div 
                          className="flex items-center justify-between p-2 bg-green-50 rounded text-sm cursor-pointer hover:bg-green-100 transition-colors"
                          onClick={() => {
                            if (mapRef.current) {
                              mapRef.current.setCenter(routePoints.start!);
                              mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 12, 15));
                            }
                          }}
                          title="Click to center map on this point"
                        >
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <span className="font-semibold text-green-700 flex-shrink-0">Start:</span>
                            <span className="text-gray-700 truncate">
                              {routePointNames.start || `${routePoints.start.lat.toFixed(4)}, ${routePoints.start.lng.toFixed(4)}`}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoutePoints(prev => {
                                const updated = { ...prev, start: null };
                                setTimeout(() => recalculateRoute(updated), 0);
                                return updated;
                              });
                              setRoutePointNames(prev => ({ ...prev, start: undefined }));
                            }}
                            className="text-red-500 hover:text-red-700 text-xs px-2 py-1 flex-shrink-0"
                            title="Remove start point"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      
                      {/* Waypoints - last one is the end point */}
                      {routePoints.waypoints && Array.isArray(routePoints.waypoints) && routePoints.waypoints.length > 0 ? (
                        routePoints.waypoints.map((waypoint, index) => {
                          const isLast = index === routePoints.waypoints.length - 1;
                          return (
                            <div 
                              key={index} 
                              className={`flex items-center justify-between p-2 rounded text-sm cursor-pointer transition-colors ${
                                isLast 
                                  ? 'bg-red-50 hover:bg-red-100' 
                                  : 'bg-blue-50 hover:bg-blue-100'
                              }`}
                              onClick={() => {
                                if (mapRef.current) {
                                  mapRef.current.setCenter(waypoint);
                                  mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 12, 15));
                                }
                              }}
                              title={`Click to center map on this ${isLast ? 'end point' : 'waypoint'}`}
                            >
                              <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <span className={`font-semibold flex-shrink-0 ${
                                  isLast ? 'text-red-700' : 'text-blue-700'
                                }`}>
                                  {isLast ? 'End:' : `Waypoint ${index + 1}:`}
                                </span>
                                <span className="text-gray-700 truncate">
                                  {routePointNames.waypoints[index] || `${waypoint.lat.toFixed(4)}, ${waypoint.lng.toFixed(4)}`}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                setRoutePoints(prev => {
                                  const newWaypoints = [...prev.waypoints];
                                  newWaypoints.splice(index, 1);
                                  // Recalculate route with updated waypoints
                                  setTimeout(() => {
                                    recalculateRoute({
                                      ...prev,
                                      waypoints: newWaypoints
                                    });
                                  }, 0);
                                  return {
                                    ...prev,
                                    waypoints: newWaypoints
                                  };
                                });
                                setRoutePointNames(prev => {
                                  const newNames = [...prev.waypoints];
                                  newNames.splice(index, 1);
                                  return {
                                    ...prev,
                                    waypoints: newNames
                                  };
                                });
                                }}
                                className="text-red-500 hover:text-red-700 text-xs px-2 py-1 flex-shrink-0"
                                title={isLast ? 'Remove end point' : 'Remove waypoint'}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-gray-500 p-2">No waypoints yet. Add points by clicking on the map or typing locations.</div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex justify-between mt-3">
                  <button
                    onClick={handleStartNewRoute}
                    className="px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    Cancel Route
                  </button>
                  {routePoints.start && routePoints.waypoints.length > 0 && (
                    <button
                      onClick={handleFinishRoute}
                      className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                    >
                      Finish Route ({routePoints.waypoints.length} {routePoints.waypoints.length === 1 ? 'point' : 'points'})
                    </button>
                  )}
                </div>
              </>
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
          fullscreenControl: false,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
        }}
      >
        {/* Current location marker */}
        {currentLocation && mapRef.current && (
          <AdvancedMarker
            position={currentLocation}
            map={mapRef.current}
            color="#4285F4"
            scale={10}
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

        {/* Route creation markers */}
        {isAddingRoute && mapRef.current && (
          <>
            {/* Start point marker */}
            {routePoints.start && (
              <AdvancedMarker
                position={routePoints.start}
                map={mapRef.current}
                color="#00FF00"
                scale={10}
              />
            )}
            {/* Waypoint markers */}
            {routePoints.waypoints.map((waypoint, index) => (
              <AdvancedMarker
                key={`waypoint-${index}`}
                position={waypoint}
                map={mapRef.current}
                color="#0000FF"
                scale={8}
              />
            ))}
            {/* Last waypoint (end point) marker - shown in red */}
            {routePoints.waypoints.length > 0 && (
              <AdvancedMarker
                position={routePoints.waypoints[routePoints.waypoints.length - 1]}
                map={mapRef.current}
                color="#FF0000"
                scale={10}
              />
            )}
          </>
        )}

        {/* Placed markers - PINS ALWAYS RENDER, labels are conditional */}
        {mapRef.current && markers.map((marker) => {
          if (!marker || !marker._id || !marker.position) {
            return null;
          }
          
          // Determine if label should be shown (PIN IS NOT AFFECTED BY THIS):
          // - If showLabel is explicitly set (true or false), use that value (individual setting takes precedence)
          // - If showLabel is undefined, use global toggle
          const shouldShowLabel = marker.showLabel !== undefined 
            ? marker.showLabel 
            : showPinLabels;
          const labelValue = shouldShowLabel ? marker.name : undefined;
          
          // PIN ALWAYS RENDERS - key is stable to prevent remounting
          // Only the label prop changes, which updates the label visibility
          return (
            <AdvancedMarker
              key={`marker-${marker._id}`}
              position={marker.position}
              map={mapRef.current}
              onClick={() => handleMarkerClick(marker)}
              color={marker.color || '#FF0000'}
              scale={marker.isLarge ? 16 : 8}
              label={labelValue}
            />
          );
        })}

        {/* Current route (during creation) */}
        {directions && !showRouteDirections && (
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
              onClick={(e) => {
                // During route creation, clicking on route should add a waypoint, not show delete popup
                if (isAddingRoute && e.latLng) {
                  const latLngLiteral = {
                    lat: e.latLng.lat(),
                    lng: e.latLng.lng()
                  };
                  // Add waypoint at clicked location
                  const placeName = `${latLngLiteral.lat.toFixed(4)}, ${latLngLiteral.lng.toFixed(4)}`;
                  
                  if (isProcessingWaypointRef.current) {
                    return;
                  }
                  
                  isProcessingWaypointRef.current = true;
                  
                  const isDuplicate = routePoints.waypoints.some(wp => 
                    Math.abs(wp.lat - latLngLiteral.lat) < 0.0001 && 
                    Math.abs(wp.lng - latLngLiteral.lng) < 0.0001
                  );
                  
                  if (!isDuplicate) {
                    setRoutePoints(prev => {
                      const updated = {
                        ...prev,
                        waypoints: [...prev.waypoints, latLngLiteral]
                      };
                      setTimeout(() => {
                        recalculateRoute(updated);
                      }, 50);
                      return updated;
                    });
                    
                    setRoutePointNames(prev => ({
                      ...prev,
                      waypoints: [...prev.waypoints, placeName]
                    }));
                  }
                  
                  setTimeout(() => {
                    isProcessingWaypointRef.current = false;
                  }, 200);
                } else {
                  // Not creating route, show route info
                  const fullPath = extractFullPath(directions);
                  const { distanceText, durationText } = calculateRouteTotals(directions);
                  const currentRoute: SavedRoute = {
                    _id: Date.now().toString(),
                    start: routePoints.start!,
                    end: routePoints.waypoints[routePoints.waypoints.length - 1]!,
                    waypoints: routePoints.waypoints.slice(0, -1),
                    overviewPath: fullPath,
                    distance: distanceText,
                    duration: durationText,
                    color: selectedColor
                  };
                  handleRouteClick(currentRoute, -1);
                }
              }}
            />
          </>
        )}

        {/* Route directions display */}
        {showRouteDirections && routeDirections && (
          <DirectionsRenderer 
            directions={routeDirections}
            options={{
              suppressMarkers: false,
              polylineOptions: {
                strokeColor: '#FFD700',
                strokeWeight: 6,
                strokeOpacity: 1,
                clickable: false,
                zIndex: 10
              }
            }}
          />
        )}

        {/* Saved routes */}
        {savedRoutes.map((route, index) => (
          <Polyline
            key={`${index}-${route.color}`}
            path={route.overviewPath}
            options={{
              strokeColor: selectedRoute === route && !showRouteDirections ? '#FFD700' : route.color,
              strokeWeight: 5,
              strokeOpacity: selectedRoute === route && !showRouteDirections ? 1 : 0.7,
              clickable: true,
              zIndex: selectedRoute === route && !showRouteDirections ? 1 : 0
            }}
            onClick={() => handleRouteClick(route, index)}
          />
        ))}

        {/* Selected marker confirmation dialog */}
        {selectedMarker && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl z-50 min-w-[350px] max-w-[500px]">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Marker Selected
            </h3>
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-semibold">Name:</span>
              </div>
              <input
                type="text"
                value={markerPlaceName}
                onChange={(e) => setMarkerPlaceName(e.target.value)}
                onBlur={async () => {
                  if (selectedMarker && markerPlaceName !== (selectedMarker.name || `${selectedMarker.position.lat.toFixed(4)}, ${selectedMarker.position.lng.toFixed(4)}`)) {
                    try {
                      const response = await mapApi.updateMarker(selectedMarker._id, { name: markerPlaceName || undefined });
                      setMarkers(prev => prev.map(marker => 
                        marker._id === selectedMarker._id 
                          ? { ...marker, name: response.data.name }
                          : marker
                      ));
                      setSelectedMarker({ ...selectedMarker, name: response.data.name });
                      setRouteSuccess('Marker name updated!');
                      setTimeout(() => setRouteSuccess(null), 2000);
                      // Force re-render to update the map (name label)
                      setRenderKey(prev => prev + 1);
                    } catch (error) {
                      console.error('Error updating marker name:', error);
                      setRouteError('Failed to update marker name');
                      setTimeout(() => setRouteError(null), 3000);
                      // Revert to original name
                      setMarkerPlaceName(selectedMarker.name || `${selectedMarker.position.lat.toFixed(4)}, ${selectedMarker.position.lng.toFixed(4)}`);
                    }
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Enter pin name..."
              />
              <div className="text-xs text-gray-500 mt-1">
                Coordinates: {selectedMarker.position.lat.toFixed(6)}, {selectedMarker.position.lng.toFixed(6)}
              </div>
            </div>
            
            {/* Color selection */}
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-semibold">Color:</span>
              </div>
              <div className="flex space-x-2">
                {ROUTE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      if (selectedMarker) {
                        updateMarkerColor(selectedMarker._id, color.value);
                      }
                    }}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      (selectedMarker?.color || '#FF0000') === color.value ? 'border-black scale-110' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            
            {/* Label visibility toggle */}
            <div className="mb-4">
              <button
                onClick={async () => {
                    if (selectedMarker) {
                    // Toggle: determine current state (use global toggle if undefined), then flip it
                    const currentState = selectedMarker.showLabel !== undefined 
                      ? selectedMarker.showLabel 
                      : showPinLabels;
                    const newShowLabel = !currentState;
                    
                    
                    try {
                      const response = await mapApi.updateMarker(selectedMarker._id, { showLabel: newShowLabel });
                      
                      // Get the updated showLabel value from response
                      const updatedShowLabel = response.data.showLabel !== undefined 
                        ? response.data.showLabel 
                        : newShowLabel;
                      
                      // Update markers state immediately - this should trigger a re-render
                      setMarkers(prev => {
                        const updated = prev.map(marker => 
                          marker._id === selectedMarker._id 
                            ? { ...marker, showLabel: updatedShowLabel }
                            : marker
                        );
                        return updated;
                      });
                      
                      // Update selected marker state
                      const updatedSelectedMarker = { 
                        ...selectedMarker, 
                        showLabel: updatedShowLabel 
                      };
                      setSelectedMarker(updatedSelectedMarker);
                      
                      setRouteSuccess(`Label ${updatedShowLabel ? 'shown' : 'hidden'}!`);
                      setTimeout(() => setRouteSuccess(null), 2000);
                      
                      // Force re-render of markers to update label visibility
                      setRenderKey(prev => prev + 1);
                    } catch (error) {
                      console.error('Error updating marker label visibility:', error);
                      setRouteError('Failed to update label visibility');
                      setTimeout(() => setRouteError(null), 3000);
                    }
                  }
                }}
                className={`w-full px-4 py-2 rounded transition-colors ${
                  (selectedMarker?.showLabel !== false) // true if undefined or true
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-400 text-white hover:bg-gray-500'
                }`}
              >
                {(() => {
                  // If showLabel is undefined, use global toggle state; otherwise use the explicit value
                  const currentState = selectedMarker?.showLabel !== undefined 
                    ? selectedMarker.showLabel 
                    : showPinLabels;
                  return currentState ? 'Hide Label' : 'Show Label';
                })()}
              </button>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setSelectedMarker(null);
                  setMarkerPlaceName('');
                  setIsLoadingMarkerName(false);
                  setShowMarkerColorPalette(false);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedMarker) {
                    toggleMarkerSize(selectedMarker._id, selectedMarker.isLarge || false);
                  }
                }}
                className={`px-4 py-2 rounded transition-colors ${
                  selectedMarker?.isLarge
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-blue-200 text-blue-700 hover:bg-blue-300'
                }`}
              >
                {selectedMarker?.isLarge ? 'Make Smaller' : 'Make Bigger'}
              </button>
              <button
                onClick={() => {
                  handleDeleteClick('marker', selectedMarker._id);
                  setSelectedMarker(null);
                  setMarkerPlaceName('');
                  setIsLoadingMarkerName(false);
                }}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Delete Marker
              </button>
            </div>
          </div>
        )}

        {/* Route directions panel */}
        {showRouteDirections && routeDirections && selectedRoute && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-xl z-50 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Driving Directions</h3>
              <button
                onClick={() => {
                  setShowRouteDirections(false);
                  setRouteDirections(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {routeDirections.routes[0].legs.map((leg, legIndex) => (
                <div key={legIndex} className="border-b pb-4 last:border-b-0 last:pb-0">
                  <div className="font-semibold text-gray-800 mb-2">
                    {leg.start_address || 'Start'} → {leg.end_address || 'End'}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {leg.distance?.text} • {leg.duration?.text}
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {leg.steps.map((step, stepIndex) => (
                      <li key={stepIndex} className="text-gray-700">
                        <span dangerouslySetInnerHTML={{ __html: step.instructions }} />
                        <span className="text-gray-500 ml-1">
                          ({step.distance?.text})
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <div className="text-sm text-gray-600">
                <div className="font-semibold">Total: {selectedRoute.distance} • {selectedRoute.duration}</div>
              </div>
            </div>
          </div>
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
              <div className="flex flex-col space-y-2">
                <div className="text-sm font-semibold text-gray-800 mb-1">
                  {selectedRoute.distance} • {selectedRoute.duration}
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedRoute) {
                        fetchRouteDirections(selectedRoute);
                      }
                    }}
                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                  >
                    Get Directions
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-xl z-50 min-w-[300px]">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Delete {itemToDelete.type === 'route' ? 'Route' : 'Marker'}?
          </h3>
          <p className="text-gray-600 mb-4">
            {itemToDelete.type === 'route' 
              ? 'Are you sure you want to delete this route? This action cannot be undone.'
              : 'Are you sure you want to delete this marker? This action cannot be undone.'}
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
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
          
          <button
            onClick={async () => {
              const newGlobalState = !showPinLabels;
              setShowPinLabels(newGlobalState);
              
              // Update all markers to match the global state (reset individual settings)
              if (markers.length === 0) {
                return;
              }
              
              // Update local state immediately for responsive UI
              // Use functional update to ensure we have the latest markers
              setMarkers(prev => {
                const updated = prev.map(marker => {
                  if (!marker || !marker._id) {
                    return marker;
                  }
                  return { ...marker, showLabel: newGlobalState };
                });
                return updated;
              });
              
              // Update markers in the background (don't wait for it)
              // Capture markers before async operation
              const markersToUpdate = [...markers];
              try {
                const updatePromises = markersToUpdate.map(marker => 
                  mapApi.updateMarker(marker._id, { showLabel: newGlobalState }).catch(err => {
                    console.error(`Error updating marker ${marker._id}:`, err);
                    return null;
                  })
                );
                await Promise.all(updatePromises);
              } catch (error) {
                console.error('Error updating marker labels:', error);
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              showPinLabels 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-gray-400 hover:bg-gray-500'
            } text-white text-sm`}
            title={showPinLabels ? 'Hide pin labels' : 'Show pin labels'}
          >
            {showPinLabels ? 'Hide Labels' : 'Show Labels'}
          </button>
          
          <div className="border-t pt-2 mt-2">
            <button
              onClick={handleBackup}
              className="w-full px-3 py-1.5 rounded-lg font-semibold bg-blue-500 hover:bg-blue-600 text-white text-sm"
              title="Download a backup of all your routes and markers"
            >
              📥 Backup Data
            </button>
            <button
              onClick={handleRestore}
              className="w-full px-3 py-1.5 rounded-lg font-semibold bg-purple-500 hover:bg-purple-600 text-white text-sm mt-2"
              title="Restore routes and markers from a backup file"
            >
              📤 Restore Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Map;