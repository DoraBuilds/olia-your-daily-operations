import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyDepartments } from "@/hooks/useDepartments";
import { useBulkCreateTeamMembers } from "@/hooks/useTeamMembers";
import { writeAuditLog } from "@/hooks/useAuditLog";
import {
  IMPORT_CHUNK_SIZE, MAX_IMPORT_ROWS, TEMPLATE_CSV,
  buildErrorReport, downloadTextFile, parseImportFile, validateImportRows,
  type PreviewRow,
} from "@/lib/bulk-import";
import { BottomSheet, ModalHeader } from "./SharedUI";

type Step = "pick" | "preview" | "importing" | "done";

const SERVER_ISSUE: Record<string, string> = {
  pin_taken: "pinTaken",
  pin_invalid: "pinInvalid",
  no_pin_available: "noPinAvailable",
  first_name_required: "firstNameRequired",
};

export function BulkImportModal({ existingNames, onClose }: { existingNames: string[]; onClose: () => void }) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  const { data: departments = [] } = useCompanyDepartments();
  const bulkCreate = useBulkCreateTeamMembers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("pick");
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [progress, setProgress] = useState(0);
  // Rows the server rejected, keyed by rowNumber → issue key.
  const [serverErrors, setServerErrors] = useState<Map<number, string>>(new Map());
  const [importedCount, setImportedCount] = useState(0);

  const importable = rows.filter(r => r.status !== "error");
  const counts = {
    ready: rows.filter(r => r.status === "ready").length,
    warnings: rows.filter(r => r.status === "warning").length,
    errors: rows.filter(r => r.status === "error").length,
  };

  const reset = () => {
    setStep("pick"); setRows([]); setFileError(null); setServerErrors(new Map()); setProgress(0); setImportedCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const raw = await parseImportFile(file);
      if (raw.length === 0) { setFileError(t("bulkImport.fileErrors.noRows")); return; }
      if (raw.length > MAX_IMPORT_ROWS) {
        setFileError(t("bulkImport.fileErrors.tooManyRows", { count: raw.length, max: MAX_IMPORT_ROWS }));
        return;
      }
      setRows(validateImportRows(raw, existingNames, departments));
      setStep("preview");
    } catch (err) {
      const key = (err as Error).message;
      setFileError(
        key === "missingFirstNameColumn" || key === "emptyFile"
          ? t(`bulkImport.fileErrors.${key}`)
          : t("bulkImport.fileErrors.readFailed"),
      );
    }
  };

  const runImport = async () => {
    setStep("importing");
    setProgress(0);
    const failed = new Map<number, string>();
    let created = 0;
    try {
      for (let i = 0; i < importable.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = importable.slice(i, i + IMPORT_CHUNK_SIZE);
        const results = await bulkCreate.mutateAsync(chunk.map(r => ({
          idx: r.rowNumber,
          first_name: r.first_name,
          last_name: r.last_name,
          pin: r.pin || null,
          department_id: r.department_id,
        })));
        for (const res of results) {
          if (res.status === "created") created += 1;
          else failed.set(res.idx, SERVER_ISSUE[res.error ?? ""] ?? "generic");
        }
        setProgress(Math.min(i + IMPORT_CHUNK_SIZE, importable.length));
      }
    } catch (err) {
      toast.error(t("bulkImport.toastFailed", { error: (err as Error).message }));
    }
    setServerErrors(failed);
    setImportedCount(created);
    qc.invalidateQueries({ queryKey: ["team_members"] });
    if (created > 0 && teamMember) {
      writeAuditLog(
        { action: "bulk_import_team_members", entity_type: "team_member", entity_id: teamMember.organization_id, details: { count: created } },
        teamMember,
      );
    }
    setStep("done");
  };

  const skipped = [
    ...rows.filter(r => r.status === "error").map(r => ({ row: r, reason: t(`bulkImport.issues.${r.issues.find(i => i !== "nameDuplicate" && i !== "departmentNotFound")}`) })),
    ...rows.filter(r => serverErrors.has(r.rowNumber)).map(r => ({ row: r, reason: t(`bulkImport.issues.${serverErrors.get(r.rowNumber)}`) })),
  ];

  const statusIcon = (status: PreviewRow["status"]) =>
    status === "ready" ? <CheckCircle2 size={14} className="text-status-ok shrink-0" />
    : status === "warning" ? <AlertTriangle size={14} className="text-status-warn shrink-0" />
    : <XCircle size={14} className="text-status-error shrink-0" />;

  return (
    <BottomSheet onClose={step === "importing" ? () => {} : onClose}>
      <ModalHeader title={t("bulkImport.title")} onClose={step === "importing" ? () => {} : onClose} />

      {step === "pick" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("bulkImport.intro")}</p>
          <p className="text-xs text-muted-foreground">{t("bulkImport.columnsHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            data-testid="bulk-import-file"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted py-8 text-sm text-foreground hover:bg-muted/70 transition-colors"
          >
            <FileSpreadsheet size={18} /> {t("bulkImport.chooseFile")}
          </button>
          {fileError && <p role="alert" className="text-sm text-status-error">{fileError}</p>}
          <button
            type="button"
            onClick={() => downloadTextFile("olia-team-import-template.csv", TEMPLATE_CSV)}
            className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
          >
            <Download size={12} /> {t("bulkImport.downloadTemplate")}
          </button>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p data-testid="bulk-import-summary" className="text-sm text-foreground">
            {t("bulkImport.summary", counts)}
          </p>
          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border divide-y divide-border">
            <div className="grid grid-cols-[2rem_1fr_4.5rem_1fr] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground sticky top-0 bg-card">
              <span>{t("bulkImport.columns.row")}</span>
              <span>{t("bulkImport.columns.name")}</span>
              <span>{t("bulkImport.columns.pin")}</span>
              <span>{t("bulkImport.columns.department")}</span>
            </div>
            {rows.map(r => (
              <div key={r.rowNumber} data-testid={`bulk-row-${r.rowNumber}`} className="px-3 py-2 text-sm">
                <div className="grid grid-cols-[2rem_1fr_4.5rem_1fr] gap-2 items-center">
                  <span className="text-xs text-muted-foreground">{r.rowNumber}</span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    {statusIcon(r.status)}
                    <span className="truncate">{`${r.first_name} ${r.last_name}`.trim() || "-"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{r.pin || t("bulkImport.pinGenerated")}</span>
                  <span className="text-xs text-muted-foreground truncate">{r.department_name || "-"}</span>
                </div>
                {r.issues.length > 0 && (
                  <p className={`mt-0.5 pl-[2.5rem] text-xs ${r.status === "error" ? "text-status-error" : "text-status-warn"}`}>
                    {r.issues.map(i => t(`bulkImport.issues.${i}`)).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={reset} className="text-sm text-muted-foreground hover:underline">
              {t("bulkImport.chooseAnother")}
            </button>
            <button
              type="button"
              disabled={importable.length === 0}
              onClick={runImport}
              className="rounded-xl bg-sage px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-sage-deep disabled:opacity-40 transition-colors"
            >
              {t("bulkImport.import", { count: importable.length })}
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="space-y-3 py-6" role="status">
          <p className="text-sm text-foreground">{t("bulkImport.importing", { done: progress, total: importable.length })}</p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-sage transition-all" style={{ width: `${importable.length ? (progress / importable.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <p data-testid="bulk-import-done" className="text-sm font-medium text-foreground">
            {t("bulkImport.done", { count: importedCount })}
          </p>
          {skipped.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("bulkImport.doneSkipped", { count: skipped.length })}</p>
              <button
                type="button"
                onClick={() => downloadTextFile("olia-team-import-errors.csv", buildErrorReport(skipped))}
                className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
              >
                <Download size={12} /> {t("bulkImport.downloadErrors")}
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("bulkImport.doneHint")}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-sage px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-sage-deep transition-colors"
            >
              {t("bulkImport.finish")}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
