import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConcepts } from "@/hooks/useConcepts";
import { useLocations } from "@/hooks/useLocations";
import type { Concept } from "@/lib/admin-repository";

const STORAGE_KEY = "olia_selected_concept_id";

export const ALL_CONCEPTS = "all" as const;

interface ConceptFilterContextValue {
  concepts: Concept[];
  selectedConceptId: string | typeof ALL_CONCEPTS;
  setSelectedConceptId: (id: string | typeof ALL_CONCEPTS) => void;
  /** Location ids belonging to the selected concept, or null when "All concepts" is selected (no filtering). */
  scopedLocationIds: string[] | null;
}

const ConceptFilterContext = createContext<ConceptFilterContextValue | null>(null);

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ALL_CONCEPTS;
  } catch {
    return ALL_CONCEPTS;
  }
}

export function ConceptFilterProvider({ children }: { children: React.ReactNode }) {
  const { data: concepts = [] } = useConcepts();
  const { data: locations = [] } = useLocations();
  const [selectedConceptId, setSelectedConceptIdState] = useState<string>(readStored);

  // If the stored/selected concept no longer exists (deleted, or a fresh
  // account with no concepts yet), fall back to "all" rather than silently
  // filtering everything down to nothing.
  useEffect(() => {
    if (selectedConceptId === ALL_CONCEPTS) return;
    if (concepts.length === 0) return; // still loading — don't reset yet
    if (!concepts.some(c => c.id === selectedConceptId)) {
      setSelectedConceptIdState(ALL_CONCEPTS);
    }
  }, [concepts, selectedConceptId]);

  const setSelectedConceptId = (id: string | typeof ALL_CONCEPTS) => {
    setSelectedConceptIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage unavailable — selection just won't persist across reloads.
    }
  };

  const scopedLocationIds = useMemo(() => {
    if (selectedConceptId === ALL_CONCEPTS) return null;
    return locations.filter(l => l.concept_id === selectedConceptId).map(l => l.id);
  }, [selectedConceptId, locations]);

  const value: ConceptFilterContextValue = {
    concepts,
    selectedConceptId,
    setSelectedConceptId,
    scopedLocationIds,
  };

  return <ConceptFilterContext.Provider value={value}>{children}</ConceptFilterContext.Provider>;
}

export function useConceptFilter(): ConceptFilterContextValue {
  const ctx = useContext(ConceptFilterContext);
  if (!ctx) {
    throw new Error("useConceptFilter must be used within a ConceptFilterProvider");
  }
  return ctx;
}
