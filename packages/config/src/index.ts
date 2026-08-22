import { z } from "zod";

const base64KeySchema = z.string().refine((value) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}, "يجب أن تكون قيمة base64 تفك إلى 32 بايت بالضبط");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY_BASE64: base64KeySchema,
  MONTHLY_AI_BUDGET_USD: z.coerce.number().nonnegative().default(30),
  MONTHLY_AI_HARD_LIMIT_USD: z.coerce.number().nonnegative().default(40),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  PERPLEXITY_MODEL: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2)
}).superRefine((value, context) => {
  if (value.MONTHLY_AI_HARD_LIMIT_USD > 0 && value.MONTHLY_AI_HARD_LIMIT_USD < value.MONTHLY_AI_BUDGET_USD) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONTHLY_AI_HARD_LIMIT_USD"],
      message: "يجب ألا يقل الحد الصارم عن الميزانية الشهرية"
    });
  }
  if (value.NODE_ENV === "production") {
    if (value.SESSION_SECRET.includes("replace") || value.SESSION_SECRET.includes("change")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_SECRET"], message: "يجب تغييره قبل الإنتاج" });
    }
    if (value.BOOTSTRAP_ADMIN_PASSWORD && placeholderSecret(value.BOOTSTRAP_ADMIN_PASSWORD)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["BOOTSTRAP_ADMIN_PASSWORD"], message: "يجب تغييره قبل الإنتاج" });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`إعدادات Content Agent غير صالحة:\n${formatEnvIssues(result.error)}`);
  }
  return result.data;
}

export function formatEnvIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `- ${issue.path.join(".") || "ENV"}: ${arabicEnvIssueMessage(issue)}`).join("\n");
}

function arabicEnvIssueMessage(issue: z.ZodIssue): string {
  if (issue.message && !/^[A-Za-z\s]+$/.test(issue.message)) return issue.message;
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined" ? "القيمة مطلوبة." : "نوع القيمة غير صالح.";
    case "invalid_enum_value":
      return "القيمة ليست ضمن الخيارات المسموحة.";
    case "invalid_string":
      return issue.validation === "email" ? "يجب أن تكون بريدًا إلكترونيًا صالحًا." : issue.validation === "url" ? "يجب أن تكون رابطًا صالحًا." : "النص غير صالح.";
    case "too_small":
      return issue.type === "string" ? `يجب ألا يقل الطول عن ${issue.minimum} حرفًا.` : `يجب ألا تقل القيمة عن ${issue.minimum}.`;
    case "too_big":
      return issue.type === "string" ? `يجب ألا يزيد الطول عن ${issue.maximum} حرفًا.` : `يجب ألا تزيد القيمة عن ${issue.maximum}.`;
    case "custom":
      return issue.message || "القيمة غير صالحة.";
    default:
      return issue.message || "القيمة غير صالحة.";
  }
}

function placeholderSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("replace") || lower.includes("change");
}
