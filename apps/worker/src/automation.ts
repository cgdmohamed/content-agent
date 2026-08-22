export type AutomationContentState =
  | "NEW"
  | "QUEUED"
  | "IDEAS_READY"
  | "IDEA_SELECTED"
  | "GAPS_READY"
  | "DRAFTED"
  | "REVIEWED"
  | "IMAGE_READY"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "DUPLICATE"
  | "FAILED";

export type AutomationContentOperation = "RESEARCH_GAPS" | "WRITE_DRAFT" | "REVIEW_DRAFT" | "GENERATE_IMAGE";

export interface AutomationState {
  status: AutomationContentState;
  mode: string;
  auto_publish: boolean;
}

export function shouldAutoContinue(state: AutomationState): boolean {
  return state.auto_publish === true && (state.mode === "BULK" || state.mode === "AUTO_PILOT");
}

export function nextAutomatedOperation(state: AutomationContentState): AutomationContentOperation | null {
  switch (state) {
    case "IDEA_SELECTED":
      return "RESEARCH_GAPS";
    case "GAPS_READY":
      return "WRITE_DRAFT";
    case "DRAFTED":
      return "REVIEW_DRAFT";
    case "REVIEWED":
      return "GENERATE_IMAGE";
    default:
      return null;
  }
}
