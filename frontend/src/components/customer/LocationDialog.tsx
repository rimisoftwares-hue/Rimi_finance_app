// frontend/src/components/customer/LocationDialog.tsx
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MapPin, Search, X } from 'lucide-react';
import { toast } from '../../hooks/use-toast';
import axios from 'axios';
import apiClient from '../../api/apiClient';

interface LocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  currentLocation?: string;
  onLocationUpdated: () => void;
  entityType: 'customer' | 'guardian';
}

const LocationDialog = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  currentLocation,
  onLocationUpdated,
  entityType
}: LocationDialogProps) => {
  const [location, setLocation] = useState(currentLocation || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3004').replace(/\/+$/, '');

  // Load Google Maps script
  useEffect(() => {
    if (!isOpen) return;

    const loadGoogleMapsScript = () => {
      if (window.google?.maps) {
        initMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      script.onerror = () => {
        setMapError('Failed to load Google Maps');
      };
      document.head.appendChild(script);
    };

    loadGoogleMapsScript();

    return () => {
      // Cleanup marker
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
    };
  }, [isOpen]);

  // Initialize map
  const initMap = () => {
    if (!mapRef.current || !window.google) return;

    try {
      const defaultLocation = { lat: 20.5937, lng: 78.9629 }; // Center of India

      // Try to geocode current location if exists
      if (currentLocation) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: currentLocation }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location;
            createMap(location.lat(), location.lng(), results[0].formatted_address);
          } else {
            createMap(defaultLocation.lat, defaultLocation.lng);
          }
        });
      } else {
        // Try to get user's current location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              createMap(position.coords.latitude, position.coords.longitude);
            },
            () => {
              createMap(defaultLocation.lat, defaultLocation.lng);
            }
          );
        } else {
          createMap(defaultLocation.lat, defaultLocation.lng);
        }
      }
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapError('Failed to initialize map');
    }
  };

  const createMap = (lat: number, lng: number, address?: string) => {
    if (!mapRef.current || !window.google) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: getMapStyles()
    });

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      draggable: true,
      animation: google.maps.Animation.DROP
    });

    googleMapRef.current = map;
    markerRef.current = marker;

    // Update location when marker is dragged
    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        reverseGeocode(position.lat(), position.lng());
      }
    });

    // Add click listener to map
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        marker.setPosition(e.latLng);
        reverseGeocode(e.latLng.lat(), e.latLng.lng());
      }
    });

    // Initialize search box
    initSearchBox(map);
  };

  const initSearchBox = (map: google.maps.Map) => {
    if (!searchInputRef.current || !window.google) return;

    const searchBox = new google.maps.places.SearchBox(searchInputRef.current);

    map.addListener('bounds_changed', () => {
      searchBox.setBounds(map.getBounds() as google.maps.LatLngBounds);
    });

    searchBox.addListener('places_changed', () => {
      const places = searchBox.getPlaces();
      if (!places || places.length === 0) return;

      const place = places[0];
      if (!place.geometry || !place.geometry.location) return;

      // Update map
      map.setCenter(place.geometry.location);
      map.setZoom(17);

      // Update marker
      if (markerRef.current) {
        markerRef.current.setPosition(place.geometry.location);
      }

      // Update location input
      setLocation(place.formatted_address || '');
    });
  };

  const reverseGeocode = (lat: number, lng: number) => {
    if (!window.google) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        setLocation(results[0].formatted_address);
      } else {
        setLocation(`${lat}, ${lng}`);
      }
    });
  };

  const getMapStyles = () => {
    const isDark = document.documentElement.classList.contains('dark');
    
    if (isDark) {
      return [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        {
          featureType: 'administrative.locality',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#d59563' }]
        },
        {
          featureType: 'poi',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#d59563' }]
        },
        {
          featureType: 'poi.park',
          elementType: 'geometry',
          stylers: [{ color: '#263c3f' }]
        },
        {
          featureType: 'poi.park',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#6b9a76' }]
        },
        {
          featureType: 'road',
          elementType: 'geometry',
          stylers: [{ color: '#38414e' }]
        },
        {
          featureType: 'road',
          elementType: 'geometry.stroke',
          stylers: [{ color: '#212a37' }]
        },
        {
          featureType: 'road',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#9ca5b3' }]
        },
        {
          featureType: 'road.highway',
          elementType: 'geometry',
          stylers: [{ color: '#746855' }]
        },
        {
          featureType: 'road.highway',
          elementType: 'geometry.stroke',
          stylers: [{ color: '#1f2835' }]
        },
        {
          featureType: 'road.highway',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#f3d19c' }]
        },
        {
          featureType: 'transit',
          elementType: 'geometry',
          stylers: [{ color: '#2f3948' }]
        },
        {
          featureType: 'transit.station',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#d59563' }]
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#17263c' }]
        },
        {
          featureType: 'water',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#515c6d' }]
        },
        {
          featureType: 'water',
          elementType: 'labels.text.stroke',
          stylers: [{ color: '#17263c' }]
        }
      ];
    }
    
    return [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
      }
    ];
  };

  const handleSave = async () => {
    if (!location.trim()) {
      toast({
        title: 'Error',
        description: 'Please select a location',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = entityType === 'customer' 
        ? `/customers/${customerId}/update-location`
        : `/customers/${customerId}/update-guardian-location`;

      await apiClient.put(endpoint, { location });
      
      toast({
        title: 'Success',
        description: `Location updated successfully`,
      });
      
      onLocationUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating location:', error);
      toast({
        title: 'Error',
        description: 'Failed to update location',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {currentLocation ? 'Edit Location' : 'Add Location'} - {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mapError ? (
            <div className="text-center p-8 text-destructive">
              <p>{mapError}</p>
              <Button variant="outline" className="mt-4" onClick={initMap}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search for a location..."
                  className="pl-10 pr-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              {/* Map Container */}
              <div 
                ref={mapRef} 
                className="w-full h-[400px] rounded-lg border border-border"
              />

              {/* Location Input */}
              <div className="space-y-2">
                <Label htmlFor="location">Selected Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Selected location will appear here"
                />
                <p className="text-xs text-muted-foreground">
                  Drag the marker or click on the map to set location
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !location}>
            {isLoading ? 'Saving...' : 'Save Location'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationDialog;