import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

const fieldLabels: Record<string, string> = {
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  name: "الاسم",
  role: "الدور",
  status: "الحالة",
  siteId: "الموقع",
  topic: "الموضوع",
  topics: "موضوعات الدفعة",
  ideasCount: "عدد الأفكار",
  contentGoal: "هدف المحتوى",
  audience: "الجمهور المستهدف",
  searchIntent: "نية البحث",
  publishTime: "وقت النشر",
  intervalDays: "الفاصل بالأيام",
  startDate: "تاريخ البداية",
  scheduledPublishAt: "تاريخ الجدولة",
  title: "العنوان",
  draftHtml: "محتوى المقال",
  metaDescription: "الوصف التعريفي",
  category: "التصنيف",
  imageAlt: "النص البديل للصورة",
  tags: "الوسوم",
  wordpressUrl: "رابط ووردبريس",
  wordpressUsername: "اسم مستخدم ووردبريس",
  wordpressApplicationPassword: "كلمة مرور تطبيق ووردبريس",
  market: "السوق",
  language: "اللغة",
  writingStandard: "معيار الكتابة",
  gscProperty: "خاصية بحث جوجل",
  gscServiceAccountJson: "بيانات حساب خدمة جوجل",
  monthlyAiBudgetUsd: "ميزانية الذكاء الاصطناعي الشهرية",
  monthlyAiHardLimitUsd: "حد الإيقاف الصارم",
  defaultIdeasCount: "عدد الأفكار الافتراضي",
  defaultMarket: "السوق الافتراضي",
  autoPublishAfterApproval: "النشر التلقائي بعد الاعتماد",
  providerRouting: "ترتيب المزودين"
};

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    message: validationMessages(errors)
  });
}

export function validationMessages(errors: ValidationError[]): string[] {
  const messages = flattenValidationErrors(errors);
  return messages.length > 0 ? messages : ["بيانات الطلب غير صالحة."];
}

function flattenValidationErrors(errors: ValidationError[], parent = ""): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    for (const constraint of Object.keys(error.constraints ?? {})) {
      messages.push(messageForConstraint(path, constraint));
    }
    if (error.children?.length) messages.push(...flattenValidationErrors(error.children, path));
  }
  return messages;
}

function messageForConstraint(path: string, constraint: string): string {
  const label = labelForPath(path);
  const messages: Record<string, string> = {
    whitelistValidation: `${label} غير مسموح به في هذا الطلب.`,
    isEmail: `${label} يجب أن يكون بريدًا إلكترونيًا صالحًا.`,
    isString: `${label} يجب أن يكون نصًا.`,
    minLength: `${label} أقصر من الحد المطلوب.`,
    maxLength: `${label} أطول من الحد المسموح.`,
    isInt: `${label} يجب أن يكون رقمًا صحيحًا.`,
    isNumber: `${label} يجب أن يكون رقمًا.`,
    min: `${label} أقل من الحد المسموح.`,
    max: `${label} أكبر من الحد المسموح.`,
    isBoolean: `${label} يجب أن يكون اختيارًا صحيحًا أو خطأ.`,
    isDateString: `${label} يجب أن يكون تاريخًا صالحًا.`,
    isArray: `${label} يجب أن يكون قائمة.`,
    arrayMaxSize: `${label} يحتوي على عناصر أكثر من الحد المسموح.`,
    isIn: `${label} يحتوي على قيمة غير مدعومة.`,
    isUrl: `${label} يجب أن يكون رابطًا صالحًا.`,
    nestedValidation: `${label} يجب أن يكون كائنًا صالحًا.`
  };
  return messages[constraint] ?? `${label} غير صالح.`;
}

function labelForPath(path: string): string {
  const property = path.split(".").at(-1) ?? path;
  return fieldLabels[property] ?? "الحقل";
}
