import { render, screen, fireEvent, within } from "@testing-library/react";
import { DepartmentsTab } from "@/pages/admin/DepartmentsTab";

const mockUseCompanyDepartments = vi.fn();
const mockSaveMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock("@/hooks/useDepartments", () => ({
  useCompanyDepartments: () => mockUseCompanyDepartments(),
  useSaveDepartment: () => ({ mutate: mockSaveMutate, isPending: false }),
  useDeleteDepartment: () => ({ mutate: mockDeleteMutate }),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const concepts = [
  { id: "cA", organization_id: "org1", name: "Trattoria" },
  { id: "cB", organization_id: "org1", name: "Sushi Bar" },
];
const loc = (id: string, concept_id: string, name: string) => ({
  id, concept_id, name, address: "", contact_email: "", contact_phone: "", trading_hours: "", archive_threshold_days: 30,
});
const locations = [loc("a1", "cA", "Downtown"), loc("a2", "cA", "Harbour"), loc("b1", "cB", "Mall")];

const member = (id: string, location_ids: string[], department_ids: string[]) => ({
  id, name: id, email: null, role: "Cook", is_owner: false, is_manager: false,
  initials: "X", location_ids, department_ids, permissions: {} as never,
});

beforeEach(() => {
  mockSaveMutate.mockReset();
  mockDeleteMutate.mockReset();
});

function renderTab(departments: unknown[], teamMembers = [] as ReturnType<typeof member>[]) {
  mockUseCompanyDepartments.mockReturnValue({ data: departments, isLoading: false });
  return render(
    <DepartmentsTab concepts={concepts} locations={locations} teamMembers={teamMembers} checklists={[]} />,
  );
}

describe("DepartmentsTab", () => {
  it("shows the empty state with an Add department CTA", () => {
    renderTab([]);
    expect(screen.getByText("Add your first department")).toBeInTheDocument();
  });

  it("shows a single chip for a company-wide department", () => {
    renderTab([{ id: "d1", name: "Kitchen", assignments: [{ concept_id: null, location_id: null }] }]);
    expect(screen.getByText("All concepts · All locations")).toBeInTheDocument();
  });

  it("summarises assignments as chips", () => {
    renderTab([
      { id: "d1", name: "Kitchen", assignments: [{ concept_id: "cA", location_id: null }, { concept_id: "cB", location_id: "b1" }] },
      { id: "d2", name: "Bar", assignments: [] },
    ]);
    const [kitchen, bar] = screen.getAllByTestId("department-row");
    expect(within(kitchen).getByText("Trattoria · All locations")).toBeInTheDocument();
    expect(within(kitchen).getByText("Sushi Bar · Mall")).toBeInTheDocument();
    expect(within(bar).getByText("Not assigned")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Departments" })).not.toBeInTheDocument();
  });

  it("defaults a new department to All concepts / All locations (company-wide)", () => {
    renderTab([{ id: "d1", name: "Kitchen", assignments: [] }]);
    fireEvent.click(screen.getByRole("button", { name: /Add department/ }));
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByTestId("department-concept-filter-trigger")).toHaveTextContent("All concepts");
    expect(screen.getByTestId("department-location-filter-trigger")).toHaveTextContent("All locations");

    fireEvent.change(screen.getByPlaceholderText("Department name…"), { target: { value: "Bar" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add department" }).at(-1)!);

    expect(mockSaveMutate).toHaveBeenCalledWith(
      { id: undefined, name: "Bar", assignments: [{ concept_id: null, location_id: null }] },
      expect.anything(),
    );
  });

  it("assigns to picked concepts, and narrows locations to those concepts", () => {
    renderTab([]);
    fireEvent.click(screen.getByRole("button", { name: /Add department/ }));
    fireEvent.change(screen.getByPlaceholderText("Department name…"), { target: { value: "Bar" } });

    fireEvent.click(screen.getByTestId("department-concept-filter-trigger"));
    fireEvent.click(screen.getByTestId("department-concept-filter-option-cB"));
    fireEvent.click(screen.getByTestId("department-location-filter-trigger"));
    expect(screen.getByTestId("department-location-filter-option-b1")).toBeInTheDocument();
    expect(screen.queryByTestId("department-location-filter-option-a1")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Add department" }).at(-1)!);
    expect(mockSaveMutate).toHaveBeenCalledWith(
      { id: undefined, name: "Bar", assignments: [{ concept_id: "cB", location_id: null }] },
      expect.anything(),
    );
  });

  it("blocks a duplicate name (case-insensitive)", () => {
    renderTab([{ id: "d1", name: "Kitchen", assignments: [] }]);
    fireEvent.click(screen.getByRole("button", { name: /Add department/ }));
    fireEvent.change(screen.getByPlaceholderText("Department name…"), { target: { value: "kitchen" } });
    expect(screen.getByText("A department with this name already exists.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add department" }).at(-1)).toBeDisabled();
  });

  it("warns before narrowing an assignment that staff rely on, and saves only after confirming", () => {
    renderTab(
      [{ id: "d1", name: "Kitchen", assignments: [{ concept_id: "cA", location_id: null }] }],
      [member("m1", ["a2"], ["d1"]), member("m2", ["a1"], ["d1"])],
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    expect(screen.getByTestId("department-concept-filter-trigger")).toHaveTextContent("Trattoria");
    fireEvent.click(screen.getByTestId("department-location-filter-trigger"));
    fireEvent.click(screen.getByTestId("department-location-filter-option-a1"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockSaveMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Remove department from locations?")).toBeInTheDocument();
    expect(screen.getByText(/1 staff member and 0 checklists use this department/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save and unassign" }));
    expect(mockSaveMutate).toHaveBeenCalledWith(
      { id: "d1", name: "Kitchen", assignments: [{ concept_id: "cA", location_id: "a1" }] },
      expect.anything(),
    );
  });

  it("deletes only after typing DELETE", () => {
    renderTab([{ id: "d1", name: "Kitchen", assignments: [] }]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Kitchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/Type DELETE/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: "d1" }, expect.anything());
  });
});
