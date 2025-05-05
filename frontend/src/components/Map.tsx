import { useEffect, useRef, useState } from 'react';
import { GoogleMap, useLoadScript, Marker, Polyline, Autocomplete, DirectionsRenderer, OverlayView } from '@react-google-maps/api';

const libraries: ("places" | "drawing" | "geometry" | "visualization")[] = ['places', 'geometry'];

interface MapProps {
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
}

interface SavedRoute {
  start: google.maps.LatLngLiteral;
  end: google.maps.LatLngLiteral;
  waypoints: google.maps.LatLngLiteral[];
  overviewPath: google.maps.LatLngLiteral[];
  distance: string;
  duration: string;
  color: string;
}

const ROUTE_COLORS = [
  { name: 'Blue', value: '#0000FF' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Purple', value: '#800080' },
  { name: 'Orange', value: '#FFA500' }
];

// Add migration function
const migrateOldRoutes = (oldRoutes: any[]): SavedRoute[] => {
  return oldRoutes.map(route => {
    if (route.directions) {
      // Old format with full DirectionsResult
      return {
        start: route.start,
        end: route.end,
        waypoints: route.waypoints || [],
        overviewPath: route.directions.routes[0].overview_path.map((latLng: google.maps.LatLng) => ({
          lat: latLng.lat(),
          lng: latLng.lng()
        })),
        distance: route.directions.routes[0].legs[0].distance?.text || '',
        duration: route.directions.routes[0].legs[0].duration?.text || '',
        color: route.color || ROUTE_COLORS[0].value
      };
    }
    // Already in new format
    return {
      ...route,
      waypoints: route.waypoints || []
    };
  });
};

const Map: React.FC<MapProps> = ({ 
  initialCenter = { lat: 40.0964, lng: -82.2618 },
  initialZoom = 12
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [markers, setMarkers] = useState<google.maps.LatLngLiteral[]>(() => {
    // Load saved markers from localStorage on initial render
    const savedMarkers = localStorage.getItem('savedMarkers');
    return savedMarkers ? JSON.parse(savedMarkers) : [];
  });
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => {
    const savedRoutes = localStorage.getItem('savedRoutes');
    if (savedRoutes) {
      try {
        const parsedRoutes = JSON.parse(savedRoutes);
        // Reset all routes to blue and save immediately
        const resetRoutes = parsedRoutes.map((route: SavedRoute) => ({
          ...route,
          color: ROUTE_COLORS[0].value
        }));
        localStorage.setItem('savedRoutes', JSON.stringify(resetRoutes));
        return resetRoutes;
      } catch (error) {
        console.error('Error parsing saved routes:', error);
        return [];
      }
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(() => {
    // Try to load saved center from localStorage
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
  const [isFollowingLocation, setIsFollowingLocation] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeStart, setRouteStart] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeEnd, setRouteEnd] = useState<google.maps.LatLngLiteral | null>(null);
  const [isAddingRoute, setIsAddingRoute] = useState(false);
  const [routeStep, setRouteStep] = useState<'start' | 'waypoint' | 'end'>('start');
  const [waypoints, setWaypoints] = useState<google.maps.LatLngLiteral[]>([]);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsService = useRef<google.maps.DirectionsService | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<google.maps.LatLngLiteral | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'marker' | 'route', index: number } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSuccess, setRouteSuccess] = useState<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedColor, setSelectedColor] = useState(ROUTE_COLORS[0].value);
  const [hasInitializedLocation, setHasInitializedLocation] = useState(() => {
    // Check if we've already initialized location
    return localStorage.getItem('hasInitializedLocation') === 'true';
  });
  const [showColorPalette, setShowColorPalette] = useState(false);
  const polylineRefs = useRef<{[key: string]: google.maps.Polyline}>({});
  const [routeUpdateTrigger, setRouteUpdateTrigger] = useState(0);
  const [lastColorChange, setLastColorChange] = useState<number>(0);

  // Add debounce timer ref
  const centerUpdateTimer = useRef<number | null>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  // Save markers and routes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('savedMarkers', JSON.stringify(markers));
  }, [markers]);

  useEffect(() => {
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
  }, [savedRoutes]);

  // Save map center to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('mapCenter', JSON.stringify(mapCenter));
  }, [mapCenter]);

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

  // Modify the useEffect for route calculation
  useEffect(() => {
    if (routeStart && routeEnd && directionsService.current) {
      console.log('Calculating route from:', routeStart, 'to:', routeEnd);
      setRouteError(null);
      setRouteSuccess(null);
      
      const request = {
        origin: routeStart,
        destination: routeEnd,
        travelMode: google.maps.TravelMode.DRIVING
      };

      directionsService.current.route(request, (result, status) => {
        console.log('Route calculation status:', status);
        if (status === 'OK' && result) {
          console.log('Route calculated successfully:', result);
          setDirections(result);
          
          // Extract only essential route data
          const routeData: SavedRoute = {
            start: routeStart,
            end: routeEnd,
            waypoints: waypoints,
            overviewPath: result.routes[0].overview_path.map(latLng => ({
              lat: latLng.lat(),
              lng: latLng.lng()
            })),
            distance: result.routes[0].legs[0].distance?.text || '',
            duration: result.routes[0].legs[0].duration?.text || '',
            color: selectedColor
          };

          // Save the compressed route data
          setSavedRoutes(prev => [...prev, routeData]);
          setRouteSuccess('Route saved successfully!');
          setTimeout(() => setRouteSuccess(null), 3000);
        } else {
          console.error('Error calculating route:', status);
          if (status === 'REQUEST_DENIED') {
            setRouteError('Directions API is not enabled. Please enable it in the Google Cloud Console.');
          } else {
            setRouteError(`Error calculating route: ${status}`);
          }
        }
      });
    }
  }, [routeStart, routeEnd]);

  // Add useEffect to focus search input when adding route or pin
  useEffect(() => {
    if ((isAddingRoute || isAddingPin) && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isAddingRoute, isAddingPin]);

  // Add debug logging for route state changes
  useEffect(() => {
    console.log('Directions state changed:', directions);
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
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
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

  const handlePlaceSelection = (place: google.maps.places.PlaceResult) => {
    if (!place || !place.geometry || !place.geometry.location) {
      console.error('Invalid place selected:', place);
      setRouteError('Please select a valid location');
      return;
    }

    setSelectedPlace(place);
    const location = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };

    if (isAddingRoute) {
      if (routeStep === 'start') {
        console.log('Setting start location:', location);
        setRouteStart(location);
        setRouteStep('waypoint');
        setSearchQuery('');
      } else if (routeStep === 'waypoint') {
        console.log('Adding waypoint:', location);
        setWaypoints(prev => [...prev, location]);
        setSearchQuery('');
      } else {
        // Check if end location is too close to start location
        if (routeStart) {
          const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(routeStart.lat, routeStart.lng),
            new google.maps.LatLng(location.lat, location.lng)
          );
          
          // If distance is less than 100 meters
          if (distance < 100) {
            setRouteError('End location must be at least 100 meters away from start location');
            return;
          }
        }

        console.log('Setting end location:', location);
        setRouteEnd(location);
        setIsAddingRoute(false);
        setRouteStep('start');
        
        // Calculate route immediately after setting end point
        if (directionsService.current) {
          console.log('Calculating route from:', routeStart, 'to:', location, 'with waypoints:', waypoints);
          const request = {
            origin: routeStart!,
            destination: location,
            waypoints: waypoints.map(waypoint => ({
              location: waypoint,
              stopover: true
            })),
            travelMode: google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true
          };

          directionsService.current.route(request, (result, status) => {
            console.log('Route calculation result:', { result, status });
            if (status === 'OK' && result) {
              if (result.routes.length === 0) {
                setRouteError('No route found between these locations. Please try different start and end points.');
                return;
              }

              console.log('Setting directions:', result);
              setDirections(result);
              
              // Save the route with selected color
              const routeData: SavedRoute = {
                start: routeStart!,
                end: location,
                waypoints: waypoints,
                overviewPath: result.routes[0].overview_path.map(latLng => ({
                  lat: latLng.lat(),
                  lng: latLng.lng()
                })),
                distance: result.routes[0].legs[0].distance?.text || '',
                duration: result.routes[0].legs[0].duration?.text || '',
                color: selectedColor
              };
              
              console.log('Saving route:', routeData);
              setSavedRoutes(prev => [...prev, routeData]);
              setRouteSuccess('Route saved successfully!');
              setTimeout(() => setRouteSuccess(null), 3000);
              
              // Reset waypoints
              setWaypoints([]);
            } else {
              console.error('Error calculating route:', status);
              let errorMessage = 'Error calculating route';
              if (status === 'ZERO_RESULTS') {
                errorMessage = 'No route found between these locations. Please try different start and end points.';
              } else if (status === 'REQUEST_DENIED') {
                errorMessage = 'Directions API is not enabled. Please enable it in the Google Cloud Console.';
              } else if (status === 'OVER_QUERY_LIMIT') {
                errorMessage = 'Query limit exceeded. Please try again later.';
              } else if (status === 'INVALID_REQUEST') {
                errorMessage = 'Invalid route request. Please check your start and end locations.';
              } else if (status === 'MAX_WAYPOINTS_EXCEEDED') {
                errorMessage = 'Too many waypoints. Please reduce the number of stops.';
              }
              setRouteError(errorMessage);
            }
          });
        }
      }
    } else {
      setMarkers(prev => [...prev, location]);
    }

    setIsAddingPin(false);
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

  const handleMarkerClick = (marker: google.maps.LatLngLiteral, index: number) => {
    setSelectedMarker(marker);
    setSelectedRoute(null);
  };

  const handleRouteClick = (route: SavedRoute, index: number) => {
    console.log('Route clicked:', route, 'at index:', index);
    setSelectedRoute(route);
    setShowColorPalette(false);
  };

  const handleDeleteClick = (type: 'marker' | 'route', index: number) => {
    console.log('Delete clicked for:', type, 'at index:', index);
    setItemToDelete({ type, index });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;

    console.log('Confirming deletion of:', itemToDelete);
    console.log('Current saved routes:', savedRoutes);

    if (itemToDelete.type === 'marker') {
      const updatedMarkers = markers.filter((_, i) => i !== itemToDelete.index);
      setMarkers(updatedMarkers);
      localStorage.setItem('savedMarkers', JSON.stringify(updatedMarkers));
    } else if (itemToDelete.type === 'route') {
      // Create a new array without the deleted route
      const updatedRoutes = savedRoutes.filter((_, i) => i !== itemToDelete.index);
      console.log('Updated routes:', updatedRoutes);
      
      // Update both state and localStorage
      setSavedRoutes(updatedRoutes);
      localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes));
      
      // Clear the current route if it matches the deleted route
      if (selectedRoute && savedRoutes[itemToDelete.index] === selectedRoute) {
        setDirections(null);
        setRouteStart(null);
        setRouteEnd(null);
        setWaypoints([]);
      }
    }

    // Reset all selection states
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

  const startNewRoute = () => {
    if (isAddingRoute) {
      // Cancel route creation
      setIsAddingRoute(false);
      setRouteStep('start');
      setRouteStart(null);
      setRouteEnd(null);
      setWaypoints([]);
      setDirections(null);
      setSearchQuery('');
    } else {
      // Start new route
      setIsAddingRoute(true);
      setRouteStep('start');
      setRouteStart(null);
      setRouteEnd(null);
      setWaypoints([]);
      setDirections(null);
    }
  };

  const handleColorChange = (color: string) => {
    console.log('handleColorChange called with color:', color);
    if (!selectedRoute) {
      console.log('No route selected');
      return;
    }

    console.log('Starting color change process:');
    console.log('Selected route:', selectedRoute);
    console.log('New color:', color);
    console.log('Current saved routes:', savedRoutes);
    
    // Find the exact route in savedRoutes
    const routeIndex = savedRoutes.findIndex(route => 
      route.start.lat === selectedRoute.start.lat &&
      route.start.lng === selectedRoute.start.lng &&
      route.end.lat === selectedRoute.end.lat &&
      route.end.lng === selectedRoute.end.lng
    );

    console.log('Found route at index:', routeIndex);

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

    console.log('Updated route:', updatedRoute);

    // First remove the route
    setSavedRoutes(routesWithoutTarget);
    
    // Then add it back with the new color
    setTimeout(() => {
      const newRoutes = [...routesWithoutTarget];
      newRoutes.splice(routeIndex, 0, updatedRoute);
      setSavedRoutes(newRoutes);
      localStorage.setItem('savedRoutes', JSON.stringify(newRoutes));
    }, 50);
    
    // Clear the selected route and directions
    setSelectedRoute(null);
    setDirections(null);
    
    // Hide color palette
    setShowColorPalette(false);

    console.log('Color change complete. New saved routes:', routesWithoutTarget);
  };

  // Add effect to monitor saved routes changes
  useEffect(() => {
    console.log('Saved routes updated:', savedRoutes);
  }, [savedRoutes]);

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading maps...</div>;

  return (
    <div className="relative w-full h-full">
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
        {markers.map((position, index) => (
          <Marker
            key={index}
            position={position}
            onClick={() => handleMarkerClick(position, index)}
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
                  start: routeStart!,
                  end: routeEnd!,
                  waypoints: waypoints,
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
            position={selectedMarker}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="bg-white rounded shadow-lg">
              <button
                onClick={() => handleDeleteClick('marker', markers.indexOf(selectedMarker))}
                className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
              >
                Delete Marker
              </button>
            </div>
          </OverlayView>
        )}

        {/* Selected route color palette */}
        {selectedRoute && (
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
                    handleDeleteClick('route', savedRoutes.indexOf(selectedRoute));
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
                          handleColorChange(color.value);
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
      {showDeleteConfirm && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white p-4 rounded-lg shadow-lg">
          <p className="mb-4">Are you sure you want to delete this {itemToDelete?.type}?</p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={cancelDelete}
              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
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
            className={`w-full px-4 py-2 rounded-lg font-semibold ${
              isFollowingLocation ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'
            } text-white`}
          >
            {isFollowingLocation ? 'Following Location' : 'Follow Location'}
          </button>
          
          <button
            onClick={toggleRecording}
            className={`w-full px-4 py-2 rounded-lg font-semibold ${
              isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
            } text-white`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          
          <button
            onClick={() => setIsAddingPin(!isAddingPin)}
            className={`w-full px-4 py-2 rounded-lg font-semibold ${
              isAddingPin ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            } text-white`}
          >
            {isAddingPin ? 'Cancel Pin' : 'Add Pin'}
          </button>

          <button
            onClick={startNewRoute}
            className={`w-full px-4 py-2 rounded-lg font-semibold ${
              isAddingRoute ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-500 hover:bg-purple-600'
            } text-white`}
          >
            {isAddingRoute ? 'Cancel Route' : 'Add Route'}
          </button>
        </div>
      </div>

      {/* Search Panel */}
      {(isAddingPin || isAddingRoute) && (
        <div className="absolute top-4 right-4 z-10 bg-white p-4 rounded-lg shadow-lg">
          <div className="space-y-2">
            <h3 className="font-semibold">
              {isAddingRoute 
                ? (routeStep === 'start' 
                    ? 'Select Start Location' 
                    : routeStep === 'waypoint'
                      ? 'Add Stop or Select End Location'
                      : 'Select End Location')
                : 'Search Location'}
            </h3>
            <Autocomplete
              onLoad={autocomplete => {
                autocompleteRef.current = autocomplete;
              }}
              onPlaceChanged={onPlaceSelected}
            >
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search location..."
                className="w-full px-3 py-2 border rounded-lg"
              />
            </Autocomplete>
            {isAddingRoute && (
              <>
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route Color</label>
                  <div className="flex space-x-2">
                    {ROUTE_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setSelectedColor(color.value)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          selectedColor === color.value ? 'border-black' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
                {waypoints.length > 0 && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stops ({waypoints.length})</label>
                    <div className="max-h-32 overflow-y-auto">
                      {waypoints.map((waypoint, index) => (
                        <div key={index} className="flex items-center justify-between py-1">
                          <span className="text-sm">Stop {index + 1}</span>
                          <button
                            onClick={() => setWaypoints(prev => prev.filter((_, i) => i !== index))}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <button
                    onClick={() => setRouteStep('end')}
                    className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={!routeStart}
                  >
                    Finish Route
                  </button>
                </div>
              </>
            )}
            <p className="text-sm text-gray-600">
              {isAddingRoute 
                ? (routeStep === 'start' 
                    ? 'Select start point' 
                    : routeStep === 'waypoint'
                      ? 'Add stops or select end point'
                      : 'Select end point')
                : 'Press Enter or click on the map to place a pin'}
            </p>
          </div>
        </div>
      )}

      {/* Error message for route calculation */}
      {routeError && (
        <div className="absolute top-4 right-4 z-10 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{routeError}</p>
          <p className="text-sm mt-1">
            <a 
              href="https://console.cloud.google.com/apis/library/directions-backend.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Enable Directions API
            </a>
          </p>
        </div>
      )}

      {/* Success message for route saving */}
      {routeSuccess && (
        <div className="absolute top-4 right-4 z-10 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <p>{routeSuccess}</p>
        </div>
      )}
    </div>
  );
};

export default Map; 