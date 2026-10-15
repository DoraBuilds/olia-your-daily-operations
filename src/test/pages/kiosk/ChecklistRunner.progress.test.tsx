import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChecklistRunner } from "@/pages/Kiosk";
import { renderWithProviders } from "../../test-utils";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, teamMember: null, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock("@/hooks/useLocations", () => ({ useLocations: () => ({ allLocations: [], isFetched: true }) }));

const checklist = {
  id: "ck-progress",
  title: "Opening",
  location_id: "loc-1",
  time_of_day: "anytime" as const,
  due_time: null,
  visibility_from: null,
  visibility_until: null,
  allow_late_completion: true,
  day_end_time: null,
  questions: [
    { id: "q1", text: "Fridge checked", type: "text", required: false },
    { id: "q2", text: "Floor swept", type: "text", required: false },
  ],
};

function renderRunner(props: Record<string, unknown> = {}) {
  return renderWithProviders(
    <ChecklistRunner checklist={checklist as any} staffName="Sam" onComplete={vi.fn()} onCancel={vi.fn()} {...props} />,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("ChecklistRunner progress reporting", () => {
  it("reports how far the checklist got, with the unanswered items", async () => {
    const onProgress = vi.fn();
    renderRunner({ onProgress });
    fireEvent.change(screen.getAllByPlaceholderText("Type your answer here…")[0], { target: { value: "all good" } });

    await waitFor(() => expect(onProgress).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const progress = onProgress.mock.calls[0][0];
    expect(progress.answered).toBe(1);
    expect(progress.total).toBe(2);
    expect(progress.items).toEqual([
      expect.objectContaining({ label: "Fridge checked", done: true, answer: "all good" }),
      expect.objectContaining({ label: "Floor swept", done: false, answer: "" }),
    ]);
  });

  it("reports nothing until something is answered", async () => {
    const onProgress = vi.fn();
    renderRunner({ onProgress });
    await new Promise(r => setTimeout(r, 1800));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not report progress for a re-edit of an already completed checklist", async () => {
    const onProgress = vi.fn();
    renderRunner({ onProgress, initialAnswers: { q1: "done" } });
    fireEvent.change(screen.getAllByPlaceholderText("Type your answer here…")[1], { target: { value: "x" } });
    await new Promise(r => setTimeout(r, 1800));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("does not report a draft after the checklist has been submitted", async () => {
    const onProgress = vi.fn();
    const { unmount } = renderRunner({ onProgress });
    const boxes = screen.getAllByPlaceholderText("Type your answer here…");
    fireEvent.change(boxes[0], { target: { value: "a" } });
    fireEvent.change(boxes[1], { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: /complete checklist/i }));
    unmount();
    await new Promise(r => setTimeout(r, 1800));
    expect(onProgress).not.toHaveBeenCalled();
  });
});
