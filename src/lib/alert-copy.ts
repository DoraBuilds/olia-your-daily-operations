import i18n from "@/lib/i18n";

export interface AlertCopy {
  title: string;
  body: string;
  helper: string;
}

export interface AlertLike {
  type: "error" | "warn";
  message: string;
  area: string | null;
  time: string | null;
  source: string | null;
}

function cleanMessage(message: string): string {
  return message
    .replace(/^Action required:\s*/i, "")
    .replace(/^Action needed:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedSubject(message: string): string | null {
  const quoted = message.match(/"([^"]+)"/)?.[1]?.trim();
  if (quoted) return quoted.replace(/\s*-\s*$/, "").trim();

  const cleaned = cleanMessage(message);
  const split = cleaned.split(/\s+(?:answered|recorded)\s+/i)[0]?.trim();
  return split || null;
}

function formatContext(alert: AlertLike): string {
  const bits = [alert.area?.trim()].filter(Boolean) as string[];
  if (alert.time?.trim()) bits.push(alert.time.trim());
  return bits.length > 0 ? bits.join(" · ") : i18n.t("alerts.copy.contextFallback", { ns: "dashboard" });
}

export function formatOperationalAlertCopy(alert: AlertLike): AlertCopy {
  const message = alert.message.trim();
  const lower = message.toLowerCase();
  const subject = extractQuotedSubject(message);
  const t = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`alerts.copy.${key}`, { ns: "dashboard", ...options });

  if (lower.includes("outside the allowed range")) {
    const range = message.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
    const value = message.match(/recorded\s+(.+?)\s+—/i)?.[1]?.trim();
    return {
      title: t("reviewNeeded.title"),
      body: value ? t("reviewNeeded.bodyWithValue", { value }) : t("reviewNeeded.bodyGeneric"),
      helper: range ? t("reviewNeeded.helperRange", { range }) : formatContext(alert),
    };
  }

  if (/(answered\s+is\s+n\/a|no response|not provided|left blank)/i.test(message)) {
    return {
      title: t("followUp.title"),
      body: subject ? t("followUp.bodyWithSubject", { subject }) : t("followUp.bodyGeneric"),
      helper: t("followUp.helper"),
    };
  }

  if (lower.startsWith("action required") || lower.startsWith("action needed")) {
    return {
      title: t("actionNeeded.title"),
      body: subject ?? t("actionNeeded.bodyGeneric"),
      helper: t("actionNeeded.helper"),
    };
  }

  return {
    title: alert.type === "error" ? t("fallback.titleError") : t("fallback.titleWarn"),
    body: subject ?? t("fallback.bodyGeneric"),
    helper: formatContext(alert),
  };
}
