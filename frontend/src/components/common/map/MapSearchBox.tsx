import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { parseLatLngText } from './geo.utils';
import { searchNominatim, searchPlaces } from './geocoder';
import type { GeoSearchResult, LatLngTuple } from './geo.types';

interface MapSearchBoxProps {
  onSelect: (result: GeoSearchResult) => void;
  onClear?: () => void;
  bias?: LatLngTuple;
}

export function MapSearchBox({ onSelect, onClear, bias }: MapSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipNextSearchRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const biasKey = bias ? bias.join(',') : undefined;

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setErrorMsg(null);
      setLoading(false);
      setOpen(false);
      return;
    }

    // Check if coordinates were entered directly
    const coords = parseLatLngText(trimmed);
    if (coords) {
      setResults([
        {
          id: `coord-${coords[0]}-${coords[1]}`,
          title: `Go to ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,
          subtitle: 'Coordinates',
          position: coords,
        },
      ]);
      setErrorMsg(null);
      setLoading(false);
      setActiveIndex(0);
      setOpen(true);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setLoading(true);
    setErrorMsg(null);

    const timer = window.setTimeout(async () => {
      try {
        const places = await searchPlaces(trimmed, ac.signal, bias);
        if (!ac.signal.aborted) {
          setResults(places.slice(0, 6));
          setActiveIndex(-1);
          setOpen(true);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!ac.signal.aborted) {
          console.warn('Map search error:', err);
          setErrorMsg('Search is unavailable right now');
          setResults([]);
          setOpen(true);
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [query, biasKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (item: GeoSearchResult) => {
      skipNextSearchRef.current = true;
      setQuery(item.title);
      setOpen(false);
      setActiveIndex(-1);
      onSelect(item);
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setErrorMsg(null);
    setOpen(false);
    setActiveIndex(-1);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClear?.();
    inputRef.current?.focus();
  }, [onClear]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && results.length > 0) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open && results.length > 0) {
        setOpen(true);
        setActiveIndex(results.length - 1);
        return;
      }
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        const target = activeIndex >= 0 ? results[activeIndex] : results[0];
        handleSelect(target);
      } else if (query.trim().length >= 3 && !loading) {
        // Explicit submit fallback via Nominatim
        try {
          setLoading(true);
          setErrorMsg(null);
          const nomResults = await searchNominatim(query.trim());
          if (nomResults.length > 0) {
            setResults(nomResults.slice(0, 6));
            setActiveIndex(0);
            setOpen(true);
          } else {
            setErrorMsg('No places found');
            setResults([]);
            setOpen(true);
          }
        } catch (err: unknown) {
          console.warn('Nominatim fallback search failed:', err);
          setErrorMsg('Search is unavailable right now');
          setResults([]);
          setOpen(true);
        } finally {
          setLoading(false);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center rounded-full border border-border/80 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur focus-within:ring-2 focus-within:ring-primary/40">
        <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || errorMsg) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search places or paste coordinates"
          aria-label="Search places"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        {!loading && query && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-[1200] overflow-hidden rounded-xl border border-border bg-background/95 py-1 shadow-xl backdrop-blur">
          {errorMsg ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{errorMsg}</div>
          ) : results.length > 0 ? (
            results.map((res, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleSelect(res)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60'
                  }`}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{res.title}</p>
                    {res.subtitle && <p className="truncate text-[11px] text-muted-foreground">{res.subtitle}</p>}
                  </div>
                </button>
              );
            })
          ) : null}
        </div>
      )}
    </div>
  );
}

