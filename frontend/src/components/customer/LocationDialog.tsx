// frontend/src/components/customer/LocationDialog.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { MapPin, Search, X, Navigation, Loader2 } from 'lucide-react';
import { toast } from '../../hooks/use-toast';
import axios from 'axios';
import apiClient from '../../api/apiClient';
import { usePermissionFlow } from '../../hooks/usePermissionFlow';
import { DevicePermissionService } from '../../services/devicePermissionService';
import { PermissionModal } from '../common/PermissionModal';
import { useAuth } from '../../contexts/AuthContext';
import { isValidCoords } from '../../hooks/useLoginLocation';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
  const { currentFinance } = useAuth();
  const [location, setLocation] = useState(currentLocation || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isUpdatingYou, setIsUpdatingYou] = useState(false);
  const [showIpFallback, setShowIpFallback] = useState(false);
  const locationFlow = usePermissionFlow('location');
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const officeMarkerRef = useRef<google.maps.Marker | null>(null);
  const youMarkerRef = useRef<google.maps.Marker | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [youCoords, setYouCoords] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem('lastKnownLocation');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number' && isValidCoords(parsed.lat, parsed.lng)) {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch { /* ignore */ }
    return null;
  });

  const officeCoords = useMemo(() => {
    if (
      currentFinance?.office_lat != null &&
      currentFinance?.office_lng != null &&
      Number.isFinite(+currentFinance.office_lat) &&
      Number.isFinite(+currentFinance.office_lng) &&
      !(+currentFinance.office_lat === 0 && +currentFinance.office_lng === 0)
    ) {
      return { lat: +currentFinance.office_lat, lng: +currentFinance.office_lng };
    }
    return null;
  }, [currentFinance]);

  const officeDistanceKm = useMemo(() => {
    if (!officeCoords || !customerCoords) return null;
    return haversineKm(officeCoords.lat, officeCoords.lng, customerCoords.lat, customerCoords.lng);
  }, [officeCoords, customerCoords]);

  const youDistanceKm = useMemo(() => {
    if (!youCoords || !customerCoords) return null;
    return haversineKm(youCoords.lat, youCoords.lng, customerCoords.lat, customerCoords.lng);
  }, [youCoords, customerCoords]);
  
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
      // Cleanup markers
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      if (officeMarkerRef.current) {
        officeMarkerRef.current.setMap(null);
      }
      if (youMarkerRef.current) {
        youMarkerRef.current.setMap(null);
      }
    };
  }, [isOpen]);

  const updateAuxiliaryMarkersAndBounds = (map: google.maps.Map, custLat: number, custLng: number) => {
    if (!window.google) return;
    setCustomerCoords({ lat: custLat, lng: custLng });

    // Office marker
    if (officeCoords) {
      if (!officeMarkerRef.current) {
        officeMarkerRef.current = new google.maps.Marker({
          position: officeCoords,
          map: map,
          title: 'Office',
          label: {
            text: 'Office',
            color: '#1e3a8a',
            fontSize: '11px',
            fontWeight: 'bold',
          },
        });
      } else {
        officeMarkerRef.current.setPosition(officeCoords);
        officeMarkerRef.current.setMap(map);
      }
    } else if (officeMarkerRef.current) {
      officeMarkerRef.current.setMap(null);
    }

    // You marker
    if (youCoords) {
      if (!youMarkerRef.current) {
        youMarkerRef.current = new google.maps.Marker({
          position: youCoords,
          map: map,
          title: 'You',
          label: {
            text: 'You',
            color: '#064e3b',
            fontSize: '11px',
            fontWeight: 'bold',
          },
        });
      } else {
        youMarkerRef.current.setPosition(youCoords);
        youMarkerRef.current.setMap(map);
      }
    } else if (youMarkerRef.current) {
      youMarkerRef.current.setMap(null);
    }

    // Fit bounds to visible markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: custLat, lng: custLng });
    if (officeCoords) bounds.extend(officeCoords);
    if (youCoords) bounds.extend(youCoords);

    if (officeCoords || youCoords) {
      map.fitBounds(bounds);
    }
  };

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
        createMap(defaultLocation.lat, defaultLocation.lng);
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

    updateAuxiliaryMarkersAndBounds(map, lat, lng);

    // Update location when marker is dragged
    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        updateAuxiliaryMarkersAndBounds(map, position.lat(), position.lng());
        reverseGeocode(position.lat(), position.lng());
      }
    });

    // Add click listener to map
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        marker.setPosition(e.latLng);
        updateAuxiliaryMarkersAndBounds(map, e.latLng.lat(), e.latLng.lng());
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

      const pLat = place.geometry.location.lat();
      const pLng = place.geometry.location.lng();

      // Update map
      map.setCenter(place.geometry.location);
      map.setZoom(17);

      // Update marker
      if (markerRef.current) {
        markerRef.current.setPosition(place.geometry.location);
      }

      updateAuxiliaryMarkersAndBounds(map, pLat, pLng);

      // Update location input
      setLocation(place.formatted_address || '');
    });
  };

  const reverseGeocode = (lat: number, lng: number, isApproximate = false) => {
    if (!window.google) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      const prefix = isApproximate ? '[Approximate] ' : '';
      if (status === 'OK' && results && results[0]) {
        setLocation(`${prefix}${results[0].formatted_address}`);
      } else {
        setLocation(`${prefix}${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    });
  };

  const applyCoordinates = (lat: number, lng: number, isApproximate = false) => {
    if (googleMapRef.current && markerRef.current && window.google) {
      const pos = new google.maps.LatLng(lat, lng);
      googleMapRef.current.setCenter(pos);
      googleMapRef.current.setZoom(16);
      markerRef.current.setPosition(pos);
      updateAuxiliaryMarkersAndBounds(googleMapRef.current, lat, lng);
      reverseGeocode(lat, lng, isApproximate);
    } else {
      createMap(lat, lng);
      reverseGeocode(lat, lng, isApproximate);
    }
  };

  const handleUpdateMyLocation = async () => {
    setIsUpdatingYou(true);
    try {
      const res = await locationFlow.ensure();
      if (res.granted && res.data && isValidCoords(res.data.latitude, res.data.longitude)) {
        const newCoords = { lat: res.data.latitude, lng: res.data.longitude };
        setYouCoords(newCoords);
        try {
          sessionStorage.setItem(
            'lastKnownLocation',
            JSON.stringify({
              lat: res.data.latitude,
              lng: res.data.longitude,
              accuracy: res.data.accuracy,
              ts: Date.now(),
            })
          );
        } catch { /* ignore */ }

        if (googleMapRef.current && markerRef.current) {
          const custPos = markerRef.current.getPosition();
          if (custPos) {
            updateAuxiliaryMarkersAndBounds(googleMapRef.current, custPos.lat(), custPos.lng());
          }
        }
        toast({
          title: 'Location Updated',
          description: 'Your current location has been refreshed on the map.',
        });
      }
    } catch (err: any) {
      console.warn('Could not update your location:', err);
    } finally {
      setIsUpdatingYou(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const res = await locationFlow.ensure();
      if (res.granted && res.data) {
        setShowIpFallback(false);
        applyCoordinates(res.data.latitude, res.data.longitude, false);
      } else {
        setShowIpFallback(true);
      }
    } catch {
      setShowIpFallback(true);
    } finally {
      setIsLocating(false);
    }
  };

  const handleUseIpLocation = async () => {
    setIsLocating(true);
    try {
      const res = await DevicePermissionService.ipLocationFallback();
      if (res.granted && res.data) {
        applyCoordinates(res.data.latitude, res.data.longitude, true);
        toast({
          title: 'Approximate Location',
          description: 'Location set using IP approximation. Please verify pin on map.',
        });
      } else {
        toast({
          title: 'Location Error',
          description: res.error || 'Could not determine IP location.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Location Error',
        description: e?.message || 'Could not determine IP location.',
        variant: 'destructive',
      });
    } finally {
      setIsLocating(false);
    }
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

              {/* Location Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 text-xs"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                >
                  {isLocating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Navigation className="w-3.5 h-3.5" />
                  )}
                  Use current location
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800"
                  onClick={handleUpdateMyLocation}
                  disabled={isUpdatingYou}
                >
                  {isUpdatingYou ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  Update my location
                </Button>
                {showIpFallback && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
                    onClick={handleUseIpLocation}
                    disabled={isLocating}
                  >
                    Use Approximate Location (IP)
                  </Button>
                )}
              </div>

              {/* Map Container */}
              <div 
                ref={mapRef} 
                className="w-full h-[400px] rounded-lg border border-border"
              />

              {/* Distances Information Banner */}
              {(officeDistanceKm != null || youDistanceKm != null) && (
                <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-muted/60 border border-border text-xs">
                  {officeDistanceKm != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                      <span className="text-muted-foreground">Office ↔ Customer:</span>
                      <strong className="font-semibold text-foreground">{officeDistanceKm.toFixed(1)} km</strong>
                    </div>
                  )}
                  {officeDistanceKm != null && youDistanceKm != null && (
                    <span className="text-border">|</span>
                  )}
                  {youDistanceKm != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      <span className="text-muted-foreground">You ↔ Customer:</span>
                      <strong className="font-semibold text-foreground">{youDistanceKm.toFixed(1)} km</strong>
                    </div>
                  )}
                </div>
              )}

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

      <PermissionModal
        open={locationFlow.phase === 'soft' || locationFlow.phase === 'blocked'}
        type="location"
        mode={locationFlow.phase === 'blocked' ? 'blocked' : 'soft'}
        busy={locationFlow.phase === 'requesting'}
        onAllow={locationFlow.onAllow}
        onCancel={() => {
          locationFlow.onCancel();
          setShowIpFallback(true);
        }}
        onRetry={locationFlow.retryAfterSettings}
        fallback={{
          label: 'Enter address manually',
          onClick: () => {
            searchInputRef.current?.focus();
          },
        }}
      />
    </Dialog>
  );
};

export default LocationDialog;