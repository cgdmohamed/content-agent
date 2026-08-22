# Content Agent Rank Math Bridge

إضافة ووردبريس صغيرة تسمح للنظام بإرسال بيانات Rank Math عبر REST API.

## التثبيت

1. من لوحة ووردبريس افتح: إضافات -> أضف جديد -> رفع إضافة.
2. ارفع ملف `content-agent-rankmath-bridge.zip`.
3. فعّل الإضافة.
4. من النظام افتح المواقع واضغط اختبار رانك ماث.

## ما الذي تفعله؟

- تتيح حقول Rank Math التالية عبر REST API:
  - `rank_math_title`
  - `rank_math_description`
  - `rank_math_focus_keyword`
  - `rank_math_pillar_content`
  - `rank_math_robots`
  - `rank_math_canonical_url`
  - `rank_math_schema_Article`
- تضيف endpoint للاختبار:
  - `/wp-json/content-agent/v1/rankmath`

## المتطلبات

- WordPress 6.0 أو أحدث.
- PHP 7.4 أو أحدث.
- مستخدم ووردبريس لديه صلاحية تحرير المقالات.
- يفضل تثبيت وتفعيل Rank Math SEO.
