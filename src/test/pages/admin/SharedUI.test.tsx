import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TeamMemberModal, ConfirmModal } from "@/pages/admin/SharedUI";
import i18n from "@/lib/i18n";

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
        concepts={[]}
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

  it("shows first and last name side by side and saves them with the joined full name", () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    const first = screen.getByPlaceholderText("e.g. Marc");
    const last = screen.getByPlaceholderText("e.g. Devaux");
    expect(first.closest(".grid")).toBe(last.closest(".grid"));

    fireEvent.change(first, { target: { value: " Dora " } });
    fireEvent.change(last, { target: { value: "Angelov" } });
    fireEvent.click(screen.getByRole("button", { name: "Add team member" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Dora Angelov", first_name: "Dora", last_name: "Angelov", initials: "DA",
    }));
  });

  it("lets the last name be left blank but requires a first name", () => {
    const onSave = vi.fn();
    renderModal({ onSave });
    expect(screen.getByText("Last name (optional)")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Add team member" });
    fireEvent.change(screen.getByPlaceholderText("e.g. Devaux"), { target: { value: "Angelov" } });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Devaux"), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Marc"), { target: { value: "Dora" } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Dora", first_name: "Dora", last_name: null }));
  });

  it("prefills an existing member's first and last name", () => {
    const member = {
      id: "tm-9", name: "Mary Ann Lee", first_name: "Mary Ann", last_name: "Lee", email: null, role: "",
      is_owner: false, is_manager: false, location_ids: [], department_ids: [], initials: "ML", permissions: {},
    } as unknown as Parameters<typeof TeamMemberModal>[0]["member"];
    renderModal({ member });
    expect(screen.getByPlaceholderText("e.g. Marc")).toHaveValue("Mary Ann");
    expect(screen.getByPlaceholderText("e.g. Devaux")).toHaveValue("Lee");
  });

  it("splits the full name when a member has no first name stored yet", () => {
    const member = {
      id: "tm-9", name: "Jay van Dijk", email: null, role: "",
      is_owner: false, is_manager: false, location_ids: [], department_ids: [], initials: "JV", permissions: {},
    } as unknown as Parameters<typeof TeamMemberModal>[0]["member"];
    renderModal({ member });
    expect(screen.getByPlaceholderText("e.g. Marc")).toHaveValue("Jay");
    expect(screen.getByPlaceholderText("e.g. Devaux")).toHaveValue("van Dijk");
  });

  it("only shows the permissions list once manager role is enabled", () => {
    renderModal();
    expect(screen.queryByText("Permissions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  // Opens a picker's dropdown and toggles one option (#871 — searchable
  // dropdowns replaced the chip rows so 20 concepts × 20 locations still fit).
  const pick = (picker: string, optionId: string) => {
    fireEvent.click(screen.getByTestId(`member-${picker}-trigger`));
    fireEvent.click(screen.getByTestId(`member-${picker}-option-${optionId}`));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  };
  const trigger = (picker: string) => screen.getByTestId(`member-${picker}-trigger`);

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

    it("hides the department picker when no location is ticked, and shows it again after", async () => {
      renderModal({ locations });
      await waitFor(() => expect(trigger("departments")).toBeInTheDocument());

      fireEvent.click(trigger("locations"));
      fireEvent.click(screen.getByTestId("member-locations-option-all"));
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      expect(screen.queryByTestId("member-departments-trigger")).not.toBeInTheDocument();

      pick("locations", "l1");
      await waitFor(() => expect(trigger("departments")).toBeInTheDocument());
    });

    it("lists departments from every ticked location, once each by name", async () => {
      renderModal({ locations });
      await waitFor(() => expect(trigger("departments")).toBeInTheDocument());
      fireEvent.click(trigger("departments"));
      expect(screen.getByTestId("member-departments-option-d1")).toHaveTextContent("Kitchen");
      expect(screen.getByTestId("member-departments-option-d2")).toHaveTextContent("Front of House");
    });

    it("ticks every department via Select all, and clears them via Deselect all in the same row", async () => {
      const onSave = vi.fn();
      renderModal({ locations, onSave });
      await waitFor(() => expect(trigger("departments")).toHaveTextContent("No department"));

      fireEvent.click(trigger("departments"));
      fireEvent.click(screen.getByTestId("member-departments-option-all"));
      expect(trigger("departments")).toHaveTextContent("All departments");

      fireEvent.click(screen.getByTestId("member-departments-option-all"));
      expect(trigger("departments")).toHaveTextContent("No department");
    });

    it("allows selecting more than one department at once", async () => {
      const onSave = vi.fn();
      renderModal({ locations, onSave });
      await waitFor(() => expect(trigger("departments")).toBeInTheDocument());
      pick("departments", "d1");
      pick("departments", "d2");
      expect(trigger("departments")).toHaveTextContent("All departments");

      fireEvent.change(screen.getByPlaceholderText("e.g. Marc"), { target: { value: "Ana" } });
      fireEvent.click(screen.getByRole("button", { name: "Add team member" }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ department_ids: ["d1", "d2"] }));
    });

    it("toggles a selected department off when clicked again", async () => {
      renderModal({ locations });
      await waitFor(() => expect(trigger("departments")).toBeInTheDocument());
      pick("departments", "d1");
      expect(trigger("departments")).toHaveTextContent("Kitchen");

      pick("departments", "d1");
      expect(trigger("departments")).toHaveTextContent("No department");
    });

    it("pre-selects every department already assigned to the member being edited", async () => {
      renderModal({
        locations,
        member: {
          id: "m1", name: "Sam", email: "sam@example.com", role: "GM",
          is_owner: false, is_manager: true, location_ids: ["l1", "l2"],
          department_ids: ["d1"], initials: "S",
          permissions: {} as any,
        } as Parameters<typeof TeamMemberModal>[0]["member"],
      });

      await waitFor(() => expect(trigger("departments")).toHaveTextContent("Kitchen"));
    });
  });

  describe("Concept picker (#871, #877)", () => {
    const concepts = [
      { id: "c1", name: "Bistro" },
      { id: "c2", name: "Bakery" },
    ] as Parameters<typeof TeamMemberModal>[0]["concepts"];
    const locations = [
      { id: "l1", concept_id: "c1", name: "Bistro Soho" },
      { id: "l2", concept_id: "c1", name: "Bistro Shoreditch" },
      { id: "l3", concept_id: "c2", name: "Bakery Camden" },
    ] as Parameters<typeof TeamMemberModal>[0]["locations"];

    const saveAs = (name: string) => {
      fireEvent.change(screen.getByPlaceholderText("e.g. Marc"), { target: { value: name } });
      fireEvent.click(screen.getByRole("button", { name: "Add team member" }));
    };

    it("starts a new member with every concept and location ticked, saved as every location", () => {
      const onSave = vi.fn();
      renderModal({ concepts, locations, onSave });
      expect(trigger("concepts")).toHaveTextContent("All concepts");
      expect(trigger("locations")).toHaveTextContent("All locations");

      saveAs("Ana");
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ location_ids: [] }));
    });

    it("only offers the ticked concepts' locations", () => {
      renderModal({ concepts, locations });
      pick("concepts", "c2");
      fireEvent.click(trigger("locations"));
      expect(screen.getByTestId("member-locations-option-l1")).toBeInTheDocument();
      expect(screen.queryByTestId("member-locations-option-l3")).not.toBeInTheDocument();
    });

    it("derives ticked concepts from the member's locations", () => {
      renderModal({ concepts, locations, initialLocationIds: ["l3"] });
      expect(trigger("concepts")).toHaveTextContent("Bakery");
      expect(trigger("locations")).toHaveTextContent("All locations in selected concepts");
    });

    it("ticks a concept's locations when the concept is ticked, and drops them when unticked", () => {
      const onSave = vi.fn();
      renderModal({ concepts, locations, onSave, initialLocationIds: ["l3"] });
      pick("concepts", "c1");
      expect(trigger("locations")).toHaveTextContent("All locations");

      pick("concepts", "c2");
      saveAs("Ana");
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ location_ids: ["l1", "l2"] }));
    });

    it("Select all ticks every concept; the same row, now Deselect all, clears concepts and locations and blocks saving", () => {
      renderModal({ concepts, locations, initialLocationIds: ["l3"] });
      fireEvent.click(trigger("concepts"));
      fireEvent.click(screen.getByTestId("member-concepts-option-all"));
      expect(trigger("concepts")).toHaveTextContent("All concepts");

      expect(screen.getByTestId("member-concepts-option-all")).toHaveTextContent("Deselect all");
      fireEvent.click(screen.getByTestId("member-concepts-option-all"));
      expect(trigger("concepts")).toHaveTextContent("Select concepts");
      expect(trigger("locations")).toHaveTextContent("Select at least one location");

      fireEvent.change(screen.getByPlaceholderText("e.g. Marc"), { target: { value: "Ana" } });
      expect(screen.getByRole("button", { name: "Add team member" })).toBeDisabled();
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

  it("asks for the translated word (ELIMINAR) in Spanish", async () => {
    await i18n.changeLanguage("es");
    try {
      const onConfirm = vi.fn();
      render(
        <ConfirmModal
          title="Eliminar ubicación"
          message="No se puede deshacer."
          actionLabel="Eliminar"
          onClose={vi.fn()}
          onConfirm={onConfirm}
          requireDeleteText
        />
      );

      expect(screen.getByText("ELIMINAR")).toBeInTheDocument();
      const confirmBtn = screen.getByText("Eliminar").closest("button") as HTMLButtonElement;
      const input = screen.getByPlaceholderText("Escribe ELIMINAR");

      fireEvent.change(input, { target: { value: "delete" } });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(input, { target: { value: "eliminar" } });
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
