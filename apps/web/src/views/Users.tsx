import { useState, type FormEvent, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserDto } from "../api/client";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function Users(): ReactElement {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserDto | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const createUser = useMutation({
    mutationFn: api.createUser,
    onSuccess: async () => {
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateUser>[1] }) => api.updateUser(id, body),
    onSuccess: async () => {
      setPasswordUser(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });
  if (users.isLoading) return <LoadingState />;
  if (users.isError || !users.data) return <ErrorState />;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createUser.mutate({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      role: String(data.get("role") ?? "EDITOR") as "ADMIN" | "EDITOR"
    });
  }

  function resetPassword(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!passwordUser) return;
    const data = new FormData(event.currentTarget);
    updateUser.mutate({ id: passwordUser.id, body: { password: String(data.get("password") ?? "") } });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">المستخدمون</h2>
        <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" onClick={() => setFormOpen((value) => !value)}>إنشاء مستخدم</button>
      </div>
      {formOpen ? (
        <form onSubmit={submit} noValidate className="mt-5 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <Input name="name" label="الاسم" required />
          <Input name="email" label="البريد الإلكتروني" type="email" required />
          <Input name="password" label="كلمة المرور" type="password" required />
          <label>
            <span className="text-sm font-medium text-slate-600">الدور</span>
            <select name="role" defaultValue="EDITOR" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
              <option value="EDITOR">محرر</option>
              <option value="ADMIN">مدير</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" disabled={createUser.isPending}>
              {createUser.isPending ? "جاري الإنشاء..." : "حفظ المستخدم"}
            </button>
          </div>
          <div className="md:col-span-2"><ActionError error={createUser.error} /></div>
        </form>
      ) : null}
      {users.data.length === 0 ? <div className="mt-5"><EmptyState label="لا يوجد مستخدمون بعد." /></div> : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">الاسم</th><th className="px-4 py-3">البريد</th><th className="px-4 py-3">الدور</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">آخر دخول</th><th className="px-4 py-3">الإجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role === "ADMIN" ? "مدير" : "محرر"}</td>
                  <td className="px-4 py-3">{user.status === "ACTIVE" ? "نشط" : "معطل"}</td>
                  <td className="px-4 py-3">{user.lastLoginAt ?? "لم يسجل بعد"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium" disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, body: { role: user.role === "ADMIN" ? "EDITOR" : "ADMIN" } })}>
                        {user.role === "ADMIN" ? "جعله محررًا" : "جعله مديرًا"}
                      </button>
                      <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium" disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, body: { status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE" } })}>
                        {user.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                      </button>
                      <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium" onClick={() => setPasswordUser(user)}>
                        كلمة المرور
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4"><ActionError error={updateUser.error} /></div>
      {passwordUser ? (
        <form onSubmit={resetPassword} noValidate className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input name="password" label={`كلمة مرور جديدة لـ ${passwordUser.name}`} type="password" required />
            <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" disabled={updateUser.isPending}>
              {updateUser.isPending ? "جاري الحفظ..." : "تحديث كلمة المرور"}
            </button>
            <button type="button" className="rounded-md border border-slate-200 px-4 py-2 text-sm" onClick={() => setPasswordUser(null)}>إلغاء</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Input(props: { name: string; label: string; type?: string; required?: boolean }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
