# Creative Code Demo — WordPress theme

Arabic/RTL WordPress theme built from the **Creative Code HTML demo (v4)** — light design, violet accent (`#680bd6`), Rubik — running on the **same data model as the previous *Creative Code 2026* theme** (custom post types, meta boxes, settings page), so existing content keeps working.

- Version 3.0.0 · WordPress 6.0+ · PHP 8.0+
- Tailwind is **compiled** (`assets/css/app.css`), icons are inline SVG, stock photos are bundled — the only external request is Google Fonts (Rubik).

## Install

1. Upload `creative-code-demo.zip` (Appearance → Themes → Add New → Upload) and activate.
2. Settings → Permalinks → *Save* (flushes the rewrite rules).
3. Appearance → **إعدادات القالب**: set phone, WhatsApp, e-mail, address, social links, founder name, years of experience.
4. *(Fresh sites)* Appearance → إعدادات القالب → **المحتوى التجريبي** → *إنشاء المحتوى التجريبي*. It creates only what is missing (matched by slug): pages (about, pricing, faq, contact, thank-you, privacy-policy, blog), the 6 demo services, 4 case studies, 6 packages and 5 sample articles; it sets the home/blog pages. Nothing existing is edited — the one exception is WordPress's own untouched *draft* privacy page, which is replaced. Also available as `wp eval 'cc_seed_demo();'`.
5. Optional: assign menus (Primary / Footer). With no menu assigned the demo navigation (with the services dropdown) is used.

## Data model (unchanged slugs)

| Content | Post type / source | URL |
|---|---|---|
| Services + landing pages | `cc_service` | `/services/`, `/services/{slug}/` |
| Case studies | `cc_project` (+ `project_category`, `project_tag`) | `/projects/`, `/projects/{slug}/` |
| Pricing packages | `cc_package` | `/packages/` (also `/pricing/` page) |
| Testimonials | `cc_testimonial` (carousel is hidden until one exists) | — |
| Articles | core posts | blog page |
| Contact info, socials, logo size | Appearance → إعدادات القالب (`cc_theme_options`) | — |
| Leads | `cc_lead` (private, admin menu «الطلبات») | — |

Pages by slug: `pricing`, `about`, `faq`, `contact`, `thank-you`, `privacy-policy`; any other page uses `page.php`.

### Service landing pages (Google Ads)
Each `cc_service` has a **«صفحة الهبوط»** box. Empty fields fall back to the demo copy of the service with the same slug (`web-design`, `ecommerce-store`, `elearning-booking`, `odoo-erp`, `whatsapp-business-api`, `digital-marketing`), so a service with one of those slugs renders the full demo page immediately. FAQ comes from the existing «الأسئلة الشائعة» repeater.

- `…/?lp=1` or the box's *landing mode* checkbox hides the menu/footer and shows the phone number.
- Forms carry hidden `utm_*`, `gclid`, `fbclid`, `landing_page` (first touch, per session) and `service_page`; they are stored on the lead and e-mailed.
- GTM `dataLayer` events: `generate_lead`, `whatsapp_click`, `phone_click`.

### Packages & prices
Mark a package as *web* or *social* and fill its Arabic name / Saudi price in the **«إعدادات صفحة الأسعار»** side box; the Egypt price is the package's normal «السعر» field (digits are used). An empty price shows «السعر عند الطلب». The EG/SA switch follows the visitor's `CF-IPCountry` header when present and is remembered in `localStorage`.

### Forms
Native handler `admin-post.php?action=cc_lead`: honeypot, same-origin referer check, 5 submissions/hour/IP, no nonce (so page caching works). To use Fluent Forms instead, set the form ids in the *Fluent Forms* tab — the theme then renders them in place of the native forms and still fills the attribution fields (add hidden fields named `utm_source`, `gclid`, … to the form).

### SEO
Meta description, canonical, Open Graph and JSON-LD (Organization/WebSite/Breadcrumb/Service/FAQ/BlogPosting) are printed **only when no SEO plugin is active**. With Rank Math the theme leaves SEO to it and keeps the schema extras from the old theme (`inc/legacy.php`).

## Differences from the static demo
- Placeholder sections (testimonials, case-study metrics/gallery/quote) are not shown until real content exists. Case-study results come from the project's «ملخص النتائج» (one `label|value` per line).
- Demo copy for About / process / values / sectors / markets is in the templates; edit the PHP or override with a child theme.
- Photos are bundled copies of the demo's Unsplash stock images (`assets/img/stock/`) — replace with the client's own through featured images.
- Comments are not styled (marketing site); the old theme's 410 handling for ghost URLs, page-cache purge and landing-layout page toggle are kept (`inc/legacy.php`).
- Jobs / team archives use the generic card grid (`index.php`).

## Rebuilding the CSS
```bash
cd wordpress/creative-code-demo
npm install
npm run build:css      # or npm run watch:css
```
Tailwind scans `*.php`, `inc/**/*.php`, `template-parts/**/*.php` and `assets/js/*.js`. Custom CSS lives in `assets/css/theme.css`; behaviour in `assets/js/theme.js` (vanilla JS, no dependencies).

## Icons
UI icons (lucide / Material Design Icons, extracted into `assets/icons/ui.json`) and brand marks (simple-icons, CC0 — see `assets/icons/LICENSE-simple-icons.md`, `assets/icons/brands.json`). Use `cc_icon('lucide:check', 'text-xl')` / `cc_brand_svg('wordpress')`.
