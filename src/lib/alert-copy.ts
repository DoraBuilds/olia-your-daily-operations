import i18n from "@/lib/i18n";

export interface AlertCopy {
  title: string;
  body: string;
  helper: string;
}

export interface AlertLike {
  type: "error" | "warn" | "info";
  message: string;
  area: string | null;
  time: string | null;
  source: string | null;
  created_at?: string | null;
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

function formatWhen(createdAt: string | null | undefined, fallbackTime: string | null): string | null {
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(i18n.language === "es" ? "es-ES" : "en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  const time = fallbackTime?.trim();
  return time && time.toLowerCase() !== "now" ? time : null;
}

/** "Checklist: Opening · Thu, 2 Oct, 14:32" — where and when it happened. */
function formatContext(alert: AlertLike, lead?: string): string {
  const bits = [lead, alert.area?.trim() ? i18n.t("alerts.copy.inChecklist", { ns: "dashboard", name: alert.area.trim() }) : null, formatWhen(alert.created_at, alert.time)]
    .filter(Boolean) as string[];
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
    const question = message.match(/^(.+?):\s*recorded\s/i)?.[1]?.trim();
    return {
      title: t("reviewNeeded.title"),
      body: value && question
        ? t("reviewNeeded.bodyWithQuestion", { question, value })
        : value ? t("reviewNeeded.bodyWithValue", { value }) : t("reviewNeeded.bodyGeneric"),
      helper: formatContext(alert, range ? t("reviewNeeded.helperRange", { range }) : undefined),
    };
  }

  if (/(answered\s+is\s+n\/a|no response|not provided|left blank|not answered)/i.test(message)) {
    return {
      title: t("followUp.title"),
      body: subject ? t("followUp.bodyWithSubject", { subject }) : t("followUp.bodyGeneric"),
      helper: formatContext(alert, t("followUp.helper")),
    };
  }

  if (lower.startsWith("action required") || lower.startsWith("action needed")) {
    return {
      title: t("actionNeeded.title"),
      body: subject ?? t("actionNeeded.bodyGeneric"),
      helper: formatContext(alert, t("actionNeeded.helper")),
    };
  }

  if (alert.source === "kiosk" && alert.type === "info") {
    return { title: t("notice.title"), body: message, helper: formatContext(alert) };
  }

  return {
    title: alert.type === "error" ? t("fallback.titleError") : t("fallback.titleWarn"),
    body: subject ?? t("fallback.bodyGeneric"),
    helper: formatContext(alert),
  };
}
