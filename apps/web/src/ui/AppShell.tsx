import { BarChart3, CircleDollarSign, FileText, Globe2, ListChecks, LogIn, LogOut, Menu, Settings, ShieldCheck, Users, X } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, sessionExpiredEvent } from "../api/client";
import { IconButton } from "./IconButton";
import { ActionError, LoadingState } from "./StateViews";

const navGroups = [
  {
    label: "العمل اليومي",
    items: [
      { to: "/", label: "لوحة التحكم", icon: BarChart3, adminOnly: false },
      { to: "/content", label: "مكتبة المحتوى", icon: FileText, adminOnly: false },
      { to: "/sites", label: "المواقع", icon: Globe2, adminOnly: false }
    ]
  },
  {
    label: "الإدارة",
    items: [
      { to: "/usage", label: "الاستهلاك", icon: CircleDollarSign, adminOnly: true },
      { to: "/operations", label: "العمليات", icon: ListChecks, adminOnly: true },
      { to: "/site-audit", label: "فحص الموقع", icon: ShieldCheck, adminOnly: true },
      { to: "/users", label: "المستخدمون", icon: Users, adminOnly: true },
      { to: "/settings", label: "الإعدادات", icon: Settings, adminOnly: true }
    ]
  }
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    function onExpired(): void {
      setSessionExpired(true);
      queryClient.setQueryData(["auth", "me"], null);
    }
    window.addEventListener(sessionExpiredEvent, onExpired);
    return () => window.removeEventListener(sessionExpiredEvent, onExpired);
  }, [queryClient]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  // The drawer is only meaningful on the page it was opened from.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (session.isLoading) return <main className="min-h-screen bg-mist p-6" dir="rtl"><LoadingState label="جاري التحقق من الجلسة..." /></main>;
  if (!session.data) return <LoginScreen expired={sessionExpired} />;
  const user = session.data;
  if (user.role !== "ADMIN" && isAdminPath(location.pathname)) return <Navigate to="/" replace />;
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.adminOnly || user.role === "ADMIN") }))
    .filter((group) => group.items.length > 0);

  const navigation = (
    <nav aria-label="التنقل الرئيسي" className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          {groups.length > 1 ? <p className="mb-1 px-3 text-xs font-medium text-slate-400">{group.label}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-teal/10 text-teal" : "text-slate-600 hover:bg-slate-100"}`
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-mist text-right text-ink" dir="rtl">
      <aside className="fixed inset-y-0 right-0 hidden w-60 flex-col border-l border-slate-200 bg-white px-3 py-5 lg:flex">
        <p className="mb-6 px-3 text-lg font-bold text-teal">وكيل المحتوى</p>
        {navigation}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <button type="button" aria-label="إغلاق القائمة" className="absolute inset-0 bg-slate-950/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72 max-w-[85vw] overflow-y-auto bg-white px-3 py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-3">
              <p className="text-lg font-bold text-teal">وكيل المحتوى</p>
              <button type="button" aria-label="إغلاق القائمة" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setMenuOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {navigation}
          </div>
        </div>
      ) : null}

      <div className="lg:pr-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button type="button" aria-label="فتح القائمة" aria-expanded={menuOpen} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" onClick={() => setMenuOpen(true)}><Menu className="h-5 w-5" /></button>
            <span className="text-base font-bold text-teal">وكيل المحتوى</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <div className="text-end leading-tight">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role === "ADMIN" ? "مدير" : "محرر"}</p>
            </div>
            <IconButton icon={LogOut} tone="ghost" disabled={logout.isPending} onClick={() => logout.mutate()}>
              خروج
            </IconButton>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/operations" || pathname === "/usage" || pathname === "/users" || pathname === "/settings" || pathname === "/site-audit" || /^\/sites\/[^/]+\/report$/.test(pathname);
}

function LoginScreen(props: { expired?: boolean }): ReactElement {
  const queryClient = useQueryClient();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });
  const login = useMutation({
    meta: { silent: true },
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
        {props.expired ? <p role="alert" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">انتهت جلستك. سجّل الدخول من جديد — تعديلاتك غير المحفوظة في المقالات محفوظة محليًا على هذا الجهاز وستعرض عليك للاسترجاع.</p> : null}
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
