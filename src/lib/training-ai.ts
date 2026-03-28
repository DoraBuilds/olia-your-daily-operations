export type TrainingCategory = "onboarding" | "troubleshooting";

export interface GeneratedTrainingModule {
  title: string;
  category: TrainingCategory;
  duration: string;
  steps: string[];
}
