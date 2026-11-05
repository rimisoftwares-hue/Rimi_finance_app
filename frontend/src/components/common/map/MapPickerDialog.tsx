import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { GeoMap } from './GeoMap';
import type { GeoCircle, GeoMarker, LatLngTuple, ParsedAddress } from './geo.types';

export interface MapPickResult {
  lat: number;
  lng: number;
  address: ParsedAddress | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: LatLngTuple | null;
  title?: string;
  description?: string;
  extraMarkers?: GeoMarker[]; // e.g. the office when picking a customer address
  extraCircles?: GeoCircle[]; // e.g. the office geofence
  onConfirm: (result: MapPickResult) => void;
}

export function MapPickerDialog({
  open,
  onOpenChange,
  value = null,
  title = 'Pick location',
  description = 'Search for a place, use your location, or click the map. Drag the pin to fine-tune.',
  extraMarkers,
  extraCircles,
  onConfirm,
}: Props) {
  const [draft, setDraft] = useState<LatLngTuple | null>(value);
  const [address, setAddress] = useState<ParsedAddress | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setAddress(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () => {
    if (!draft) return;
    onConfirm({ lat: draft[0], lng: draft[1], address });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        <GeoMap
          mode="pick"
          value={draft}
          onChange={setDraft}
          fetchAddress
          onAddress={setAddress}
          markers={extraMarkers}
          circles={extraCircles}
          height="60vh"
        />
        <DialogFooter className="border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={!draft}>
            <Check className="mr-1 h-4 w-4" /> Use this location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

