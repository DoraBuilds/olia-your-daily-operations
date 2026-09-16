import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TeamMemberModal, ConfirmModal } from "@/pages/admin/SharedUI";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
