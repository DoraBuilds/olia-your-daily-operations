import { screen, fireEvent } from "@testing-library/react";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { PLAN_LABELS } from "@/lib/plan-features";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();
const mockUseIsNativeApp = vi.fn().mockReturnValue(false);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

vi.mock("@/hooks/useIsNativeApp", () => ({
  useIsNativeApp: () => mockUseIsNativeApp(),
}));

describe("UpgradePrompt", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockNavigate.mockReset();
    mockUseIsNativeApp.mockReturnValue(false);
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
    const closeBtn = document.querySelector("button[class*='rounded-full']");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose and navigates when 'See plans' is clicked on web", () => {
    renderWithProviders(
      <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
    );
    fireEvent.click(screen.getByText("See plans"));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/billing");
  });

  it("renders 'Upgrade to unlock' heading", () => {
    renderWithProviders(
      <UpgradePrompt feature="File conversion" onClose={onClose} />
    );
    expect(screen.getByText("Upgrade to unlock")).toBeInTheDocument();
  });

  describe("native (iOS/Android)", () => {
    beforeEach(() => { mockUseIsNativeApp.mockReturnValue(true); });

    it("shows 'Upgrade at olia.app' link instead of 'See plans'", () => {
      renderWithProviders(
        <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
      );
      expect(screen.getByText(/Upgrade at olia\.app/i)).toBeInTheDocument();
      expect(screen.queryByText("See plans")).not.toBeInTheDocument();
    });

    it("still shows feature name and plan label on native", () => {
      renderWithProviders(
        <UpgradePrompt feature="CSV export" onClose={onClose} />
      );
      expect(screen.getByText("CSV export")).toBeInTheDocument();
      expect(screen.getByText(PLAN_LABELS["growth"])).toBeInTheDocument();
    });

    it("still shows 'Not now' button on native", () => {
      renderWithProviders(
        <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
      );
      expect(screen.getByText("Not now")).toBeInTheDocument();
    });

    it("does not navigate to /billing on native", () => {
      renderWithProviders(
        <UpgradePrompt feature="AI checklist builder" onClose={onClose} />
      );
      expect(screen.queryByText("See plans")).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
