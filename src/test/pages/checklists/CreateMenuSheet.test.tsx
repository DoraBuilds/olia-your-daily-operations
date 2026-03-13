import { render, screen, fireEvent } from "@testing-library/react";
import { CreateMenuSheet } from "@/pages/checklists/CreateMenuSheet";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

describe("CreateMenuSheet", () => {
  const onClose = vi.fn();
  const onBuildOwn = vi.fn();
  const onConvertFile = vi.fn();
  const onBuildAI = vi.fn();
  const onCreateFolder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    expect(screen.getByText("Create new")).toBeInTheDocument();
  });

  it("shows all menu options", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    expect(screen.getByText("Build your own checklist")).toBeInTheDocument();
    expect(screen.getByText("Convert file")).toBeInTheDocument();
    expect(screen.getByText("Build with AI")).toBeInTheDocument();
    expect(screen.getByText("Create a folder")).toBeInTheDocument();
  });

  it("shows sublabel for Convert file", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    expect(screen.getByText("Excel, image or PDF")).toBeInTheDocument();
  });

  it("clicking close button calls onClose", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Build your own calls onBuildOwn and onClose", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    fireEvent.click(screen.getByText("Build your own checklist"));
    expect(onBuildOwn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Convert file calls onConvertFile and onClose", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    fireEvent.click(screen.getByText("Convert file"));
    expect(onConvertFile).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Build with AI calls onBuildAI and onClose", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    fireEvent.click(screen.getByText("Build with AI"));
    expect(onBuildAI).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Create a folder calls onCreateFolder and onClose", () => {
    render(
      <CreateMenuSheet
        onClose={onClose}
        onBuildOwn={onBuildOwn}
        onConvertFile={onConvertFile}
        onBuildAI={onBuildAI}
        onCreateFolder={onCreateFolder}
      />
    );
    fireEvent.click(screen.getByText("Create a folder"));
    expect(onCreateFolder).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
