import { FileText, MessageCircle, Clock, Shuffle, ShieldX, Eye } from "lucide-react";

const PAIN_POINTS = [
  {
    Icon: FileText,
    label: "Paper checklists",
    description:
      "Signed off without being done. Lost on the pass. No way to verify after the shift.",
  },
  {
    Icon: MessageCircle,
    label: "WhatsApp chasing",
    description:
      '"Did anyone do the fridge check?" Sent at 7 pm. Read at 11 pm. Answered never.',
  },
  {
    Icon: Clock,
    label: "Missed checks",
    description:
      "A task gets skipped. Nobody notices until a customer complains — or an inspector arrives.",
  },
  {
    Icon: Shuffle,
    label: "Inconsistent shifts",
    description:
      "Monday morning runs differently to Friday night. Standards drift and nobody notices until it matters.",
  },
  {
    Icon: ShieldX,
    label: "Compliance risk",
    description:
      "Temperature logs, allergen checks, cleaning records — manually written, sometimes backdated, always fragile.",
  },
  {
    Icon: Eye,
    label: "No visibility across sites",
    description:
      "Each location does it differently. You only find out when things go wrong.",
  },
];

export function PainSection() {
  return (
    <section className="bg-card py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="section-label mb-3">Sound familiar?</p>
          <h2 className="font-display text-3xl sm:text-4xl text-foreground mb-4">
            The daily chaos that costs you more than you think.
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            Most hospitality teams manage operations with a mix of instinct, habit, and luck.
            It works — until it doesn't.
          </p>
        </div>

        {/* Pain cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAIN_POINTS.map(({ Icon, label, description }) => (
            <div
              key={label}
              className="bg-background border border-border rounded-2xl p-5 flex gap-4"
            >
              <div className="shrink-0 mt-0.5">
                <div className="w-9 h-9 rounded-xl bg-[hsl(var(--status-error-bg))] flex items-center justify-center">
                  <Icon size={17} style={{ color: "hsl(var(--status-error))" }} />
                </div>
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground mb-1">{label}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
