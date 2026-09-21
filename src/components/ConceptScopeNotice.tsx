import { useTranslation } from "react-i18next";
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
    <p className="text-xs text-muted-foreground">
      {t("conceptFilter.scopeNotice", { name: concept.name })}
    </p>
  );
}
