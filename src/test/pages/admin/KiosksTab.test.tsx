import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KiosksTab } from "@/pages/admin/KiosksTab";

const mockUseKioskDevices = vi.fn();
const mockRevokeMutate = vi.fn();

vi.mock("@/hooks/useKioskDevices", () => ({
  useKioskDevices: () => mockUseKioskDevices(),
  useRevokeKioskDevice: () => ({ mutate: mockRevokeMutate }),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const concepts = [{ id: "c1", organization_id: "org1", name: "Trattoria Sole" }];
const locations = [
  { id: "l1", concept_id: "c1", name: "Downtown", address: "", contact_email: "", contact_phone: "", trading_hours: "", archive_threshold_days: 30 },
];

beforeEach(() => {
  mockRevokeMutate.mockReset();
});

describe("KiosksTab", () => {
  it("shows the empty state when there are no devices", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("No kiosks yet")).toBeInTheDocument();
  });

  it("groups devices under their concept and location", () => {
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z" },
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
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Kitchen", last_seen_at: new Date().toISOString(), revoked_at: null, created_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.getByText("Active now")).toBeInTheDocument();
  });

  it("deactivates a device after confirming", async () => {
    mockUseKioskDevices.mockReturnValue({
      data: [
        { id: "d1", organization_id: "org1", location_id: "l1", label: "Host stand", last_seen_at: null, revoked_at: null, created_at: "2026-09-21T00:00:00Z" },
      ],
      isLoading: false,
    });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    fireEvent.click(screen.getByText("Deactivate"));
    const confirmButtons = screen.getAllByText("Deactivate");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockRevokeMutate).toHaveBeenCalledWith("d1", expect.anything()));
  });

  it("does not render a location group with zero devices", () => {
    mockUseKioskDevices.mockReturnValue({ data: [], isLoading: false });
    render(<KiosksTab concepts={concepts} locations={locations} />);
    expect(screen.queryByText("Downtown")).not.toBeInTheDocument();
  });
});
