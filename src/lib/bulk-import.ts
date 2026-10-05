// Parsing + validation for the Admin → Users bulk import (#1068). Pure helpers:
// the modal owns UI state and the RPC call. Imported people are kiosk-only
// staff, so the only columns are name, optional PIN and optional department.

export const MAX_IMPORT_ROWS = 500;
/** Rows per bulk_create_team_members call (each PIN is bcrypt-hashed at cost 12). */
export const IMPORT_CHUNK_SIZE = 25;

export interface RawImportRow {
  /** 1-based spreadsheet row number (header is row 1, so data starts at 2). */
  rowNumber: number;
  first_name: string;
  last_name: string;
  pin: string;
  department: string;
}

export type ImportIssue =
  | "firstNameRequired"
  | "pinInvalid"
  | "pinDuplicateInFile"
  | "nameDuplicate"
  | "departmentNotFound";

export interface PreviewRow {
  rowNumber: number;
  first_name: string;
  last_name: string;
  /** Explicit PIN from the file, or "" when one will be generated. */
  pin: string;
  /** The PIN cell exactly as uploaded, for the error report. */
  rawPin: string;
  department_id: string | null;
  department_name: string;
  status: "ready" | "warning" | "error";
  issues: ImportIssue[];
}

const ERROR_ISSUES: ImportIssue[] = ["firstNameRequired", "pinInvalid", "pinDuplicateInFile"];

const HEADER_ALIASES: Record<keyof Omit<RawImportRow, "rowNumber">, string[]> = {
  first_name: ["firstname", "first", "givenname", "nombre"],
  last_name: ["lastname", "last", "surname", "familyname", "apellido", "apellidos"],
  pin: ["pin", "kioskpin", "codigo"],
  department: ["department", "dept", "departamento"],
};

const normalizeHeader = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z]/g, "");

function matchColumn(header: unknown): keyof typeof HEADER_ALIASES | null {
  const key = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (key === field.replace(/_/g, "") || aliases.includes(key)) return field as keyof typeof HEADER_ALIASES;
  }
  return null;
}

/** Turns sheet rows (array of arrays, first row = headers) into raw import rows. Throws when no first_name column is found. */
export function rowsFromSheet(sheet: unknown[][]): RawImportRow[] {
  const [headers = [], ...body] = sheet;
  const columns = new Map<keyof typeof HEADER_ALIASES, number>();
  headers.forEach((h, i) => {
    const field = matchColumn(h);
    if (field && !columns.has(field)) columns.set(field, i);
  });
  if (!columns.has("first_name")) throw new Error("missingFirstNameColumn");

  const cell = (row: unknown[], field: keyof typeof HEADER_ALIASES) => {
    const i = columns.get(field);
    return i === undefined ? "" : String(row[i] ?? "").trim();
  };

  return body
    .map((row, i) => ({
      rowNumber: i + 2,
      first_name: cell(row, "first_name"),
      last_name: cell(row, "last_name"),
      pin: cell(row, "pin"),
      department: cell(row, "department"),
    }))
    // Spreadsheets often carry trailing blank rows.
    .filter(r => r.first_name || r.last_name || r.pin || r.department);
}

/** Reads a .csv or .xlsx file (first sheet). */
export async function parseImportFile(file: File): Promise<RawImportRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("emptyFile");
  // raw:false keeps cell text as displayed (numeric PINs stay digits).
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  return rowsFromSheet(rows);
}

const nameKey = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Checks every row. `existingNames` are the org's current members' full names;
 * duplicates of those (or of an earlier row) are warnings, never errors.
 * PIN collisions with existing members can't be checked here (PINs are hashed
 * server-side) and come back from the RPC per row.
 */
export function validateImportRows(
  rows: RawImportRow[],
  existingNames: string[],
  departments: { id: string; name: string }[],
): PreviewRow[] {
  const seenNames = new Set(existingNames.map(n => nameKey(n, "")));
  const departmentByName = new Map(departments.map(d => [d.name.trim().toLowerCase(), d]));
  const pinCounts = new Map<string, number>();
  for (const r of rows) {
    const pin = normalizePin(r.pin);
    if (pin) pinCounts.set(pin, (pinCounts.get(pin) ?? 0) + 1);
  }

  return rows.map(r => {
    const issues: ImportIssue[] = [];
    if (!r.first_name) issues.push("firstNameRequired");

    const pin = normalizePin(r.pin);
    if (r.pin && !/^\d{4}$/.test(pin)) issues.push("pinInvalid");
    else if (pin && (pinCounts.get(pin) ?? 0) > 1) issues.push("pinDuplicateInFile");

    const key = nameKey(r.first_name, r.last_name);
    if (r.first_name && seenNames.has(key)) issues.push("nameDuplicate");
    if (r.first_name) seenNames.add(key);

    const dep = r.department ? departmentByName.get(r.department.toLowerCase()) : undefined;
    if (r.department && !dep) issues.push("departmentNotFound");

    const status = issues.some(i => ERROR_ISSUES.includes(i)) ? "error" : issues.length ? "warning" : "ready";
    return {
      rowNumber: r.rowNumber,
      first_name: r.first_name,
      last_name: r.last_name,
      pin: /^\d{4}$/.test(pin) ? pin : "",
      rawPin: r.pin,
      department_id: dep?.id ?? null,
      department_name: dep?.name ?? "",
      status,
      issues,
    };
  });
}

/** Spreadsheets drop leading zeros from numeric cells ("0420" → "420"); restore them. */
function normalizePin(pin: string): string {
  return /^\d{1,3}$/.test(pin) ? pin.padStart(4, "0") : pin;
}

export const TEMPLATE_CSV = "first_name,last_name,pin,department\nMaria,Lopez,,Kitchen\nJames,Smith,4821,\n";

// ─── Error report ────────────────────────────────────────────────────────────

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of skipped rows: the original columns plus a reason, so it can be fixed and re-uploaded. */
export function buildErrorReport(rows: { row: PreviewRow; reason: string }[]): string {
  const lines = rows.map(({ row, reason }) =>
    [String(row.rowNumber), row.first_name, row.last_name, row.rawPin, row.department_name, reason].map(csvCell).join(","),
  );
  return ["row,first_name,last_name,pin,department,reason", ...lines].join("\n") + "\n";
}

export function downloadTextFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
