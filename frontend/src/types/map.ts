export interface SavedRoute {
  _id?: string;
  start: google.maps.LatLngLiteral;
  end: google.maps.LatLngLiteral;
  waypoints: google.maps.LatLngLiteral[];
  overviewPath: google.maps.LatLngLiteral[];
  distance: string;
  duration: string;
  color: string;
}

export interface SavedMarker {
  _id: string;
  position: google.maps.LatLngLiteral;
} 