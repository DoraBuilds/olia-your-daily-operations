import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TeamMemberModal, ConfirmModal } from "@/pages/admin/SharedUI";

const { mockDepartmentsOrder } = vi.hoisted(() => ({
  mockDepartmentsOrder: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: mockDepartmentsOrder,
    }),
  },
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderModal(props: Partial<Parameters<typeof TeamMemberModal>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TeamMemberModal
        member={null}
        locations={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("TeamMemberModal", () => {
  it("keeps the generated PIN when toggling the manager-role switch", () => {
    renderModal();

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    const initialPin = pinInput.value;
    expect(initialPin).toMatch(/^\d{4}$/);

    const managerSwitch = screen.getByRole("switch");
    fireEvent.click(managerSwitch);
    expect(pinInput.value).toBe(initialPin);

    fireEvent.click(managerSwitch);
    expect(pinInput.value).toBe(initialPin);
  });

  it("keeps a manually-typed PIN when toggling the manager-role switch", () => {
    renderModal();

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    expect(pinInput.value).toBe("1234");

    fireEvent.click(screen.getByRole("switch"));
    expect(pinInput.value).toBe("1234");
  });

  it("still lets Generate produce a new PIN on demand", () => {
    renderModal();

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(pinInput.value).toMatch(/^\d{4}$/);
  });

  it("only shows the permissions list once manager role is enabled", () => {
    renderModal();
    expect(screen.queryByText("Permissions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  describe("Department picker with multiple locations (#776)", () => {
    const locations = [
      { id: "l1", name: "Main Branch" },
      { id: "l2", name: "City Centre" },
    ] as Parameters<typeof TeamMemberModal>[0]["locations"];

    beforeEach(() => {
      mockDepartmentsOrder.mockResolvedValue({
        data: [
          { id: "d1", location_id: "l1", name: "Kitchen" },
          { id: "d2", location_id: "l2", name: "Front of House" },
        ],
        error: null,
      });
    });

    it("keeps the department picker visible after a second location is selected", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));
      await waitFor(() => expect(screen.getByText("Department(s)")).toBeInTheDocument());

      fireEvent.click(screen.getByText("City Centre"));
      expect(screen.getByText("Department(s)")).toBeInTheDocument();
    });

    it("lists departments from every selected location, labeled by location", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));
      fireEvent.click(screen.getByText("City Centre"));

      await waitFor(() => {
        expect(screen.getByText("Kitchen — Main Branch")).toBeInTheDocument();
        expect(screen.getByText("Front of House — City Centre")).toBeInTheDocument();
      });
    });

    it("shows a plain department name (no location suffix) for a single selected location", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));

      await waitFor(() => expect(screen.getByText("Kitchen")).toBeInTheDocument());
      expect(screen.queryByText("Kitchen — Main Branch")).not.toBeInTheDocument();
    });

    it("allows selecting more than one department at once", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));
      fireEvent.click(screen.getByText("City Centre"));

      await waitFor(() => expect(screen.getByText("Kitchen — Main Branch")).toBeInTheDocument());
      const kitchen = screen.getByText("Kitchen — Main Branch");
      const foh = screen.getByText("Front of House — City Centre");

      fireEvent.click(kitchen);
      fireEvent.click(foh);

      expect(kitchen.closest("button")).toHaveClass("bg-sage");
      expect(foh.closest("button")).toHaveClass("bg-sage");
    });

    it("toggles a selected department off when clicked again", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));

      await waitFor(() => expect(screen.getByText("Kitchen")).toBeInTheDocument());
      const kitchen = screen.getByText("Kitchen");

      fireEvent.click(kitchen);
      expect(kitchen.closest("button")).toHaveClass("bg-sage");

      fireEvent.click(kitchen);
      expect(kitchen.closest("button")).not.toHaveClass("bg-sage");
    });

    it("selects and clears every department via the Select all / Clear all toggle", async () => {
      renderModal({ locations });
      fireEvent.click(screen.getByText("Main Branch"));
      fireEvent.click(screen.getByText("City Centre"));

      await waitFor(() => expect(screen.getByText("Kitchen — Main Branch")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Select all"));
      expect(screen.getByText("Kitchen — Main Branch").closest("button")).toHaveClass("bg-sage");
      expect(screen.getByText("Front of House — City Centre").closest("button")).toHaveClass("bg-sage");

      fireEvent.click(screen.getByText("Clear all"));
      expect(screen.getByText("Kitchen — Main Branch").closest("button")).not.toHaveClass("bg-sage");
      expect(screen.getByText("Front of House — City Centre").closest("button")).not.toHaveClass("bg-sage");
    });

    it("pre-selects every department already assigned to the member being edited", async () => {
      renderModal({
        locations,
        member: {
          id: "m1", name: "Sam", email: "sam@example.com", role: "GM",
          is_owner: false, is_manager: true, location_ids: ["l1", "l2"],
          department_ids: ["d1", "d2"], initials: "S",
          permissions: {} as any,
        } as Parameters<typeof TeamMemberModal>[0]["member"],
      });

      await waitFor(() => expect(screen.getByText("Kitchen — Main Branch")).toBeInTheDocument());
      expect(screen.getByText("Kitchen — Main Branch").closest("button")).toHaveClass("bg-sage");
      expect(screen.getByText("Front of House — City Centre").closest("button")).toHaveClass("bg-sage");
    });
  });
});

describe("ConfirmModal", () => {
  it("confirms immediately when requireDeleteText is not set", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Delete location"
        message="This cannot be undone."
        actionLabel="Delete"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables confirm until DELETE is typed when requireDeleteText is set", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Delete location"
        message="This cannot be undone."
        actionLabel="Delete"
        onClose={vi.fn()}
        onConfirm={onConfirm}
        requireDeleteText
      />
    );

    const confirmBtn = screen.getByText("Delete").closest("button") as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText("Type DELETE");
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uppercases typed text so lowercase 'delete' still matches", () => {
    render(
      <ConfirmModal
        title="Delete location"
        message="This cannot be undone."
        actionLabel="Delete"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        requireDeleteText
      />
    );

    const input = screen.getByPlaceholderText("Type DELETE") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "delete" } });
    expect(input.value).toBe("DELETE");
  });
});
