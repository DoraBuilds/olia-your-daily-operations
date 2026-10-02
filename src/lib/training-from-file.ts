import { supabase } from "@/lib/supabase";
import i18n from "@/lib/i18n";
import { DOC_TYPE, extractUploadText, needsOcr } from "@/lib/file-text";

export interface TrainingFromFile {
  steps: string[];
  duration: string;
}

const t = (key: string) => i18n.t(`shared.upload.${key}`, { ns: "infohub" });

/**
 * Turns an uploaded file (already in storage at `filePath`) into training steps:
 * local text extraction, Claude OCR for scans/photos, then generate-training in document mode.
 * Throws an Error with a user-facing message when it can't.
 */
export async function trainingFromFile(file: Blob, filePath: string, fileType: string, title: string): Promise<TrainingFromFile> {
  if (fileType === DOC_TYPE) throw new Error(i18n.t("aiSheet.unsupportedDoc", { ns: "infohub" }));

  let content = await extractUploadText(file, fileType);
  if (!content && needsOcr(fileType)) {
    const { data, error } = await supabase.functions.invoke("infohub-ocr", { body: { file_path: filePath } });
    if (error || data?.error) throw new Error(i18n.t("aiSheet.ocrFailed", { ns: "infohub" }));
    content = String(data?.text ?? "").trim();
  }
  if (!content) throw new Error(i18n.t("aiSheet.notEnoughContent", { ns: "infohub" }));

  const { data, error } = await supabase.functions.invoke("generate-training", {
    body: { mode: "document", title, content },
  });
  if (error || data?.error || !Array.isArray(data?.steps) || data.steps.length === 0) {
    throw new Error(data?.error ?? t("trainingFailed"));
  }
  return { steps: data.steps, duration: data.duration ?? "5 min" };
}
