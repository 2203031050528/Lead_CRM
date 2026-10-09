"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

import { Select } from "@/components/ui";
import { useUsers } from "@/hooks/useLookups";

export const OwnerSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { emptyLabel?: string }
>(function OwnerSelect({ emptyLabel, ...props }, ref) {
  const { data: users } = useUsers();
  return (
    <Select ref={ref} {...props}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {users?.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name}
        </option>
      ))}
    </Select>
  );
});
