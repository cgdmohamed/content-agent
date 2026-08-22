export type WorkflowUserRole = "ADMIN" | "EDITOR";

export const contentStates = [
  "NEW",
  "QUEUED",
  "IDEAS_READY",
  "IDEA_SELECTED",
  "GAPS_READY",
  "DRAFTED",
  "REVIEWED",
  "IMAGE_READY",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "DUPLICATE",
  "FAILED"
] as const;

export type ContentState = (typeof contentStates)[number];

export const contentOperations = [
  "GENERATE_IDEAS",
  "SELECT_IDEA",
  "RESEARCH_GAPS",
  "WRITE_DRAFT",
  "REVIEW_DRAFT",
  "GENERATE_IMAGE",
  "SKIP_IMAGE",
  "APPROVE",
  "SCHEDULE",
  "PUBLISH",
  "RETRY"
] as const;

export type ContentOperation = (typeof contentOperations)[number];

export interface ContentWorkflowContext {
  state: ContentState;
  role: WorkflowUserRole;
  hasIdeas?: boolean;
  hasSelectedIdea?: boolean;
  hasResearch?: boolean;
  hasDraft?: boolean;
  hasImageDecision?: boolean;
  hasApproval?: boolean;
  hasSchedule?: boolean;
}

export interface WorkflowTransition {
  from: ContentState;
  to: ContentState;
  operation: ContentOperation;
  adminOnly?: boolean;
  automated?: boolean;
  required?: Array<keyof ContentWorkflowContext>;
}

export const workflowTransitions: WorkflowTransition[] = [
  { from: "NEW", to: "IDEAS_READY", operation: "GENERATE_IDEAS" },
  { from: "QUEUED", to: "IDEAS_READY", operation: "GENERATE_IDEAS", automated: true },
  { from: "IDEAS_READY", to: "IDEA_SELECTED", operation: "SELECT_IDEA", required: ["hasIdeas"] },
  { from: "IDEA_SELECTED", to: "GAPS_READY", operation: "RESEARCH_GAPS", required: ["hasSelectedIdea"] },
  { from: "GAPS_READY", to: "DRAFTED", operation: "WRITE_DRAFT", required: ["hasResearch"] },
  { from: "DRAFTED", to: "REVIEWED", operation: "REVIEW_DRAFT", required: ["hasDraft"] },
  { from: "REVIEWED", to: "IMAGE_READY", operation: "GENERATE_IMAGE", required: ["hasDraft"] },
  { from: "REVIEWED", to: "IMAGE_READY", operation: "SKIP_IMAGE", required: ["hasDraft"] },
  { from: "IMAGE_READY", to: "APPROVED", operation: "APPROVE", adminOnly: true, required: ["hasImageDecision"] },
  { from: "APPROVED", to: "SCHEDULED", operation: "SCHEDULE", required: ["hasApproval", "hasSchedule"] },
  { from: "APPROVED", to: "PUBLISHED", operation: "PUBLISH", required: ["hasApproval"] },
  { from: "SCHEDULED", to: "PUBLISHED", operation: "PUBLISH", required: ["hasApproval"] },
  { from: "FAILED", to: "QUEUED", operation: "RETRY" }
];

export function getAllowedTransitions(context: ContentWorkflowContext): WorkflowTransition[] {
  return workflowTransitions.filter((transition) => {
    if (transition.from !== context.state) return false;
    if (transition.adminOnly && context.role !== "ADMIN") return false;
    return (transition.required ?? []).every((key) => Boolean(context[key]));
  });
}

export function canTransition(context: ContentWorkflowContext, operation: ContentOperation): boolean {
  return getAllowedTransitions(context).some((transition) => transition.operation === operation);
}

export function transitionOrThrow(context: ContentWorkflowContext, operation: ContentOperation): ContentState {
  const transition = getAllowedTransitions(context).find((candidate) => candidate.operation === operation);
  if (!transition) {
    throw new Error(`العملية ${operation} غير مسموحة من الحالة ${context.state}.`);
  }
  return transition.to;
}

export function nextPrimaryOperation(state: ContentState): ContentOperation | null {
  switch (state) {
    case "NEW":
    case "QUEUED":
      return "GENERATE_IDEAS";
    case "IDEAS_READY":
      return "SELECT_IDEA";
    case "IDEA_SELECTED":
      return "RESEARCH_GAPS";
    case "GAPS_READY":
      return "WRITE_DRAFT";
    case "DRAFTED":
      return "REVIEW_DRAFT";
    case "REVIEWED":
      return "GENERATE_IMAGE";
    case "IMAGE_READY":
      return "APPROVE";
    case "APPROVED":
      return "PUBLISH";
    case "SCHEDULED":
      return "PUBLISH";
    case "FAILED":
      return "RETRY";
    default:
      return null;
  }
}

export function mapLegacyStatus(status: string): ContentState {
  const normalized = status.trim().toLowerCase();
  const map: Record<string, ContentState> = {
    new: "NEW",
    queued: "QUEUED",
    ideas_ready: "IDEAS_READY",
    idea_selected: "IDEA_SELECTED",
    gaps_ready: "GAPS_READY",
    drafted: "DRAFTED",
    reviewed: "REVIEWED",
    image_ready: "IMAGE_READY",
    duplicate: "DUPLICATE",
    error: "FAILED",
    failed: "FAILED",
    published: "PUBLISHED"
  };
  return map[normalized] ?? "NEW";
}
