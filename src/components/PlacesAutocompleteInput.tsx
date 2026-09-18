/**
 * PlacesAutocompleteInput + StaticMapPreview
 *
 * Requires VITE_GOOGLE_MAPS_API_KEY to be set in .env.local.
 * When the key is absent the address field degrades to a plain <input>.
 *
 * Required Google Cloud APIs:
 *   - Maps JavaScript API  (autocomplete widget)
 *   - Places API (New)     (place predictions + details — AutocompleteSuggestion/Place)
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
let _placesLib: any = null;
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
  script.onload = () => {
    const g = (window as any).google;
    g.maps.importLibrary("places")
      .then((lib: any) => {
        _placesLib = lib;
        _scriptStatus = "ready";
        _notifyListeners();
        _listeners.clear();
      })
      .catch(() => {
        _scriptStatus = "error";
        _notifyListeners();
        _listeners.clear();
      });
  };
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
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const sessionTokenRef = useRef<any>(null);

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

  const fetchPredictions = useCallback((input: string) => {
    if (!ready || !_placesLib || input.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new _placesLib.AutocompleteSessionToken();
    }
    setLoading(true);
    _placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: input.trim(),
      sessionToken: sessionTokenRef.current,
    })
      .then(({ suggestions }: { suggestions: any[] }) => {
        setLoading(false);
        if (suggestions?.length) {
          setPredictions(suggestions);
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      })
      .catch(() => {
        setLoading(false);
        setPredictions([]);
        setShowDropdown(false);
      });
  }, [ready]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 320);
  };

  const selectPrediction = (suggestion: any) => {
    setShowDropdown(false);
    setPredictions([]);
    const prediction = suggestion.placePrediction;
    onChange(prediction.text.text);

    const place = prediction.toPlace();
    place
      .fetchFields({ fields: ["location", "formattedAddress", "id", "regularOpeningHours"] })
      .then(() => {
        onPlaceSelect({
          address: place.formattedAddress ?? prediction.text.text,
          lat: place.location.lat(),
          lng: place.location.lng(),
          placeId: place.id,
          openingHoursText: place.regularOpeningHours?.weekdayDescriptions ?? null,
        });
        // New search session for the next lookup, per Google's session-token billing model
        sessionTokenRef.current = null;
      })
      .catch(() => {
        // Place details fetch failed - leave the text filled in, no coordinates
      });
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
          {predictions.slice(0, 5).map(s => {
            const prediction = s.placePrediction;
            return (
              <button
                key={prediction.placeId}
                type="button"
                onClick={() => selectPrediction(s)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <MapPin size={13} className="text-sage mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-foreground leading-snug">
                    {prediction.mainText?.text ?? prediction.text.text}
                  </p>
                  {prediction.secondaryText?.text && (
                    <p className="text-xs text-muted-foreground leading-snug">
                      {prediction.secondaryText.text}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
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
  return (
    <div className={cn("rounded-xl overflow-hidden border border-border", className)} style={{ height: 160 }}>
      <iframe
        title="Location map preview"
        src={
          `https://www.openstreetmap.org/export/embed.html` +
          `?bbox=${lng - 0.003},${lat - 0.002},${lng + 0.003},${lat + 0.002}` +
          `&layer=mapnik&marker=${lat},${lng}`
        }
        className="w-full h-full border-0 pointer-events-none"
        loading="lazy"
      />
    </div>
  );
}
