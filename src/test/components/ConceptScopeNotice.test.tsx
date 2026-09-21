import { render, screen } from "@testing-library/react";
import { ConceptScopeNotice } from "@/components/ConceptScopeNotice";

const { mockUseConceptFilter } = vi.hoisted(() => ({
  mockUseConceptFilter: vi.fn(),
}));

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: mockUseConceptFilter,
}));

describe("ConceptScopeNotice", () => {
  it("renders nothing when 'All concepts' is selected", () => {
    mockUseConceptFilter.mockReturnValue({
      concepts: [{ id: "concept-1", name: "Downtown Bistro" }],
      selectedConceptId: "all",
    });
    const { container } = render(<ConceptScopeNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected concept's name and points to the sidebar dropdown", () => {
    mockUseConceptFilter.mockReturnValue({
      concepts: [{ id: "concept-1", name: "Downtown Bistro" }],
      selectedConceptId: "concept-1",
    });
    render(<ConceptScopeNotice />);
    expect(screen.getByText(/Downtown Bistro/)).toBeInTheDocument();
    expect(screen.getByText(/change location in the sidebar/)).toBeInTheDocument();
  });

  it("renders nothing if the selected concept id no longer matches a known concept", () => {
    mockUseConceptFilter.mockReturnValue({
      concepts: [{ id: "concept-1", name: "Downtown Bistro" }],
      selectedConceptId: "concept-deleted",
    });
    const { container } = render(<ConceptScopeNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
