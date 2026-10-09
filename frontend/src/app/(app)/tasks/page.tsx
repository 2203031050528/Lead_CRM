"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import { SearchInput } from "@/components/data/DataTable";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { TaskList, type TaskListOptions } from "@/components/tasks/TaskList";
import { useTaskEditor } from "@/components/tasks/useTaskEditor";
import { Button, Card, cx, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useListParams } from "@/hooks/useListParams";
import { get, type Query } from "@/lib/api/client";
import type { Paginated, Task } from "@/lib/api/types";
import { browserTimeZone } from "@/lib/format";

const KEYS = ["scope", "assigned_to", "search"] as const;
const PAGE_SIZE = 25;

const SECTIONS = [
  { key: "overdue", title: "Overdue", tone: "text-red-600", empty: "Nothing overdue." },
  { key: "today", title: "Today", tone: "text-slate-900", empty: "Nothing else due today." },
  { key: "upcoming", title: "Upcoming", tone: "text-slate-900", empty: "Nothing scheduled." },
] as const;

export default function TasksPage() {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const { params, set } = useListParams(KEYS);
  const everyone = manager && params.scope === "all";
  const editor = useTaskEditor();
  // "Today" is the viewer's local day, so send their timezone.
  const base: Query = { search: params.search, tz: browserTimeZone(), ...(everyone ? { assigned_to: params.assigned_to } : { mine: true }) };
  const options: TaskListOptions = { showAssignee: everyone, onEdit: editor.onEdit, onDelete: editor.onDelete };

  const overdue = useTaskSection("overdue", { ...base, bucket: "overdue", ordering: "due_at" });
  const today = useTaskSection("today", { ...base, bucket: "today", ordering: "due_at" });
  const upcoming = useTaskSection("upcoming", { ...base, bucket: "upcoming", ordering: "due_at" });
  const sections = [
    { ...SECTIONS[0], state: overdue },
    { ...SECTIONS[1], state: today },
    { ...SECTIONS[2], state: upcoming },
  ];
  const done = useTaskSection("done", { ...base, is_done: true, ordering: "-completed_at" });
  const loaded = sections.every((s) => s.state.data);
  const nothingOpen = loaded && sections.every((s) => s.state.data?.pages[0]?.count === 0);

  return (
    <>
      <PageHeader
        title={everyone ? "Team tasks" : "My tasks"}
        actions={<Button onClick={editor.create}>New task</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {manager && (
          <Segmented
            label="Whose tasks"
            value={everyone ? "all" : "mine"}
            onChange={(v) => set({ scope: v === "all" ? "all" : "", assigned_to: "" })}
            options={[
              { value: "mine", label: "Mine" },
              { value: "all", label: "Everyone" },
            ]}
          />
        )}
        {everyone && (
          <OwnerSelect aria-label="Assigned to" emptyLabel="Anyone" value={params.assigned_to} onChange={(e) => set({ assigned_to: e.target.value })} className="w-auto" />
        )}
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search tasks" />
      </div>

      {nothingOpen && !params.search ? (
        <div className="mb-6">
          <EmptyState title="You're all caught up" description="No open tasks." action={<Button onClick={editor.create}>New task</Button>} />
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <TaskSection key={s.key} title={s.title} tone={s.tone} empty={s.empty} state={s.state} options={options} />
          ))}
        </div>
      )}
      <CompletedSection state={done} options={options} />
      {editor.modals}
    </>
  );
}

function useTaskSection(key: string, query: Query) {
  return useInfiniteQuery({
    queryKey: ["tasks", "page", key, query],
    queryFn: ({ pageParam }) => get<Paginated<Task>>("/tasks/", { ...query, page: pageParam, page_size: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
  });
}

type SectionState = ReturnType<typeof useTaskSection>;

function TaskSection({ title, tone, empty, state, options }: { title: string; tone: string; empty: string; state: SectionState; options: TaskListOptions }) {
  const tasks = state.data?.pages.flatMap((p) => p.results) ?? [];
  const count = state.data?.pages[0]?.count;
  return (
    <section aria-labelledby={`tasks-${title}`}>
      <h2 id={`tasks-${title}`} className={cx("mb-2 text-sm font-semibold", tone)}>
        {title}
        {count !== undefined && <span className="ml-1.5 font-normal text-slate-400">{count}</span>}
      </h2>
      <Card className="p-0">
        {state.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : state.isError ? (
          <p className="px-5 py-4 text-sm text-red-600">Couldn&apos;t load tasks.</p>
        ) : tasks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">{empty}</p>
        ) : (
          <TaskList tasks={tasks} {...options} />
        )}
        {state.hasNextPage && (
          <div className="border-t border-slate-100 px-5 py-2">
            <Button variant="ghost" onClick={() => state.fetchNextPage()} loading={state.isFetchingNextPage}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}

function CompletedSection({ state, options }: { state: SectionState; options: TaskListOptions }) {
  const [open, setOpen] = useState(false);
  const count = state.data?.pages[0]?.count ?? 0;
  if (!count) return null;
  const tasks = state.data?.pages.flatMap((p) => p.results) ?? [];
  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
      >
        {open ? "▾" : "▸"} Completed <span className="font-normal text-slate-400">{count}</span>
      </button>
      {open && (
        <Card className="p-0">
          <TaskList tasks={tasks} {...options} />
          {state.hasNextPage && (
            <div className="border-t border-slate-100 px-5 py-2">
              <Button variant="ghost" onClick={() => state.fetchNextPage()} loading={state.isFetchingNextPage}>
                Show more
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
