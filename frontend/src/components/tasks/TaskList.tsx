"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { cx, ICONS, IconButton, useToast } from "@/components/ui";
import { ApiError, patch } from "@/lib/api/client";
import type { Task } from "@/lib/api/types";
import { formatDue, isPast, timeAgo } from "@/lib/format";

export interface TaskListOptions {
  showRelated?: boolean;
  showAssignee?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskList({ tasks, ...options }: TaskListOptions & { tasks: Task[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} {...options} />
      ))}
    </ul>
  );
}

function TaskRow({ task, showRelated = true, showAssignee, onEdit, onDelete }: TaskListOptions & { task: Task }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (done: boolean) => patch<Task>(`/tasks/${task.id}/`, { is_done: done }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      if (t.is_done) toast("Task completed");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't update the task", "error"),
  });
  // Show the new state immediately while the request is in flight.
  const done = toggle.isPending ? toggle.variables : task.is_done;
  const overdue = !done && isPast(task.due_at);

  return (
    <li className="group flex items-start gap-3 px-5 py-3">
      <input
        type="checkbox"
        checked={done}
        disabled={toggle.isPending}
        onChange={(e) => toggle.mutate(e.target.checked)}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
      />
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm", done ? "text-slate-400 line-through" : "text-slate-900")}>{task.title}</p>
        {task.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{task.description}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {task.due_at && (
            <span className={overdue ? "font-medium text-red-600" : "text-slate-500"}>
              {overdue ? "Overdue · " : ""}
              {formatDue(task.due_at)}
            </span>
          )}
          {showRelated && task.lead && (
            <Link href={`/leads/detail?id=${task.lead}`} className="text-indigo-600 hover:underline">
              Lead: {task.lead_name}
            </Link>
          )}
          {showRelated && task.deal && (
            <Link href={`/deals/detail?id=${task.deal}`} className="text-indigo-600 hover:underline">
              Deal: {task.deal_title}
            </Link>
          )}
          {showAssignee && <span className="text-slate-500">{task.assigned_to_name}</span>}
          {done && task.completed_at && <span className="text-slate-400">Completed {timeAgo(task.completed_at)}</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <IconButton label={`Edit “${task.title}”`} icon={ICONS.pencil} onClick={() => onEdit(task)} />
        <IconButton label={`Delete “${task.title}”`} icon={ICONS.trash} onClick={() => onDelete(task)} />
      </div>
    </li>
  );
}
