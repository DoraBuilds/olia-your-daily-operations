import "@/lib/i18n";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

describe("LanguageSwitcher", () => {
  it("shows the currently selected language", () => {
    render(<LanguageSwitcher value="en" onChange={vi.fn()} />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("renders the Spanish label when value is es", () => {
    render(<LanguageSwitcher value="es" onChange={vi.fn()} />);
    expect(screen.getByText("Español")).toBeInTheDocument();
  });

  it("lists both supported languages, each in its own endonym, when opened", () => {
    render(<LanguageSwitcher value="en" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    expect(screen.getByText("Español")).toBeInTheDocument();
  });

  it("calls onChange with the new language when an option is selected", () => {
    const onChange = vi.fn();
    render(<LanguageSwitcher value="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Español"));
    expect(onChange).toHaveBeenCalledWith("es");
  });

  it("applies a custom className to the trigger", () => {
    render(<LanguageSwitcher value="en" onChange={vi.fn()} className="custom-class" />);
    expect(screen.getByRole("combobox")).toHaveClass("custom-class");
  });
});
