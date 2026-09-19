import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { useConceptFilter, ALL_CONCEPTS } from "@/contexts/ConceptFilterContext";

/** Small inline hint shown on pages narrowed by the sidebar's Concept filter, so it's
 *  obvious *why* the data looks scoped and where to change it. Renders nothing under
 *  "All concepts" (nothing is being narrowed) or before a concept is resolved. */
export function ConceptScopeNotice() {
  const { t } = useTranslation();
  const { concepts, selectedConceptId } = useConceptFilter();
  if (selectedConceptId === ALL_CONCEPTS) return null;

  const concept = concepts.find(c => c.id === selectedConceptId);
  if (!concept) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--powder-blue))]/25 bg-[hsl(var(--powder-blue-light))] px-3 py-2">
      <Info size={14} className="text-[hsl(var(--powder-blue-deep))] shrink-0" />
      <p className="text-xs text-[hsl(var(--powder-blue-deep))]">
        {t("conceptFilter.scopeNotice", { name: concept.name })}
      </p>
    </div>
  );
}
