/**
 * PlacesAutocompleteInput + StaticMapPreview
 *
 * Requires VITE_GOOGLE_MAPS_API_KEY to be set in .env.local.
 * When the key is absent the address field degrades to a plain <input>.
 *
 * Required Google Cloud APIs:
 *   - Maps JavaScript API  (autocomplete widget)
 *   - Places API           (place predictions + details)
 *   - Maps Static API      (mini map preview image)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MapPin, Loader2 } from "lucide-react";
import { runtimeConfig } from "@/lib/runtime-config";

const API_KEY = runtimeConfig.googleMapsApiKey;

// ── Module-level singleton script loader ─────────────────────────────────────
// Ensures the script tag is only inserted once across all component mounts.

type ScriptStatus = "unavailable" | "idle" | "loading" | "ready" | "error";

let _scriptStatus: ScriptStatus = API_KEY ? "idle" : "unavailable";
const _listeners = new Set<() => void>();

function _notifyListeners() {
  _listeners.forEach(fn => fn());
}

function ensureGoogleMapsScript() {
  if (_scriptStatus !== "idle") return;
  if (document.getElementById("olia-gmaps")) {
    _scriptStatus = "ready";
    _notifyListeners();
    return;
  }
  _scriptStatus = "loading";
  const script = document.createElement("script");
  script.id = "olia-gmaps";
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&loading=async`;
  script.async = true;
  script.onload = () => { _scriptStatus = "ready";  _notifyListeners(); _listeners.clear(); };
  script.onerror = () => { _scriptStatus = "error";  _notifyListeners(); _listeners.clear(); };
  document.head.appendChild(script);
}

function useGoogleMapsReady(): boolean {
  const [ready, setReady] = useState(() => _scriptStatus === "ready");

  useEffect(() => {
    if (_scriptStatus === "ready") { setReady(true); return; }
    if (_scriptStatus === "unavailable") return;

    const notify = () => setReady(_scriptStatus === "ready");
    _listeners.add(notify);
    ensureGoogleMapsScript();
    return () => { _listeners.delete(notify); };
  }, []);

  return ready;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  openingHoursText?: string[] | null;
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
}

// ── PlacesAutocompleteInput ───────────────────────────────────────────────────

interface PlacesAutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  className?: string;
  placeholder?: string;
}

export function PlacesAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
  className,
  placeholder = "e.g. 14 Rue de la Paix, Lyon",
}: PlacesAutocompleteInputProps) {
  const ready = useGoogleMapsReady();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcRef = useRef<any>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getAutocompleteService = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!ready || !g?.maps?.places) return null;
    if (!svcRef.current) {
      svcRef.current = new g.maps.places.AutocompleteService();
    }
    return svcRef.current;
  }, [ready]);

  const fetchPredictions = useCallback((input: string) => {
    const svc = getAutocompleteService();
    if (!svc || input.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    svc.getPlacePredictions(
      { input: input.trim() },
      (results: Prediction[] | null, status: string) => {
        setLoading(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const OK = (window as any).google.maps.places.PlacesServiceStatus.OK;
        if (status === OK && results?.length) {
          setPredictions(results);
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      },
    );
  }, [getAutocompleteService]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 320);
  };

  const selectPrediction = (p: Prediction) => {
    setShowDropdown(false);
    setPredictions([]);
    onChange(p.description);

    // Fetch place details to get lat/lng
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    const helperDiv = document.createElement("div");
    const placeSvc = new g.maps.places.PlacesService(helperDiv);
    placeSvc.getDetails(
      { placeId: p.place_id, fields: ["geometry", "formatted_address", "place_id", "opening_hours"] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (place: any, status: string) => {
        if (status === g.maps.places.PlacesServiceStatus.OK && place?.geometry) {
          onPlaceSelect({
            address: place.formatted_address ?? p.description,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id,
            openingHoursText: place.opening_hours?.weekday_text ?? null,
          });
        }
      },
    );
  };

  // Graceful fallback when no API key is configured
  if (!API_KEY) {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => { if (predictions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className={cn(className, "pr-8")}
          autoComplete="off"
        />
        {loading && (
          <Loader2
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
          />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {predictions.slice(0, 5).map(p => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => selectPrediction(p)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors"
            >
              <MapPin size={13} className="text-sage mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-foreground leading-snug">
                  {p.structured_formatting?.main_text ?? p.description}
                </p>
                {p.structured_formatting?.secondary_text && (
                  <p className="text-xs text-muted-foreground leading-snug">
                    {p.structured_formatting.secondary_text}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── StaticMapPreview ──────────────────────────────────────────────────────────

interface StaticMapPreviewProps {
  lat: number;
  lng: number;
  className?: string;
}

export function StaticMapPreview({ lat, lng, className }: StaticMapPreviewProps) {
  if (!API_KEY) return null;

  // Midnight Blue marker (#1A2A47) encoded as 0x1A2A47
  const src =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=15&size=600x200&scale=2` +
    `&markers=color:0x1A2A47%7C${lat},${lng}` +
    `&key=${API_KEY}`;

  return (
    <div className={cn("rounded-xl overflow-hidden border border-border", className)}>
      <img
        src={src}
        alt="Location map preview"
        className="w-full h-auto block"
        loading="lazy"
      />
    </div>
  );
}
