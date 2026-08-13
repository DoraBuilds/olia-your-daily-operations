import { render, screen, fireEvent } from "@testing-library/react";
import { TeamMemberModal } from "@/pages/admin/SharedUI";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("TeamMemberModal", () => {
  it("keeps the generated PIN when switching roles instead of regenerating it", () => {
    render(
      <TeamMemberModal
        member={null}
        locations={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    const initialPin = pinInput.value;
    expect(initialPin).toMatch(/^\d{4}$/);

    fireEvent.click(screen.getByRole("button", { name: "Manager" }));
    expect(pinInput.value).toBe(initialPin);

    fireEvent.click(screen.getByRole("button", { name: "Owner" }));
    expect(pinInput.value).toBe(initialPin);
  });

  it("keeps a manually-typed PIN when switching roles", () => {
    render(
      <TeamMemberModal
        member={null}
        locations={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    expect(pinInput.value).toBe("1234");

    fireEvent.click(screen.getByRole("button", { name: "Member" }));
    expect(pinInput.value).toBe("1234");
  });

  it("still lets Generate produce a new PIN on demand", () => {
    render(
      <TeamMemberModal
        member={null}
        locations={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const pinInput = screen.getByPlaceholderText("4-digit PIN") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(pinInput.value).toMatch(/^\d{4}$/);
  });
});
