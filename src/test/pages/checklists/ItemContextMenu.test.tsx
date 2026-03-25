import { render, screen, fireEvent } from "@testing-library/react";
import { ItemContextMenu } from "@/pages/checklists/ItemContextMenu";

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

describe("ItemContextMenu - folder type", () => {
  const onAction = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    expect(screen.getByText("Rename")).toBeInTheDocument();
  });

  it("shows folder-specific actions", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    expect(screen.getByText("Move to folder")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("does not show checklist-only actions for folder type", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByText("Download as PDF")).not.toBeInTheDocument();
  });

  it("clicking Rename calls onAction with 'rename' and onClose", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    fireEvent.click(screen.getByText("Rename"));
    expect(onAction).toHaveBeenCalledWith("rename");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Delete calls onAction with 'delete'", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(onAction).toHaveBeenCalledWith("delete");
  });

  it("clicking overlay calls onClose", () => {
    render(<ItemContextMenu type="folder" onAction={onAction} onClose={onClose} />);
    const overlay = document.querySelector(".fixed.inset-0")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ItemContextMenu - checklist type", () => {
  const onAction = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ItemContextMenu type="checklist" onAction={onAction} onClose={onClose} />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("shows checklist-specific actions", () => {
    render(<ItemContextMenu type="checklist" onAction={onAction} onClose={onClose} />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Move to folder")).toBeInTheDocument();
    expect(screen.getByText("Download as PDF")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("clicking Edit calls onAction with 'edit'", () => {
    render(<ItemContextMenu type="checklist" onAction={onAction} onClose={onClose} />);
    fireEvent.click(screen.getByText("Edit"));
    expect(onAction).toHaveBeenCalledWith("edit");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Duplicate calls onAction with 'duplicate'", () => {
    render(<ItemContextMenu type="checklist" onAction={onAction} onClose={onClose} />);
    fireEvent.click(screen.getByText("Duplicate"));
    expect(onAction).toHaveBeenCalledWith("duplicate");
  });

  it("clicking Download as PDF calls onAction with 'download'", () => {
    render(<ItemContextMenu type="checklist" onAction={onAction} onClose={onClose} />);
    fireEvent.click(screen.getByText("Download as PDF"));
    expect(onAction).toHaveBeenCalledWith("download");
  });
});
