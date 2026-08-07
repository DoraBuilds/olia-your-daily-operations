import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export function KioskSetupScreen({
  onSetup,
  presetLocations,
}: {
  onSetup: (locationId: string, locationName: string) => void;
  presetLocations?: { id: string; name: string }[];
}) {
  const { t } = useTranslation("kiosk");
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
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-16 h-16 mx-auto mb-5" />
          <h1 className="font-display text-3xl italic text-foreground tracking-tight">{t("setup.title")}</h1>
          <p className="section-label mt-2 tracking-widest">{t("setup.subtitle")}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div>
            {loading ? (
              <p className="text-sm text-muted-foreground py-3 text-center">{t("setup.loadingLocations")}</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                {t("setup.noLocations")}
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
            {t("setup.launchButton")}
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-ok inline-block" />
            {t("systemOnline")}
          </span>
        </p>
      </div>
    </div>
  );
}
