import { Trans } from "react-i18next";
import { useConceptFilter, ALL_CONCEPTS } from "@/contexts/ConceptFilterContext";

/** Small inline hint shown on pages narrowed by the sidebar's Concept filter, so it's
 *  obvious *why* the data looks scoped and where to change it. Renders nothing under
 *  "All concepts" (nothing is being narrowed) or before a concept is resolved. */
export function ConceptScopeNotice() {
  const { concepts, selectedConceptId } = useConceptFilter();
  if (selectedConceptId === ALL_CONCEPTS) return null;

  const concept = concepts.find(c => c.id === selectedConceptId);
  if (!concept) return null;

  return (
    <p className="text-xs italic text-muted-foreground text-center">
      (
      <Trans
        i18nKey="conceptFilter.scopeNotice"
        values={{ name: concept.name }}
        components={{ bold: <span className="font-bold text-[hsl(var(--powder-blue-deep))]" /> }}
      />
      )
    </p>
  );
}
