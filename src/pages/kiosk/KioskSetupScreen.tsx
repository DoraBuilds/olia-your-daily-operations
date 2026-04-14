import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export function KioskSetupScreen({
  onSetup,
  presetLocations,
}: {
  onSetup: (locationId: string, locationName: string) => void;
  presetLocations?: { id: string; name: string }[];
}) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(presetLocations ?? []);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(!presetLocations);

  useEffect(() => {
    if (!presetLocations) return;
    setLocations(presetLocations);
    setSelectedId((current) => current || presetLocations[0]?.id || "");
    setLoading(false);
  }, [presetLocations]);

  useEffect(() => {
    if (presetLocations) return;
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setLocations(data ?? []);
        setSelectedId(data?.[0]?.id ?? "");
        setLoading(false);
      });
  }, [presetLocations]);

  const handleLaunch = () => {
    const loc = locations.find(l => l.id === selectedId);
    onSetup(selectedId, loc?.name ?? "");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 sm:px-8 lg:px-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-full bg-sage flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-2xl font-bold font-display">O</span>
          </div>
          <h1 className="font-display text-3xl italic text-foreground tracking-tight">Olia Kiosk</h1>
          <p className="section-label mt-2 tracking-widest">Select a location to launch</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div>
            {loading ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Loading locations…</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                No locations available. Please ask an admin to add one before launching the kiosk.
              </p>
            ) : (
              <select
                id="location-select"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            id="launch-kiosk-btn"
            onClick={handleLaunch}
            disabled={!selectedId || loading || locations.length === 0}
            className={cn(
              "w-full py-4 rounded-2xl text-sm font-bold tracking-widest transition-colors uppercase",
              selectedId && !loading && locations.length > 0
                ? "bg-sage text-white hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Launch Kiosk
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-ok inline-block" />
            System Online
          </span>
        </p>
      </div>
    </div>
  );
}
