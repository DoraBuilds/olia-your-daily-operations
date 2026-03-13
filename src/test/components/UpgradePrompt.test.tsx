import { screen, fireEvent } from "@testing-library/react";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { PLAN_LABELS } from "@/lib/plan-features";
import { renderWithProviders } from "../test-utils";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

describe("UpgradePrompt", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it("renders the feature name", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    expect(screen.getByText("AI checklist builder")).toBeInTheDocument();
  });

  it("renders the PLAN_LABELS for the required plan (default: growth)", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    expect(screen.getByText(PLAN_LABELS["growth"])).toBeInTheDocument();
  });

  it("renders the PLAN_LABELS for enterprise plan when specified", () => {
    renderWithProviders(
      <UpgradePrompt feature="Priority support" requiredPlan="enterprise" onClose={onClose} />
    );
    expect(screen.getByText(PLAN_LABELS["enterprise"])).toBeInTheDocument();
  });

  it("calls onClose when 'Not now' button is clicked", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    fireEvent.click(screen.getByText("Not now"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when X button is clicked", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    // The X button has an SVG inside — find it by role button or by aria label
    const closeBtn = document.querySelector("button[class*='rounded-full']");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose and navigates when 'See plans' is clicked", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    fireEvent.click(screen.getByText("See plans"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders 'Upgrade to unlock' heading", () => {
    renderWithProviders(
      <UpgradePrompt feature="File conversion" onClose={onClose} />
    );
    expect(screen.getByText("Upgrade to unlock")).toBeInTheDocument();
  });
});
