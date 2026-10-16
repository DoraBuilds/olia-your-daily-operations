import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChecklistBuilderModal } from "@/pages/checklists/ChecklistBuilderModal";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: () => ({ data: [] }),
  useCreateAlert: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch", address: "14 Rue de la Paix, Lyon, France", concept_id: "concept-1" },
      { id: "loc-2", name: "Terrace", address: "14 Rue de la Paix (outdoor), Lyon, France", concept_id: "concept-1" },
      { id: "loc-3", name: "Riverside", address: "1 Riverside Road, Lyon, France", concept_id: "concept-2" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useDepartments", () => ({
  useDepartmentsForLocations: (locationIds: string[]) => ({
    data: [
      { id: "dept-kitchen", location_id: "loc-1", name: "Kitchen" },
      { id: "dept-bar", location_id: "loc-3", name: "Bar" },
    ].filter(d => locationIds.includes(d.location_id)),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useConcepts", () => ({
  useConcepts: () => ({ data: [
    { id: "concept-1", name: "Lyon Bistro" },
    { id: "concept-2", name: "Riverside Group" },
  ] }),
}));


const SECTIONS = [{ id: "s1", name: "Prep", questions: [{ id: "q1", text: "Fridge temp?", responseType: "checkbox", required: true }] }];

describe("ChecklistBuilderModal - autosave", () => {
  const onClose = vi.fn();
  const onAdd = vi.fn();
  const onUpdate = vi.fn();
  const onSaveDraft = vi.fn();
  const onClearDraft = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    onAdd.mockResolvedValue("cl-new");
    onUpdate.mockResolvedValue(undefined);
    onSaveDraft.mockResolvedValue(undefined);
    onClearDraft.mockResolvedValue(undefined);
  });

  const renderLive = (extra: Record<string, unknown> = {}) =>
    renderWithClient(
      <ChecklistBuilderModal
        asPage onClose={onClose} onAdd={onAdd} onUpdate={onUpdate}
        onSaveDraft={onSaveDraft} onClearDraft={onClearDraft}
        editId="cl-1" initialTitle="Opening" initialSections={SECTIONS as any} initialIsPublished
        {...extra}
      />,
    );

  const editTitle = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), { target: { value } });

  it("saves edits to a live checklist as a draft, never to the live row", async () => {
    renderLive();
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Opening v2");
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onSaveDraft).toHaveBeenCalledWith("cl-1", expect.objectContaining({ title: "Opening v2", sections: SECTIONS }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText(/^Saved at \d{1,2}:\d{2}(am|pm)$/)).toBeInTheDocument();
    expect(screen.getByTestId("builder-save-status")).toHaveTextContent(/^Saved at/);
  });

  it("does not save anything when the form is only opened", async () => {
    renderLive();
    await new Promise(r => setTimeout(r, 1300));
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("builder-save-status")).toBeNull();
  });

  it("does not create a draft when you only click around, even if the form settles after load", async () => {
    // Specific locations: the concept picker is filled in by an effect after mount.
    renderLive({ initialLocationIds: ["loc-1"] });
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    await new Promise(r => setTimeout(r, 1500));
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(screen.queryByTestId("builder-save-status")).toBeNull();
  });

  it("restores a draft, shows Unpublished changes by the Publish button and publishes it from the Publish button", async () => {
    renderLive({ initialDraft: {
      title: "Opening DRAFT", description: "", sections: SECTIONS, startDate: null, schedule: "none",
      customRecurrence: { interval: 1, unit: "week", weekDays: ["tue"], ends: "never", occurrences: 13 },
      visibilityWindowEnabled: false, visibilityFrom: "09:00", visibilityUntil: "10:00", allowLateCompletion: true,
      selectedLocationIds: [], allLocationsConceptId: null, selectedDepartmentIds: [], isPublished: true,
    } });
    expect(screen.getByPlaceholderText(/Morning Opening Checklist/)).toHaveValue("Opening DRAFT");
    expect(screen.getByTestId("builder-save-status")).toHaveTextContent("Unpublished changes");
    fireEvent.click(screen.getAllByTestId("checklist-save-button")[0]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("cl-1", expect.objectContaining({ title: "Opening DRAFT", is_published: true })));
    await waitFor(() => expect(onClearDraft).toHaveBeenCalledWith("cl-1"));
    await waitFor(() => expect(screen.getByTestId("builder-save-status")).toHaveTextContent(/^Saved at/));
  });

  it("shows Couldn't save, retrying and retries after a failure", async () => {
    onSaveDraft.mockRejectedValueOnce(new Error("offline"));
    renderLive();
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Opening v2");
    expect(await screen.findByText("Couldn't save, retrying", {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2), { timeout: 9000 });
    expect(await screen.findByText(/^Saved at \d{1,2}:\d{2}(am|pm)$/)).toBeInTheDocument();
  }, 15000);

  it("saves, then asks before leaving when there are changes", async () => {
    renderLive();
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Opening v2");
    fireEvent.click(screen.getByText("Exit"));
    expect(await screen.findByText("Leave without publishing?")).toBeInTheDocument();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Leave"));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps editing when Keep editing is chosen", async () => {
    renderLive();
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Opening v2");
    fireEvent.click(screen.getByText("Exit"));
    fireEvent.click(await screen.findByText("Keep editing"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Leave")).toBeNull();
  });

  it("leaves straight away when nothing was changed", async () => {
    renderLive();
    fireEvent.click(screen.getByText("Exit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("warns with a Leave button only when the latest edits could not be saved", async () => {
    onSaveDraft.mockRejectedValue(new Error("offline"));
    renderLive();
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Opening v2");
    fireEvent.click(screen.getByText("Exit"));
    const leave = await screen.findByText("Leave");
    expect(screen.getByText(/couldn't be saved/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(leave);
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a hidden row on the first edit of a new checklist and keeps updating it", async () => {
    renderWithClient(
      <ChecklistBuilderModal asPage onClose={onClose} onAdd={onAdd} onUpdate={onUpdate} onSaveDraft={onSaveDraft} onClearDraft={onClearDraft} />,
    );
    fireEvent.pointerDown(screen.getByPlaceholderText(/Morning Opening Checklist/));
    editTitle("Brand new");
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "Brand new", is_published: false }));
    editTitle("Brand new 2");
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("cl-new", expect.objectContaining({ title: "Brand new 2", is_published: false })), { timeout: 3000 });
    expect(onSaveDraft).not.toHaveBeenCalled();
  });
});
