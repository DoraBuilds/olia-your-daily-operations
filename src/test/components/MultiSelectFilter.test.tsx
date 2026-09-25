import { render, screen, fireEvent } from "@testing-library/react";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";

const OPTIONS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma", sublabel: "Main Branch" },
];

function renderFilter(overrides: Partial<Parameters<typeof MultiSelectFilter>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <MultiSelectFilter
      testId="test-filter"
      options={OPTIONS}
      selected={[]}
      onChange={onChange}
      allLabel="All items"
      renderSelectedSummary={opts => opts.length === 1 ? opts[0].label : `${opts.length} selected`}
      searchPlaceholder="Search…"
      noMatchLabel="No matches"
      noOptionsLabel="Nothing available"
      {...overrides}
    />
  );
  return { onChange };
}

describe("MultiSelectFilter", () => {
  it("shows the 'all' label on the trigger when nothing is selected", () => {
    renderFilter();
    expect(screen.getByTestId("test-filter-trigger")).toHaveTextContent("All items");
  });

  it("shows the single option's label on the trigger when one is selected", () => {
    renderFilter({ selected: ["b"] });
    expect(screen.getByTestId("test-filter-trigger")).toHaveTextContent("Beta");
  });

  it("shows the count summary on the trigger when multiple are selected", () => {
    renderFilter({ selected: ["a", "b"] });
    expect(screen.getByTestId("test-filter-trigger")).toHaveTextContent("2 selected");
  });

  it("opens the option list on trigger click and lists every option", () => {
    renderFilter();
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    expect(screen.getByTestId("test-filter-option-a")).toBeInTheDocument();
    expect(screen.getByTestId("test-filter-option-b")).toBeInTheDocument();
    expect(screen.getByTestId("test-filter-option-c")).toBeInTheDocument();
  });

  it("calls onChange adding an id when an unselected option is clicked", () => {
    const { onChange } = renderFilter({ selected: ["a"] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    fireEvent.click(screen.getByTestId("test-filter-option-b"));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("calls onChange removing an id when a selected option is clicked again", () => {
    const { onChange } = renderFilter({ selected: ["a", "b"] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    fireEvent.click(screen.getByTestId("test-filter-option-a"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with an empty array when the 'All' option is clicked", () => {
    const { onChange } = renderFilter({ selected: ["a", "b"] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    fireEvent.click(screen.getByTestId("test-filter-option-all"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows the noOptionsLabel when there are no options at all", () => {
    renderFilter({ options: [] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    expect(screen.getByText("Nothing available")).toBeInTheDocument();
  });

  it("renders a sublabel alongside an option's label when provided", () => {
    renderFilter();
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    expect(screen.getByTestId("test-filter-option-c")).toHaveTextContent("Gamma");
    expect(screen.getByTestId("test-filter-option-c")).toHaveTextContent("Main Branch");
  });

  it("does not render a search input for six or fewer options", () => {
    renderFilter();
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("renders a search input and filters options once there are more than six", () => {
    const manyOptions = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, label: `Option ${i}` }));
    renderFilter({ options: manyOptions });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    const search = screen.getByPlaceholderText("Search…");
    fireEvent.change(search, { target: { value: "Option 3" } });
    expect(screen.getByTestId("test-filter-option-id3")).toBeInTheDocument();
    expect(screen.queryByTestId("test-filter-option-id0")).not.toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", () => {
    renderFilter({ disabled: true });
    expect(screen.getByTestId("test-filter-trigger")).toBeDisabled();
  });

  it("keeps the All label on the top row in filter mode (#877)", () => {
    renderFilter({ selected: ["a"] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    expect(screen.getByTestId("test-filter-option-all")).toHaveTextContent("All items");
  });

  describe("pick mode (#877)", () => {
    const pickProps = { mode: "pick" as const, noneLabel: "None picked", selectAllLabel: "Select all", deselectAllLabel: "Deselect all" };

    it("shows noneLabel when nothing is picked and allLabel when everything is", () => {
      renderFilter({ ...pickProps });
      expect(screen.getByTestId("test-filter-trigger")).toHaveTextContent("None picked");
    });

    it("shows allLabel and a ticked All row when every option is picked", () => {
      renderFilter({ ...pickProps, selected: ["a", "b", "c"] });
      expect(screen.getByTestId("test-filter-trigger")).toHaveTextContent("All items");
      fireEvent.click(screen.getByTestId("test-filter-trigger"));
      const allRow = screen.getByTestId("test-filter-option-all");
      expect(allRow).toHaveTextContent("Deselect all");
      expect(allRow.querySelector("svg")).not.toBeNull();
    });

    it("All ticks every option", () => {
      const { onChange } = renderFilter({ ...pickProps, selected: ["b"] });
      fireEvent.click(screen.getByTestId("test-filter-trigger"));
      fireEvent.click(screen.getByTestId("test-filter-option-all"));
      expect(onChange).toHaveBeenCalledWith(["a", "b", "c"]);
    });

    it("All unticks everything when every option is already ticked", () => {
      const { onChange } = renderFilter({ ...pickProps, selected: ["a", "b", "c"] });
      fireEvent.click(screen.getByTestId("test-filter-trigger"));
      fireEvent.click(screen.getByTestId("test-filter-option-all"));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("the top row reads Select all until everything is ticked (#891)", () => {
      renderFilter({ ...pickProps, selected: ["a"] });
      fireEvent.click(screen.getByTestId("test-filter-trigger"));
      expect(screen.getByTestId("test-filter-option-all")).toHaveTextContent("Select all");
      expect(screen.queryByText("Deselect all")).not.toBeInTheDocument();
    });
  });

  it("marks selected rows with a tick only — no highlighted row background (#887)", () => {
    renderFilter({ selected: ["a"] });
    fireEvent.click(screen.getByTestId("test-filter-trigger"));
    const row = screen.getByTestId("test-filter-option-a");
    expect(row.querySelector("svg")).not.toBeNull();
    expect(row).not.toHaveClass("bg-sage-light");
  });
});
