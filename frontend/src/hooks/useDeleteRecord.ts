"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui";
import { ApiError, del } from "@/lib/api/client";

/** Delete a record, invalidate its lists, toast, and navigate back to the list page. */
export function useDeleteRecord(resource: string, label: string, redirectTo: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  return useMutation({
    mutationFn: (id: number) => del(`/${resource}/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast(`${label} deleted`);
      router.push(redirectTo);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : `Could not delete ${label.toLowerCase()}`, "error"),
  });
}
