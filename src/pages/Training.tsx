import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { ChevronLeft, ChevronRight, Play, CheckCircle, Circle, GraduationCap, Wrench, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrainingProgress, type TrainingProgressRow } from "@/hooks/useTrainingProgress";
import { TrainingAIModal } from "@/pages/TrainingAIModal";

type TrainingTab = "onboarding" | "troubleshooting";

interface TrainingModule {
  id: string;
  title: string;
  category: TrainingTab;
  duration: string;
  completed: boolean;
  steps: string[];
}

const INITIAL_MODULES: TrainingModule[] = [
  {
    id: "tr1",
    title: "How to make a latte",
    category: "onboarding",
    duration: "8 min",
    completed: false,
    steps: [
      "Grind 18–20g of espresso. Ensure a fine, consistent grind.",
      "Tamp firmly and evenly. Apply approximately 30lbs of pressure.",
      "Pull a 25–30 second shot into a pre-warmed cup.",
      "Steam 180ml of full-fat milk to 65°C. The pitcher should be warm to the touch.",
      "Swirl the milk to create a glossy, uniform texture.",
      "Pour the milk in a slow, steady motion. Tilt the cup slightly and aim for the centre of the shot.",
      "Finish with a simple latte art pattern. Present to the customer promptly.",
    ],
  },
  {
    id: "tr2",
    title: "Taking a table order",
    category: "onboarding",
    duration: "5 min",
    completed: true,
    steps: [
      "Approach the table within 2 minutes of the guests being seated.",
      "Greet the table calmly. Introduce today’s specials if applicable.",
      "Note any dietary requirements or allergies before taking the order.",
      "Repeat the order back to the table clearly.",
      "Input the order accurately into the POS system.",
      "Communicate any allergen or special requirements to the kitchen verbally.",
    ],
  },
  {
    id: "tr3",
    title: "Cash handling procedure",
    category: "onboarding",
    duration: "6 min",
    completed: false,
    steps: [
      "Count the float at the start of each shift. Record the amount.",
      "Always announce the denomination of notes received.",
      "Count change back to the customer.",
      "Do not leave the till drawer open.",
      "Report any discrepancy immediately to your manager.",
    ],
  },
  {
    id: "tr4",
    title: "Coffee machine not heating",
    category: "troubleshooting",
    duration: "3 min",
    completed: false,
    steps: [
      "Check that the machine is powered on and the power cable is secure.",
      "Verify the boiler switch is in the ON position.",
      "Allow 15 minutes for the boiler to reach temperature.",
      "If the issue persists, check for error codes on the display panel.",
      "Do not attempt to open the boiler. Contact your maintenance supplier.",
      "Log the fault in the Maintenance section of Olia.",
    ],
  },
  {
    id: "tr5",
    title: "Card terminal not connecting",
    category: "troubleshooting",
    duration: "4 min",
    completed: false,
    steps: [
      "Check Wi-Fi or cellular signal on the terminal.",
      "Restart the terminal using the power button.",
      "If on Wi-Fi, verify the router is functioning normally.",
      "Switch to a mobile data connection if available.",
      "Contact your payment provider if the issue persists.",
      "In the interim, inform customers that card payments are temporarily unavailable.",
    ],
  },
  {
    id: "tr6",
    title: "Handling a customer complaint",
    category: "troubleshooting",
    duration: "5 min",
    completed: false,
    steps: [
      "Listen to the complaint fully without interrupting.",
      "Acknowledge the issue calmly. Do not be defensive.",
      "Apologise sincerely for the experience.",
      "Offer a resolution - replacement, refund, or discount - within your authority.",
      "If escalation is needed, involve a manager immediately.",
      "Log the complaint in the incident register after resolution.",
    ],
  },
];

function completedStepSet(module: TrainingModule, progress?: TrainingProgressRow | null) {
  if (progress) {
    return new Set(progress.completed_step_indices ?? []);
  }

  return module.completed ? new Set(module.steps.map((_, i) => i)) : new Set<number>();
}

function effectiveCompletion(module: TrainingModule, progress?: TrainingProgressRow | null) {
  return progress ? progress.is_completed : module.completed;
}

function ModuleDetail({
  module,
  savedCompletedStepIndices,
  hasSavedProgress,
  onBack,
  onSaveProgress,
}: {
  module: TrainingModule;
  savedCompletedStepIndices: number[];
  hasSavedProgress: boolean;
  onBack: () => void;
  onSaveProgress: (indices: number[]) => void;
}) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => hasSavedProgress
      ? new Set(savedCompletedStepIndices)
      : (module.completed ? new Set(module.steps.map((_, i) => i)) : new Set<number>()),
  );

  useEffect(() => {
    setCompletedSteps(
      hasSavedProgress
        ? new Set(savedCompletedStepIndices)
        : (module.completed ? new Set(module.steps.map((_, i) => i)) : new Set<number>()),
    );
  }, [module.id, module.completed, module.steps.length, hasSavedProgress, savedCompletedStepIndices.join(",")]);

  const allDone = completedSteps.size === module.steps.length;

  const toggle = (i: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      onSaveProgress(Array.from(next).sort((a, b) => a - b));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-[1120px] xl:max-w-[1040px] mx-auto">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-foreground leading-tight truncate">{module.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{module.duration} · {completedSteps.size}/{module.steps.length} steps</p>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-3 sm:px-6 lg:px-8">
        {module.steps.map((step, i) => {
          const done = completedSteps.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={cn(
                "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                done ? "border-sage/30 bg-sage-light" : "border-border bg-card hover:border-sage/30",
              )}
            >
              {done
                ? <CheckCircle size={18} className="text-sage-deep mt-0.5 shrink-0" />
                : <Circle size={18} className="text-muted-foreground mt-0.5 shrink-0" />
              }
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Step {i + 1}</p>
                <p className={cn("text-sm leading-relaxed", done ? "text-sage-deep" : "text-foreground")}>{step}</p>
              </div>
            </button>
          );
        })}

        {allDone && (
          <div className="card-surface p-5 text-center border-sage/30 bg-sage-light animate-fade-in">
            <CheckCircle size={24} className="text-sage-deep mx-auto mb-2" />
            <p className="text-sm font-medium text-sage-deep">Module complete.</p>
            <p className="text-xs text-sage-deep/70 mt-1">Well done. This module has been marked as completed.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Training() {
  const [tab, setTab] = useState<TrainingTab>("onboarding");
  const [selected, setSelected] = useState<TrainingModule | null>(null);
  const [modules, setModules] = useState<TrainingModule[]>(INITIAL_MODULES);
  const [showAIModal, setShowAIModal] = useState(false);
  const { data: progressRows = [], saveProgress } = useTrainingProgress();

  if (selected) {
    const selectedProgress = progressRows.find(row => row.module_id === selected.id) ?? null;
    const selectedSteps = Array.from(completedStepSet(selected, selectedProgress));
    return (
      <ModuleDetail
        module={selected}
        savedCompletedStepIndices={selectedSteps}
        hasSavedProgress={!!selectedProgress}
        onBack={() => setSelected(null)}
        onSaveProgress={(indices) => saveProgress.mutate({
          moduleId: selected.id,
          completedStepIndices: indices,
          totalSteps: selected.steps.length,
        })}
      />
    );
  }

  const filtered = modules.filter(m => m.category === tab);
  const completedCount = filtered.filter(module => effectiveCompletion(module, progressRows.find(row => row.module_id === module.id) ?? null)).length;

  return (
    <>
      <Layout
        title="Training"
        subtitle={tab === "onboarding" ? "Staff onboarding modules" : "Issue resolution guides"}
        headerRight={
          <button
            type="button"
            onClick={() => setShowAIModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-lavender/30 bg-lavender-light text-lavender-deep text-xs font-medium hover:bg-lavender-light/80 transition-colors"
          >
            <Sparkles size={13} />
            Build with AI
          </button>
        }
      >
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "onboarding" as const, label: "Onboarding", icon: GraduationCap },
          { key: "troubleshooting" as const, label: "Troubleshooting", icon: Wrench },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors",
              tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="card-surface p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{completedCount} of {filtered.length} completed</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${filtered.length ? (completedCount / filtered.length) * 100 : 0}%`,
                backgroundColor: "hsl(var(--status-ok))",
              }}
            />
          </div>
        </div>
        <span className="text-lg font-semibold text-foreground">
          {filtered.length ? Math.round((completedCount / filtered.length) * 100) : 0}%
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map(module => {
          const moduleProgress = progressRows.find(row => row.module_id === module.id) ?? null;
          const completed = effectiveCompletion(module, moduleProgress);

          return (
            <button
              key={module.id}
              onClick={() => setSelected(module)}
              className="card-surface w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                completed ? "bg-sage-light" : "bg-muted",
              )}>
                {completed
                  ? <CheckCircle size={17} className="text-sage-deep" />
                  : <Play size={17} className="text-muted-foreground" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{module.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{module.duration} · {module.steps.length} steps</p>
              </div>
              {completed && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium status-ok shrink-0">Done</span>
              )}
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
      </Layout>

      {showAIModal && (
        <TrainingAIModal
          onClose={() => setShowAIModal(false)}
          onGenerate={(generated) => {
            const nextModule: TrainingModule = {
              id: `ai-${Date.now()}`,
              title: generated.title,
              category: generated.category,
              duration: generated.duration,
              completed: false,
              steps: generated.steps,
            };

            setModules(prev => [nextModule, ...prev]);
            setTab(generated.category);
            setSelected(nextModule);
          }}
        />
      )}
    </>
  );
}
