// The Ladder of Feedback, in the fixed order this course's crits use.
export const STEPS = [
  { step: 1, label: "Clarify" },
  { step: 2, label: "Strengths" },
  { step: 3, label: "Concerns" },
  { step: 4, label: "Suggestions" },
] as const;

export type Step = (typeof STEPS)[number]["step"];

export function isStep(value: unknown): value is Step {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4;
}

export function stepLabel(step: Step): string {
  return STEPS.find((s) => s.step === step)?.label ?? String(step);
}
