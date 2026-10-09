"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog, useToast } from "@/components/ui";
import { ApiError, del } from "@/lib/api/client";
import type { Task } from "@/lib/api/types";

import { TaskFormModal, type TaskParent } from "./TaskFormModal";

/** One create/edit modal and one delete confirmation shared by a whole task list. */
export function useTaskEditor(parent?: TaskParent) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Task | null | "new">(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const remove = useMutation({
    mutationFn: (t: Task) => del(`/tasks/${t.id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setDeleting(null);
      toast("Task deleted");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't delete the task", "error"),
  });

  const modals = (
    <>
      <TaskFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        task={editing === "new" ? null : editing}
        parent={parent}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete task?"
        message={<>This permanently deletes “{deleting?.title}”.</>}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
  return {
    create: () => setEditing("new"),
    onEdit: (t: Task) => setEditing(t),
    onDelete: (t: Task) => setDeleting(t),
    modals,
  };
}
