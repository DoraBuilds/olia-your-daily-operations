import { renderHook, act } from "@testing-library/react";
import { useToast, toast, reducer } from "@/hooks/use-toast";

describe("reducer", () => {
  const initialState = { toasts: [] };

  it("ADD_TOAST adds a toast to state", () => {
    const newToast = { id: "1", title: "Hello", open: true, onOpenChange: vi.fn() };
    const next = reducer(initialState, { type: "ADD_TOAST", toast: newToast });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].title).toBe("Hello");
  });

  it("ADD_TOAST respects TOAST_LIMIT of 1", () => {
    const state = {
      toasts: [{ id: "1", title: "First", open: true, onOpenChange: vi.fn() }],
    };
    const newToast = { id: "2", title: "Second", open: true, onOpenChange: vi.fn() };
    const next = reducer(state, { type: "ADD_TOAST", toast: newToast });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].title).toBe("Second");
  });

  it("UPDATE_TOAST updates an existing toast", () => {
    const state = {
      toasts: [{ id: "1", title: "Original", open: true, onOpenChange: vi.fn() }],
    };
    const next = reducer(state, { type: "UPDATE_TOAST", toast: { id: "1", title: "Updated" } });
    expect(next.toasts[0].title).toBe("Updated");
  });

  it("UPDATE_TOAST does not change other toasts", () => {
    const state = {
      toasts: [
        { id: "1", title: "First", open: true, onOpenChange: vi.fn() },
      ],
    };
    const next = reducer(state, { type: "UPDATE_TOAST", toast: { id: "99", title: "Other" } });
    expect(next.toasts[0].title).toBe("First");
  });

  it("DISMISS_TOAST sets open to false for a specific toast", () => {
    const state = {
      toasts: [{ id: "1", title: "Hello", open: true, onOpenChange: vi.fn() }],
    };
    const next = reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
    expect(next.toasts[0].open).toBe(false);
  });

  it("DISMISS_TOAST with no ID dismisses all", () => {
    const state = {
      toasts: [
        { id: "1", title: "First", open: true, onOpenChange: vi.fn() },
      ],
    };
    const next = reducer(state, { type: "DISMISS_TOAST" });
    expect(next.toasts[0].open).toBe(false);
  });

  it("REMOVE_TOAST removes a toast by ID", () => {
    const state = {
      toasts: [{ id: "1", title: "Hello", open: true, onOpenChange: vi.fn() }],
    };
    const next = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
    expect(next.toasts).toHaveLength(0);
  });

  it("REMOVE_TOAST with no ID clears all toasts", () => {
    const state = {
      toasts: [{ id: "1", title: "Hello", open: true, onOpenChange: vi.fn() }],
    };
    const next = reducer(state, { type: "REMOVE_TOAST" });
    expect(next.toasts).toHaveLength(0);
  });
});

describe("toast function", () => {
  it("returns id, dismiss, and update functions", () => {
    const result = toast({ title: "Test Toast" });
    expect(result).toHaveProperty("id");
    expect(typeof result.dismiss).toBe("function");
    expect(typeof result.update).toBe("function");
  });

  it("calling toast() does not throw", () => {
    expect(() => toast({ title: "Hello" })).not.toThrow();
  });

  it("returns different IDs for successive calls", () => {
    const r1 = toast({ title: "First" });
    const r2 = toast({ title: "Second" });
    expect(r1.id).not.toBe(r2.id);
  });
});

describe("useToast", () => {
  it("returns toast function", () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.toast).toBe("function");
  });

  it("returns dismiss function", () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("returns toasts array", () => {
    const { result } = renderHook(() => useToast());
    expect(Array.isArray(result.current.toasts)).toBe(true);
  });

  it("adds a toast when toast() is called", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast({ title: "Hook Toast Test" });
    });
    expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
  });

  it("dismiss function does not throw", () => {
    const { result } = renderHook(() => useToast());
    expect(() => {
      act(() => {
        result.current.dismiss();
      });
    }).not.toThrow();
  });

  it("useToast can be called multiple times without error", () => {
    const { result: r1 } = renderHook(() => useToast());
    const { result: r2 } = renderHook(() => useToast());
    expect(r1.current).toHaveProperty("toast");
    expect(r2.current).toHaveProperty("toast");
  });
});
