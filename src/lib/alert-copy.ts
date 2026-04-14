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
  return bits.length > 0 ? bits.join(" · ") : "Open the checklist for more detail.";
}

export function formatOperationalAlertCopy(alert: AlertLike): AlertCopy {
  const message = alert.message.trim();
  const lower = message.toLowerCase();
  const subject = extractQuotedSubject(message);

  if (lower.includes("outside the allowed range")) {
    const range = message.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
    const value = message.match(/recorded\s+(.+?)\s+—/i)?.[1]?.trim();
    return {
      title: "Response needs a review",
      body: value ? `Recorded value: ${value}.` : "A recorded value is outside the expected range.",
      helper: range ? `Allowed range: ${range}.` : formatContext(alert),
    };
  }

  if (/(answered\s+is\s+n\/a|no response|not provided|left blank)/i.test(message)) {
    return {
      title: "Follow-up needed",
      body: subject ? `${subject} was left unanswered.` : "A checklist step was left unanswered.",
      helper: "A response was not provided, so this item needs attention.",
    };
  }

  if (lower.startsWith("action required") || lower.startsWith("action needed")) {
    return {
      title: "Action needed",
      body: subject ?? "A checklist step needs attention.",
      helper: "Open the checklist to review the detail.",
    };
  }

  return {
    title: alert.type === "error" ? "Needs attention" : "Check this item",
    body: subject ?? "A checklist step needs attention.",
    helper: formatContext(alert),
  };
}
