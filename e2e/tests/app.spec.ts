import pg from "pg";
import { expect, test, type Page } from "@playwright/test";
import { adminCredentials } from "../playwright.config";

async function login(page: Page, email = adminCredentials.email, password = adminCredentials.password): Promise<void> {
  await page.goto("/");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

test.describe.configure({ mode: "serial" });

test("shows an error for wrong credentials and signs in with the right ones", async ({ page }) => {
  await login(page, adminCredentials.email, "wrong-password-123");
  await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();

  await login(page);
  await expect(page.getByRole("heading", { name: "منصة انتاج المحتوى" })).toBeVisible();
  await expect(page.getByRole("link", { name: "مكتبة المحتوى" })).toBeVisible();
});

test("an admin adds a site and creates content that queues the first job", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "المواقع" }).first().click();
  await page.getByRole("button", { name: "إضافة موقع" }).click();
  await page.getByLabel("اسم الموقع").fill("موقع التجربة");
  await page.getByLabel("رابط ووردبريس").fill("https://203.0.113.10");
  await page.getByLabel("اسم مستخدم ووردبريس").fill("editor");
  await page.getByLabel("كلمة مرور التطبيق").fill("app-password");
  await page.getByRole("button", { name: /حفظ|إضافة الموقع|إنشاء/ }).last().click();
  await expect(page.getByText("تمت إضافة الموقع")).toBeVisible(); // success toast
  await expect(page.getByRole("heading", { name: "موقع التجربة" })).toBeVisible();

  await page.getByRole("link", { name: "مكتبة المحتوى" }).first().click();
  await page.getByRole("button", { name: "إنشاء محتوى" }).click();
  await page.locator('select[name="siteId"]').selectOption({ label: "موقع التجربة" });
  await page.getByLabel("الموضوع").fill("التسويق بالمحتوى للشركات الناشئة");
  await page.getByRole("button", { name: "حفظ وبدء المسار" }).click();
  await expect(page.getByText("تم إنشاء المحتوى")).toBeVisible();
  await expect(page.getByText("التسويق بالمحتوى للشركات الناشئة").first()).toBeVisible();
});

test("a revoked session sends the user back to the login screen", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("link", { name: "مكتبة المحتوى" })).toBeVisible();

  // Disable the account behind the app's back (as another admin would): the next API call must end the session.
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/content_agent_e2e" });
  await client.connect();
  await client.query("UPDATE users SET token_version = token_version + 1 WHERE email = $1", [adminCredentials.email]);
  await client.end();

  await page.getByRole("link", { name: "المواقع" }).first().click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
});

test("a crash in one screen shows the fallback and keeps the navigation usable", async ({ page }) => {
  await login(page);
  await page.route("**/api/sites", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ not: "an array" }) }));
  await page.getByRole("link", { name: "المواقع" }).first().click();
  await expect(page.getByText("حدث خطأ في عرض هذه الصفحة")).toBeVisible();
  await page.unroute("**/api/sites");
  await page.getByRole("link", { name: "لوحة التحكم" }).first().click();
  await expect(page.getByText("حدث خطأ في عرض هذه الصفحة")).toHaveCount(0);
});
