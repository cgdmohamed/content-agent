import type { ContentOperation, ContentState } from "@content-agent/shared";
import type { ContentMode, IntegrationStatus } from "@content-agent/types";

export const stateLabels: Record<ContentState, string> = {
  NEW: "جديد",
  QUEUED: "في الانتظار",
  IDEAS_READY: "الأفكار جاهزة",
  IDEA_SELECTED: "تم اختيار الفكرة",
  GAPS_READY: "بحث المنافسين جاهز",
  DRAFTED: "مسودة",
  REVIEWED: "تمت المراجعة",
  IMAGE_READY: "الصورة جاهزة",
  APPROVED: "معتمد",
  SCHEDULED: "مجدول",
  PUBLISHED: "منشور",
  DUPLICATE: "مكرر",
  FAILED: "فشل"
};

export const operationLabels: Record<ContentOperation, string> = {
  GENERATE_IDEAS: "توليد الأفكار",
  SELECT_IDEA: "اختيار فكرة",
  RESEARCH_GAPS: "بحث المنافسين",
  WRITE_DRAFT: "كتابة المسودة",
  REVIEW_DRAFT: "مراجعة المقال",
  GENERATE_IMAGE: "توليد الصورة",
  SKIP_IMAGE: "تخطي الصورة",
  APPROVE: "اعتماد المقال",
  SCHEDULE: "جدولة النشر",
  PUBLISH: "نشر المقال",
  RETRY: "إعادة المحاولة"
};

export const extraOperationLabels: Record<string, string> = {
  OPTIMIZE_LINKS: "تحسين الروابط الداخلية والـ CTA",
  SYNC_GSC: "مزامنة بحث جوجل"
};

export const queueLabels: Record<string, string> = {
  "content-ideas": "طابور أفكار المحتوى",
  "content-research": "طابور بحث المنافسين",
  "content-writing": "طابور كتابة المحتوى",
  "content-review": "طابور مراجعة المحتوى",
  "content-image": "طابور الصور",
  "content-images": "طابور الصور",
  "wordpress-publish": "طابور النشر على ووردبريس",
  "content-publishing": "طابور النشر",
  "gsc-sync": "طابور مزامنة بحث جوجل",
  maintenance: "طابور الصيانة"
};

export const providerLabels: Record<string, string> = {
  openai: "أوبن إيه آي",
  anthropic: "أنثروبيك",
  perplexity: "بيربلكسيتي",
  gemini: "جيميني",
  "gemini-image": "جيميني للصور",
  wordpress: "ووردبريس",
  "google-search-console": "بحث جوجل"
};

export const eventTypeLabels: Record<string, string> = {
  AUTH_LOGIN_SUCCEEDED: "تسجيل دخول ناجح",
  AUTH_LOGOUT: "تسجيل خروج",
  AUTH_LOGIN_FAILED: "محاولة دخول فاشلة",
  CONTENT_CREATED: "إنشاء محتوى",
  CONTENT_DUPLICATE_CREATED: "إنشاء محتوى مكرر",
  CONTENT_BATCH_CREATED: "إنشاء دفعة محتوى",
  CONTENT_JOB_ENQUEUED: "إضافة مهمة محتوى",
  CONTENT_IDEA_SELECTED: "اختيار فكرة محتوى",
  CONTENT_APPROVED: "اعتماد مقال",
  CONTENT_SCHEDULED: "جدولة مقال",
  CONTENT_IMAGE_SKIPPED: "تخطي صورة مقال",
  CONTENT_UPDATED: "تحديث مقال",
  CONTENT_DUPLICATED: "نسخ محتوى",
  CONTENT_VERSION_RESTORED: "استرجاع إصدار",
  CONTENT_RETRY_ENQUEUED: "إعادة محاولة محتوى",
  CONTENT_DELETED: "حذف محتوى",
  JOB_RETRIED: "إعادة محاولة مهمة",
  JOB_CANCELLED: "إلغاء مهمة",
  SITE_CREATED: "إنشاء موقع",
  SITE_UPDATED: "تحديث موقع",
  SITE_WORDPRESS_TESTED: "اختبار ووردبريس",
  SITE_RANKMATH_TESTED: "اختبار رانك ماث",
  SITE_GSC_TESTED: "اختبار بحث جوجل",
  SITE_GSC_SYNC_ENQUEUED: "إضافة مزامنة بحث جوجل",
  SETTINGS_UPDATED: "تحديث الإعدادات",
  USER_CREATED: "إنشاء مستخدم",
  USER_UPDATED: "تحديث مستخدم",
  AUTOMATION_CHAINED: "تشغيل تلقائي للخطوة التالية"
};

export function operationLabel(operation?: string | null): string {
  if (!operation) return "غير محددة";
  return operationLabels[operation as ContentOperation] ?? extraOperationLabels[operation] ?? "عملية غير معروفة";
}

export function queueLabel(queueName?: string | null): string {
  if (!queueName) return "غير محدد";
  return queueLabels[queueName] ?? "طابور غير معروف";
}

export function providerLabel(provider?: string | null): string {
  if (!provider) return "غير محدد";
  return providerLabels[provider] ?? "مزود غير معروف";
}

export function eventTypeLabel(eventType?: string | null): string {
  if (!eventType) return "غير محدد";
  return eventTypeLabels[eventType] ?? "حدث غير معروف";
}

export const modeLabels: Record<ContentMode, string> = {
  MANUAL: "يدوي",
  BULK: "دفعة",
  AUTO_PILOT: "طيار آلي"
};

export const integrationLabels: Record<IntegrationStatus, string> = {
  CONNECTED: "متصل",
  ERROR: "خطأ",
  NOT_CONFIGURED: "غير مهيأ",
  BRIDGE_MISSING: "الجسر غير مثبت",
  PERMISSION_ERROR: "خطأ صلاحيات"
};
