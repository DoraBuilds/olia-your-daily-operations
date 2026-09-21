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

  it("shows the selected concept's name in bold/teal, parenthesized, italic and centered", () => {
    mockUseConceptFilter.mockReturnValue({
      concepts: [{ id: "concept-1", name: "Downtown Bistro" }],
      selectedConceptId: "concept-1",
    });
    const { container } = render(<ConceptScopeNotice />);

    const notice = container.querySelector("p");
    expect(notice).toHaveClass("italic");
    expect(notice).toHaveClass("text-center");
    expect(notice?.textContent).toBe("(Viewing Downtown Bistro Concept - change location in the sidebar)");

    const name = screen.getByText("Downtown Bistro");
    expect(name.tagName).toBe("SPAN");
    expect(name).toHaveClass("font-bold");
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
