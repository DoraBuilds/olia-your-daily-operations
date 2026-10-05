import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BulkImportModal } from "@/pages/admin/BulkImportModal";

const { mutateAsync, auditLog } = vi.hoisted(() => ({ mutateAsync: vi.fn(), auditLog: vi.fn() }));

vi.mock("@/hooks/useTeamMembers", () => ({ useBulkCreateTeamMembers: () => ({ mutateAsync }) }));
vi.mock("@/hooks/useDepartments", () => ({
  useCompanyDepartments: () => ({ data: [{ id: "d-kitchen", name: "Kitchen", assignments: [] }] }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ teamMember: { id: "tm-1", organization_id: "org-1" } }) }));
vi.mock("@/hooks/useAuditLog", () => ({ writeAuditLog: auditLog }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// jsdom's File has no arrayBuffer(); real browsers do.
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (this: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const csv = (text: string) => new File([text], "team.csv", { type: "text/csv" });

function renderModal(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BulkImportModal existingNames={["Ana Ruiz"]} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

const upload = (text: string) =>
  fireEvent.change(screen.getByTestId("bulk-import-file"), { target: { files: [csv(text)] } });

describe("BulkImportModal", () => {
  beforeEach(() => { mutateAsync.mockReset(); auditLog.mockReset(); });

  it("shows a preview with errors and warnings, then imports only the valid rows", async () => {
    mutateAsync.mockResolvedValue([
      { idx: 2, status: "created", id: "a" },
      { idx: 3, status: "created", id: "b" },
    ]);
    renderModal();
    upload("first_name,last_name,pin,department\nMaria,Lopez,,Kitchen\nAna,Ruiz,,\n,Nobody,,\n");

    await waitFor(() => expect(screen.getByTestId("bulk-import-summary")).toBeTruthy());
    expect(screen.getByTestId("bulk-import-summary").textContent).toBe("1 ready, 1 with warnings, 1 will be skipped");

    fireEvent.click(screen.getByRole("button", { name: /Import 2 people/ }));
    await waitFor(() => expect(screen.getByTestId("bulk-import-done").textContent).toContain("Imported 2"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toEqual([
      { idx: 2, first_name: "Maria", last_name: "Lopez", pin: null, department_id: "d-kitchen" },
      { idx: 3, first_name: "Ana", last_name: "Ruiz", pin: null, department_id: null },
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "bulk_import_team_members", details: { count: 2 } }),
      expect.anything(),
    );
    // The row with no first name was skipped and is reported.
    expect(screen.getByText("1 rows were skipped.")).toBeTruthy();
  });

  it("reports rows the server rejects (e.g. a PIN already in use)", async () => {
    mutateAsync.mockResolvedValue([{ idx: 2, status: "error", error: "pin_taken" }]);
    renderModal();
    upload("first_name,pin\nMaria,4821\n");
    await waitFor(() => screen.getByRole("button", { name: /Import 1 people/ }));
    fireEvent.click(screen.getByRole("button", { name: /Import 1 people/ }));
    await waitFor(() => expect(screen.getByTestId("bulk-import-done").textContent).toContain("Imported 0"));
    expect(screen.getByText("1 rows were skipped.")).toBeTruthy();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("sends large files in chunks", async () => {
    mutateAsync.mockImplementation(async (rows: any[]) => rows.map(r => ({ idx: r.idx, status: "created", id: String(r.idx) })));
    renderModal();
    const body = Array.from({ length: 60 }, (_, i) => `Person${i}`).join("\n");
    upload(`first_name\n${body}\n`);
    await waitFor(() => screen.getByRole("button", { name: /Import 60 people/ }));
    fireEvent.click(screen.getByRole("button", { name: /Import 60 people/ }));
    await waitFor(() => screen.getByTestId("bulk-import-done"));
    expect(mutateAsync.mock.calls.map(c => c[0].length)).toEqual([25, 25, 10]);
  });

  it("rejects a file with no first_name column", async () => {
    renderModal();
    upload("name\nAna\n");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("first_name"));
  });

  it("rejects files over the row limit", async () => {
    renderModal();
    upload(`first_name\n${Array.from({ length: 501 }, (_, i) => `P${i}`).join("\n")}\n`);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("501"));
  });

  it("accepts a dropped file", async () => {
    renderModal();
    fireEvent.drop(screen.getByTestId("bulk-import-dropzone"), { dataTransfer: { files: [csv("first_name\nAna\n")] } });
    await waitFor(() => expect(screen.getByTestId("bulk-import-summary")).toBeTruthy());
  });
});
