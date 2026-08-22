import { BarChart3, FileText, Globe2, ListChecks, LogIn, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import type { ReactElement } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../api/client";
import { IconButton } from "./IconButton";
import { ActionError, LoadingState } from "./StateViews";

const nav = [
  { to: "/", label: "لوحة التحكم", icon: BarChart3, adminOnly: false },
  { to: "/content", label: "مكتبة المحتوى", icon: FileText, adminOnly: false },
  { to: "/sites", label: "المواقع", icon: Globe2, adminOnly: false },
  { to: "/operations", label: "العمليات", icon: ListChecks, adminOnly: true },
  { to: "/users", label: "المستخدمون", icon: Users, adminOnly: true },
  { to: "/settings", label: "الإعدادات", icon: Settings, adminOnly: true }
];

const loginSchema = z.object({
  email: z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا."),
  password: z.string().min(1, "كلمة المرور مطلوبة.")
});

type LoginForm = z.infer<typeof loginSchema>;

export function AppShell(): ReactElement {
  const queryClient = useQueryClient();
  const location = useLocation();
  const session = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, retry: false });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  if (session.isLoading) return <main className="min-h-screen bg-mist p-6" dir="rtl"><LoadingState label="جاري التحقق من الجلسة..." /></main>;
  if (!session.data) return <LoginScreen />;
  const user = session.data;
  if (user.role !== "ADMIN" && isAdminPath(location.pathname)) return <Navigate to="/" replace />;
  const visibleNav = nav.filter((item) => !item.adminOnly || user.role === "ADMIN");

  return (
    <div className="min-h-screen bg-mist text-right text-ink" dir="rtl">
      <aside className="fixed inset-y-0 right-0 hidden w-64 border-l border-slate-200 bg-white px-4 py-5 lg:block">
        <div className="mb-8">
          <p className="text-sm font-semibold text-teal">وكيل المحتوى</p>
          <h1 className="mt-1 text-xl font-bold">لوحة الإنتاج</h1>
        </div>
        <nav className="space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-teal text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="lg:pr-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">واجهة عربية بالكامل</p>
              <h2 className="text-lg font-semibold">إنتاج المحتوى بالذكاء الاصطناعي والنشر على ووردبريس</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                {user.name} · {user.role === "ADMIN" ? "مدير" : "محرر"}
              </div>
              <IconButton icon={LogOut} tone="ghost" disabled={logout.isPending} onClick={() => logout.mutate()}>
                خروج
              </IconButton>
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                    isActive ? "border-teal bg-teal text-white" : "border-slate-200 text-slate-600"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-6">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/operations" || pathname === "/users" || pathname === "/settings" || /^\/sites\/[^/]+\/report$/.test(pathname);
}

function LoginScreen(): ReactElement {
  const queryClient = useQueryClient();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5 text-right text-ink" dir="rtl">
      <form onSubmit={form.handleSubmit((values) => login.mutate(values))} noValidate className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-teal text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold text-teal">وكيل المحتوى</p>
            <h1 className="mt-1 text-2xl font-bold">تسجيل الدخول</h1>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="text-sm font-medium text-slate-600">البريد الإلكتروني</span>
          <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" type="email" autoComplete="email" {...form.register("email")} />
          {form.formState.errors.email ? <span className="mt-1 block text-xs text-red-600">{form.formState.errors.email.message}</span> : null}
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium text-slate-600">كلمة المرور</span>
          <input className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" type="password" autoComplete="current-password" {...form.register("password")} />
          {form.formState.errors.password ? <span className="mt-1 block text-xs text-red-600">{form.formState.errors.password.message}</span> : null}
        </label>
        <IconButton icon={LogIn} type="submit" tone="primary" className="mt-5 w-full" disabled={login.isPending}>
          {login.isPending ? "جاري الدخول..." : "دخول"}
        </IconButton>
        <div className="mt-3"><ActionError error={login.error} /></div>
      </form>
    </main>
  );
}
