"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { Alert, Button, ConfirmDialog, cx, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { useMe } from "@/hooks/useAuth";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { ApiError, get, patch, post } from "@/lib/api/client";
import type { Paginated, Role, User } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";
import { formatDate } from "@/lib/format";

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "rep", label: "Sales Rep" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;
const KEYS = ["tab", "search", "role", "is_active", "ordering"] as const;

export function UsersTab() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const { params, page, set } = useListParams(KEYS);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);
  const query = { search: params.search, role: params.role, is_active: params.is_active, ordering: params.ordering || "first_name", page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["users", "admin", query],
    queryFn: () => get<Paginated<User>>("/users/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);

  const toggle = useMutation({
    mutationFn: (u: User) => patch<User>(`/users/${u.id}/`, { is_active: !u.is_active }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast(u.is_active ? `${u.full_name} can sign in again` : `${u.full_name} was deactivated`);
      setToggling(null);
    },
    onError: (err) => toast(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : "Update failed", "error"),
  });

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      sort: "first_name",
      render: (u) => (
        <div>
          <span className="font-medium text-slate-900">{u.full_name}</span>
          {u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
          <p className="text-xs text-slate-500">{u.username}</p>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (u) => u.email || "—", className: "hidden md:table-cell" },
    { key: "role", header: "Role", sort: "role", render: (u) => roleLabel(u.role) },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <span
          className={cx(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            u.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20",
          )}
        >
          {u.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    { key: "login", header: "Last sign-in", render: (u) => formatDate(u.last_login), className: "hidden lg:table-cell whitespace-nowrap" },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" className="py-1" onClick={() => setEditing(u)}>
            Edit
          </Button>
          {u.id !== me?.id && (
            <Button variant="ghost" className="py-1" onClick={() => setToggling(u)}>
              {u.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search name, username, email" />
        <Select aria-label="Role" value={params.role} onChange={(e) => set({ role: e.target.value })} className="w-auto">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={params.is_active} onChange={(e) => set({ is_active: e.target.value })} className="w-auto">
          <option value="">Active and deactivated</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </Select>
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          New user
        </Button>
      </div>
      <DataTable rows={data?.results} columns={columns} loading={isLoading} ordering={query.ordering} onSort={(o) => set({ ordering: o })} />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New user" : "Edit user"} wide>
        {editing !== null && <UserForm user={editing === "new" ? null : editing} isSelf={editing !== "new" && editing.id === me?.id} onDone={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.is_active ? "Deactivate user?" : "Reactivate user?"}
        message={
          toggling?.is_active ? (
            <>
              <strong>{toggling?.full_name}</strong> won&apos;t be able to sign in. Their records stay as they are; reassign them if
              needed.
            </>
          ) : (
            <>
              <strong>{toggling?.full_name}</strong> will be able to sign in again.
            </>
          )
        }
        confirmLabel={toggling?.is_active ? "Deactivate" : "Reactivate"}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username is required")
    .max(150)
    .regex(/^[\w.@+-]+$/, "Letters, digits and @ . + - _ only"),
  first_name: z.string().trim().max(150),
  last_name: z.string().trim().max(150),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(30, "Too long"),
  role: z.enum(["admin", "manager", "rep"]),
  password: z.string(),
});
type Values = z.infer<typeof schema>;

function UserForm({ user, isSelf, onDone }: { user: User | null; isSelf: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: user?.username ?? "",
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      role: user?.role ?? "rep",
      password: "",
    },
  });
  const save = useMutation({
    mutationFn: (v: Values) => {
      const { password, role, ...rest } = v;
      const body = { ...rest, ...(!isSelf && { role }), ...(password && { password }) };
      return user ? patch<User>(`/users/${user.id}/`, body) : post<User>("/users/", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast(user ? "User updated" : "User created");
      onDone();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, Object.keys(schema.shape))),
  });

  return (
    <form
      onSubmit={handleSubmit((v) => {
        if (!user && v.password.length < 8) return setError("password", { message: "Use at least 8 characters" });
        if (user && v.password && v.password.length < 8) return setError("password", { message: "Use at least 8 characters" });
        save.mutate(v);
      })}
      className="space-y-4"
      noValidate
    >
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="u-first" error={errors.first_name?.message}>
          <Input id="u-first" autoFocus {...register("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="u-last" error={errors.last_name?.message}>
          <Input id="u-last" {...register("last_name")} />
        </Field>
        <Field label="Username" htmlFor="u-username" error={errors.username?.message}>
          <Input id="u-username" autoComplete="off" {...register("username")} />
        </Field>
        <Field label="Email" htmlFor="u-email" error={errors.email?.message} hint="Used for password resets and reminders.">
          <Input id="u-email" type="email" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="u-phone" error={errors.phone?.message}>
          <Input id="u-phone" type="tel" {...register("phone")} />
        </Field>
        <Field label="Role" htmlFor="u-role" error={errors.role?.message} hint={isSelf ? "You can't change your own role." : undefined}>
          <Select id="u-role" disabled={isSelf} {...register("role")}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label={user ? "New password" : "Password"}
        htmlFor="u-password"
        error={errors.password?.message}
        hint={user ? "Leave empty to keep the current password." : "At least 8 characters; share it with the user securely."}
      >
        <Input id="u-password" type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {user ? "Save changes" : "Create user"}
        </Button>
      </div>
    </form>
  );
}
