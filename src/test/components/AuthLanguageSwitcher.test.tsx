import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

describe("AuthLanguageSwitcher", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => i18n.changeLanguage("en"));

  it("switches the page language and carries the choice into the app", () => {
    render(<AuthLanguageSwitcher />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Español"));

    expect(i18n.language).toBe("es");
    expect(localStorage.getItem("olia_language")).toBe("es");
    expect(localStorage.getItem("olia_language_pending")).toBe("es");
  });
});
