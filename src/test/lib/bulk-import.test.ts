import { buildErrorReport, rowsFromSheet, validateImportRows } from "@/lib/bulk-import";

const deps = [{ id: "d-kitchen", name: "Kitchen" }, { id: "d-bar", name: "Bar" }];

describe("rowsFromSheet", () => {
  it("maps headers case-insensitively, with aliases, and drops blank rows", () => {
    const rows = rowsFromSheet([
      ["First Name", "Apellido", "PIN", "Departamento"],
      ["Maria", "Lopez", "", "Kitchen"],
      ["", "", "", ""],
      ["James", "", "4821", ""],
    ]);
    expect(rows).toEqual([
      { rowNumber: 2, first_name: "Maria", last_name: "Lopez", pin: "", department: "Kitchen" },
      { rowNumber: 4, first_name: "James", last_name: "", pin: "4821", department: "" },
    ]);
  });

  it("works without the optional columns", () => {
    const rows = rowsFromSheet([["first_name"], ["Ana"]]);
    expect(rows[0]).toMatchObject({ first_name: "Ana", last_name: "", pin: "", department: "" });
  });

  it("throws when there is no first_name column", () => {
    expect(() => rowsFromSheet([["name"], ["Ana"]])).toThrow("missingFirstNameColumn");
  });
});

describe("validateImportRows", () => {
  const raw = (over: Partial<Parameters<typeof validateImportRows>[0][number]> = {}) => ({
    rowNumber: 2, first_name: "Ana", last_name: "Ruiz", pin: "", department: "", ...over,
  });

  it("marks a clean row ready and leaves PIN blank for generation", () => {
    const [r] = validateImportRows([raw()], [], deps);
    expect(r).toMatchObject({ status: "ready", pin: "", department_id: null, issues: [] });
  });

  it("errors on a missing first name", () => {
    const [r] = validateImportRows([raw({ first_name: "" })], [], deps);
    expect(r.status).toBe("error");
    expect(r.issues).toContain("firstNameRequired");
  });

  it("errors on an invalid PIN and keeps the raw value for the report", () => {
    const [r] = validateImportRows([raw({ pin: "12ab" })], [], deps);
    expect(r.status).toBe("error");
    expect(r.issues).toContain("pinInvalid");
    expect(r.rawPin).toBe("12ab");
  });

  it("restores leading zeros dropped by spreadsheets", () => {
    const [r] = validateImportRows([raw({ pin: "420" })], [], deps);
    expect(r.pin).toBe("0420");
    expect(r.status).toBe("ready");
  });

  it("errors on every row sharing a PIN within the file", () => {
    const rows = validateImportRows([raw({ pin: "1234" }), raw({ rowNumber: 3, first_name: "Bo", pin: "1234" })], [], deps);
    expect(rows.map(r => r.status)).toEqual(["error", "error"]);
    expect(rows[0].issues).toContain("pinDuplicateInFile");
  });

  it("allows duplicate names with a warning (existing member and earlier row)", () => {
    const rows = validateImportRows([raw(), raw({ rowNumber: 3 })], ["Ana Ruiz"], deps);
    expect(rows.map(r => r.status)).toEqual(["warning", "warning"]);
    expect(rows[0].issues).toEqual(["nameDuplicate"]);
  });

  it("matches departments by name ignoring case, and leaves it blank when absent", () => {
    const rows = validateImportRows([raw({ department: "kitchen" }), raw({ rowNumber: 3, first_name: "Bo", department: "" })], [], deps);
    expect(rows[0]).toMatchObject({ department_id: "d-kitchen", department_name: "Kitchen", status: "ready" });
    expect(rows[1].department_id).toBeNull();
  });

  it("warns, but still imports, when the department does not exist", () => {
    const [r] = validateImportRows([raw({ department: "Spa" })], [], deps);
    expect(r).toMatchObject({ status: "warning", department_id: null });
    expect(r.issues).toEqual(["departmentNotFound"]);
  });
});

describe("buildErrorReport", () => {
  it("quotes cells and includes the reason", () => {
    const [row] = validateImportRows([{ rowNumber: 5, first_name: 'A "x"', last_name: "B, C", pin: "9", department: "" }], [], deps);
    const csv = buildErrorReport([{ row, reason: "PIN must be 4 digits" }]);
    expect(csv.split("\n")[0]).toBe("row,first_name,last_name,pin,department,reason");
    expect(csv.split("\n")[1]).toBe('5,"A ""x""","B, C",9,,PIN must be 4 digits');
  });
});
