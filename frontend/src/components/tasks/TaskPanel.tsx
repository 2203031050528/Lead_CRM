"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, Skeleton } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { get } from "@/lib/api/client";
import type { Paginated, Task } from "@/lib/api/types";

import type { TaskParent } from "./TaskFormModal";
import { TaskList } from "./TaskList";
import { useTaskEditor } from "./useTaskEditor";

/** Tasks for one lead or deal (reps only see the ones assigned to them). */
export function TaskPanel({ parent }: { parent: TaskParent }) {
  const { data: me } = useMe();
  const [showDone, setShowDone] = useState(false);
  const editor = useTaskEditor(parent);
  const scope = { [parent.field]: parent.id };
  const open = useQuery({
    queryKey: ["tasks", parent.field, parent.id, "open"],
    queryFn: () => get<Paginated<Task>>("/tasks/", { ...scope, is_done: false, ordering: "due_at", page_size: 100 }),
  });
  const done = useQuery({
    queryKey: ["tasks", parent.field, parent.id, "done"],
    queryFn: () => get<Paginated<Task>>("/tasks/", { ...scope, is_done: true, ordering: "-completed_at", page_size: 20 }),
  });
  const options = { showRelated: false, showAssignee: canManage(me?.role), onEdit: editor.onEdit, onDelete: editor.onDelete };
  const doneCount = done.data?.count ?? 0;

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Tasks{open.data ? ` (${open.data.count} open)` : ""}
        </h2>
        <Button variant="ghost" className="py-1" onClick={editor.create}>
          + Add task
        </Button>
      </div>
      {open.isLoading ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : open.data?.results.length ? (
        <TaskList tasks={open.data.results} {...options} />
      ) : (
        <p className="px-5 py-5 text-sm text-slate-400">No open tasks.</p>
      )}
      {doneCount > 0 && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={showDone}
            className="w-full px-5 py-2.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            {showDone ? "▾" : "▸"} Completed ({doneCount})
          </button>
          {showDone && done.data && <TaskList tasks={done.data.results} {...options} />}
        </div>
      )}
      {editor.modals}
    </Card>
  );
}
