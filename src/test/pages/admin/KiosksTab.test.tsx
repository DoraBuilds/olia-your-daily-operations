import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KiosksTab, AddKioskModal, KioskCodeModal } from "@/pages/admin/KiosksTab";

const mockUseKioskDevices = vi.fn();
const mockRevokeMutate = vi.fn();
const mockCreateMutate = vi.fn();
const mockRegenerateMutate = vi.fn();

vi.mock("@/hooks/useKioskDevices", () => ({
  useKioskDevices: () => mockUseKioskDevices(),
  useRevokeKioskDevice: () => ({ mutate: mockRevokeMutate }),
  useCreateKioskDevice: () => ({ mutate: mockCreateMutate, isPending: false }),
  useRegenerateKioskCode: () => ({ mutate: mockRegenerateMutate, isPending: false }),
}));

// KiosksTab reads ?device= (the "Manage" link from a location's Devices card).
function render(ui: React.ReactElement, path = "/admin/kiosks") {
  return rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand",
    last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z",
    pairing_code: "ABCD2345", paired_at: "2026-09-21T00:00:00Z",
    ...overrides,
  };
}

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const concepts = [{ id: "c1", organization_id: "org1", name: "Trattoria Sole" }];
const locations = [
  { id: "l1", concept_id: "c1", name: "Downtown", address: "", contact_email: "", contact_phone: "", trading_hours: "", archive_threshold_days: 30 },
];

beforeEach(() => {
  mockRevokeMutate.mockReset();
  mockCreateMutate.mockReset();
  mockRegenerateMutate.mockReset();
  localStorage.clear();
});

describe("KiosksTab", () => {
  describe("search and filters", () => {
    const multiConcepts = [
      { id: "c1", organization_id: "org1", name: "Trattoria Sole" },
      { id: "c2", organization_id: "org1", name: "Burger Bar" },
    ];
    const multiLocations = [
      ...locations,
      { ...locations[0], id: "l2", concept_id: "c1", name: "Harbour" },
      { ...locations[0], id: "l3", concept_id: "c2", name: "Airport" },
    ];
    const fleet = [
      device({ id: "d1", location_id: "l1", label: "Host stand" }),
      device({ id: "d2", location_id: "l2", label: "Bar tablet" }),
      device({ id: "d3", location_id: "l3", label: "Kitchen iPad" }),
    ];

    const pick = (filterTestId: string, optionId: string) => {
      fireEvent.click(screen.getByTestId(`${filterTestId}-trigger`));
      fireEvent.click(screen.getByTestId(`${filterTestId}-option-${optionId}`));
    };

    beforeEach(() => mockUseKioskDevices.mockReturnValue({ data: fleet, isLoading: false }));

    it("search narrows devices by name", () => {
      render(<KiosksTab concepts={multiConcepts} locations={multiLocations} />);
      fireEvent.change(screen.getByTestId("devices-search"), { target: { value: "kitchen" } });
      expect(screen.getByText("Kitchen iPad")).toBeInTheDocument();
      expect(screen.queryByText("Host stand")).not.toBeInTheDocument();
      expect(screen.queryByText("Trattoria Sole")).not.toBeInTheDocument();
    });

    it("search matches the location name too", () => {
      render(<KiosksTab concepts={multiConcepts} locations={multiLocations} />);
      fireEvent.change(screen.getByTestId("devices-search"), { target: { value: "harb" } });
      expect(screen.getByText("Bar tablet")).toBeInTheDocument();
      expect(screen.queryByText("Host stand")).not.toBeInTheDocument();
    });

    it("shows a no-results message, not the empty state, when nothing matches", () => {
      render(<KiosksTab concepts={multiConcepts} locations={multiLocations} />);
      fireEvent.change(screen.getByTestId("devices-search"), { target: { value: "zzz" } });
      expect(screen.getByTestId("devices-no-results")).toBeInTheDocument();
      expect(screen.queryByText("No devices yet")).not.toBeInTheDocument();
    });

    it("concept filter applies on Apply and shows a removable chip", async () => {
      render(<KiosksTab concepts={multiConcepts} locations={multiLocations} />);
      fireEvent.click(screen.getByTestId("devices-filters-toggle"));
      pick("devices-concept-filter", "c2");
      // Staged only — nothing hidden until Apply.
      expect(screen.getByText("Host stand")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("devices-apply-filters"));
      await waitFor(() => expect(screen.queryByText("Host stand")).not.toBeInTheDocument());
      expect(screen.getByText("Kitchen iPad")).toBeInTheDocument();
      expect(screen.getByTestId("devices-filters-count")).toHaveTextContent("1");

      fireEvent.click(screen.getByRole("button", { name: "Remove filter: Burger Bar" }));
      expect(screen.getByText("Host stand")).toBeInTheDocument();
    });

    it("location filter keeps only that location's devices", async () => {
      render(<KiosksTab concepts={multiConcepts} locations={multiLocations} />);
      fireEvent.click(screen.getByTestId("devices-filters-toggle"));
      pick("devices-location-filter", "l2");
      fireEvent.click(screen.getByTestId("devices-apply-filters"));
      await waitFor(() => expect(screen.queryByText("Host stand")).not.toBeInTheDocument());
      expect(screen.getByText("Bar tablet")).toBeInTheDocument();
      expect(screen.queryByText("Kitchen iPad")).not.toBeInTheDocument();
    });
  });

  it("shows the empty state when there are no devices", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("No devices yet")).toBeInTheDocument();
  });

  it("the quiet Add link opens the add-kiosk form", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByRole("button", { name: "Add kiosk" }));
    expect(screen.getByText("Kiosk name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Downtown")).toBeInTheDocument();
  });

  it("groups devices under their concept and location", () => {
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z", pairing_code: null, paired_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("Trattoria Sole")).toBeInTheDocument();
    expect(screen.getByText("Downtown")).toBeInTheDocument();
    expect(screen.getByText("Host stand")).toBeInTheDocument();
    expect(screen.getByText("Never checked in")).toBeInTheDocument();
  });

  it("shows a device as active when it checked in recently", () => {
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Kitchen", last_seen_at: new Date().toISOString(), revoked_at: null, created_at: "2026-09-21T00:00:00Z", pairing_code: null, paired_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("Active now")).toBeInTheDocument();
  });

  it("deactivates a device after confirming", async () => {
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z", pairing_code: null, paired_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByText("Deactivate"));
    const confirmButtons = screen.getAllByText("Deactivate");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockRevokeMutate).toHaveBeenCalledWith("d1", expect.anything()));
  });

  // Regression (#824): deactivating a device from a browser that's
  // currently running AS that device left the "this browser is a kiosk"
  // banner (ConceptsTab) stuck showing stale, since revoke only ever
  // touched the server. onSuccess must clear this browser's own local
  // kiosk state when the device it just deactivated is its own.
  it("clears this browser's own kiosk state when it deactivates the device it's currently running as", async () => {
    localStorage.setItem("kiosk_device_id", "d1");
    localStorage.setItem("kiosk_location_id", "l1");
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z", pairing_code: null, paired_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByText("Deactivate"));
    const confirmButtons = screen.getAllByText("Deactivate");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockRevokeMutate).toHaveBeenCalled());

    const [, options] = mockRevokeMutate.mock.calls[0];
    options.onSuccess();

    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
    expect(localStorage.getItem("kiosk_device_id")).toBeNull();
  });

  it("leaves this browser's own kiosk state alone when deactivating a different device", async () => {
    localStorage.setItem("kiosk_device_id", "some-other-device");
    localStorage.setItem("kiosk_location_id", "l1");
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z", pairing_code: null, paired_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByText("Deactivate"));
    const confirmButtons = screen.getAllByText("Deactivate");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockRevokeMutate).toHaveBeenCalled());

    const [, options] = mockRevokeMutate.mock.calls[0];
    options.onSuccess();

    expect(localStorage.getItem("kiosk_location_id")).toBe("l1");
    expect(localStorage.getItem("kiosk_device_id")).toBe("some-other-device");
  });

  it("does not render a location group with zero devices", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.queryByText("Downtown")).not.toBeInTheDocument();
  });

  it("shows an unpaired kiosk as waiting, with its code", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device({ paired_at: null })], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("Waiting for device")).toBeInTheDocument();
    expect(screen.getByText("· ABCD-2345")).toBeInTheDocument();
  });

  it("hides owner actions from non-owners", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device()], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} isOwner={false} />);
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByText("Code")).not.toBeInTheDocument();
  });

  it("opens the code dialog from a row", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device({ paired_at: null })], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByText("Code"));
    expect(screen.getByText("ABCD-2345")).toBeInTheDocument();
    expect(screen.getByText("Open the Kiosk tab and enter this code.")).toBeInTheDocument();
  });

  it("scrolls to and highlights the device named in ?device=", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockUseKioskDevices.mockReturnValue({ data: [device()], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />, "/admin/kiosks?device=d1");
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

describe("KioskCodeModal", () => {
  it("says a paired kiosk's code has been used", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device()], isLoading: false });
    render(<KioskCodeModal deviceId="d1" locationName="Downtown" onClose={vi.fn()} />);
    expect(screen.getByText(/Paired with a tablet/)).toBeInTheDocument();
    expect(screen.getByText("ABCD-2345")).toHaveClass("line-through");
  });

  it("explains a kiosk set up before codes existed", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device({ pairing_code: null })], isLoading: false });
    render(<KioskCodeModal deviceId="d1" locationName="Downtown" onClose={vi.fn()} />);
    expect(screen.getByText("This tablet was set up before kiosk codes existed.")).toBeInTheDocument();
  });

  it("asks before issuing a new code, warning that the paired tablet disconnects", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device()], isLoading: false });
    render(<KioskCodeModal deviceId="d1" locationName="Downtown" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("New code"));
    expect(mockRegenerateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/will be disconnected within a minute/)).toBeInTheDocument();
    const buttons = screen.getAllByText("New code");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mockRegenerateMutate).toHaveBeenCalledWith("d1", expect.anything());
  });

  it("renders nothing once the device is gone", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<KioskCodeModal deviceId="d1" locationName="Downtown" onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AddKioskModal", () => {
  it("prefills the next kiosk number and creates it for the location", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device({ id: "d1" }), device({ id: "d2" })], isLoading: false });
    const onCreated = vi.fn();
    render(<AddKioskModal locationId="l1" locationName="Downtown" onClose={vi.fn()} onCreated={onCreated} />);
    const input = screen.getByDisplayValue("Kiosk 3");
    fireEvent.change(input, { target: { value: "Bar tablet" } });
    fireEvent.click(screen.getByText("Create kiosk"));
    expect(mockCreateMutate).toHaveBeenCalledWith({ locationId: "l1", label: "Bar tablet" }, expect.anything());
    mockCreateMutate.mock.calls[0][1].onSuccess({ device_id: "new-id" });
    expect(onCreated).toHaveBeenCalledWith("new-id", "Downtown");
  });

  it("lets you pick the location when opened from the Devices tab", () => {
    mockUseKioskDevices.mockReturnValue({ data: [device({ location_id: "l2" })], isLoading: false });
    const twoLocations = [...locations, { ...locations[0], id: "l2", name: "Harbour" }];
    const onCreated = vi.fn();
    render(<AddKioskModal locationOptions={twoLocations} concepts={concepts} onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.getByDisplayValue("Kiosk 1")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Downtown"), { target: { value: "l2" } });
    expect(screen.getByDisplayValue("Kiosk 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Create kiosk"));
    expect(mockCreateMutate).toHaveBeenCalledWith({ locationId: "l2", label: "Kiosk 2" }, expect.anything());
    mockCreateMutate.mock.calls[0][1].onSuccess({ device_id: "new-id" });
    expect(onCreated).toHaveBeenCalledWith("new-id", "Harbour");
  });

  it("won't create a kiosk without a name", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<AddKioskModal locationId="l1" locationName="Downtown" onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("Kiosk 1"), { target: { value: "  " } });
    fireEvent.click(screen.getByText("Create kiosk"));
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
