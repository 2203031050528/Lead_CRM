"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type Over,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { cx, EmptyState, ICONS, IconButton, Skeleton, useToast } from "@/components/ui";
import { useStages } from "@/hooks/useLookups";
import { ApiError, get, patch } from "@/lib/api/client";
import type { Deal, Paginated, PipelineStage, StageSummary } from "@/lib/api/types";
import { formatDate, formatMoney, localDateString } from "@/lib/format";

import { stageTone } from "./stages";

export interface BoardFilters {
  search: string;
  owner: string;
}

const PAGE_SIZE = 25;
type Pages = InfiniteData<Paginated<Deal>, number>;

const boardKey = (filters: BoardFilters, stage: number) => ["deals", "board", filters, stage] as const;
const summaryKey = (filters: BoardFilters) => ["deals", "summary", filters] as const;

/** Per-stage count and value; shares its cache with the board's column headers. */
export function usePipelineSummary(filters: BoardFilters) {
  return useQuery({
    queryKey: summaryKey(filters),
    queryFn: () => get<StageSummary[]>("/deals/summary/", { ...filters }),
  });
}

// Pointer: the column under the cursor. Keyboard (no pointer): the column the card overlaps most.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

/** ←/→ jump straight to the previous/next column instead of nudging 25px at a time. */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return undefined;
  event.preventDefault();
  if (!collisionRect || (event.code !== "ArrowLeft" && event.code !== "ArrowRight")) return undefined;
  const columns = droppableContainers
    .getEnabled()
    .map((c) => ({ id: c.id, rect: droppableRects.get(c.id) }))
    .filter((c): c is { id: UniqueIdentifier; rect: ClientRect } => !!c.rect)
    .sort((a, b) => a.rect.left - b.rect.left);
  const current = columns.findIndex((c) => c.id === over?.id);
  const target = columns[current + (event.code === "ArrowRight" ? 1 : -1)];
  if (current === -1 || !target) return undefined;
  return { x: target.rect.left + 8, y: target.rect.top + 48 };
};

const dealOf = (a: Active | null) => a?.data.current?.deal as Deal | undefined;
const stageOf = (o: Over | null) => o?.data.current?.stage as PipelineStage | undefined;

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${dealOf(active)?.title ?? "deal"}.`,
  onDragOver: ({ active, over }) =>
    stageOf(over)
      ? `${dealOf(active)?.title} is over ${stageOf(over)?.name}.`
      : `${dealOf(active)?.title} is not over a stage.`,
  onDragEnd: ({ active, over }) =>
    stageOf(over)
      ? `${dealOf(active)?.title} was dropped in ${stageOf(over)?.name}.`
      : `${dealOf(active)?.title} was dropped.`,
  onDragCancel: ({ active }) => `Moving ${dealOf(active)?.title} was cancelled.`,
};

const INSTRUCTIONS =
  "To move a deal, press space or enter to pick it up. Use the left and right arrow keys to move it " +
  "between stages, then press space or enter to drop it, or escape to cancel.";

export function KanbanBoard({ filters, onAdd }: { filters: BoardFilters; onAdd: (stage: PipelineStage) => void }) {
  const { data: stages, isLoading } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const summary = usePipelineSummary(filters);
  const totals = useMemo(() => new Map(summary.data?.map((s) => [s.stage, s])), [summary.data]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch so the board can still be scrolled with a finger.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const move = useMutation({
    mutationFn: ({ deal, stage }: { deal: Deal; stage: PipelineStage }) =>
      patch<Deal>(`/deals/${deal.id}/`, { stage: stage.id }),
    // Optimistic: move the card and the column totals now, roll back if the server refuses.
    onMutate: async ({ deal, stage }) => {
      const fromKey = boardKey(filters, deal.stage);
      const toKey = boardKey(filters, stage.id);
      const sumKey = summaryKey(filters);
      await Promise.all([fromKey, toKey, sumKey].map((queryKey) => qc.cancelQueries({ queryKey })));
      const previous = {
        from: qc.getQueryData<Pages>(fromKey),
        to: qc.getQueryData<Pages>(toKey),
        summary: qc.getQueryData<StageSummary[]>(sumKey),
      };
      const moved: Deal = { ...deal, stage: stage.id, stage_name: stage.name };
      const value = Number(deal.value);
      qc.setQueryData<Pages>(fromKey, (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({ ...p, count: p.count - 1, results: p.results.filter((x) => x.id !== deal.id) })),
        },
      );
      qc.setQueryData<Pages>(toKey, (d) =>
        d && {
          ...d,
          pages: d.pages.map((p, i) => ({ ...p, count: p.count + 1, results: i === 0 ? [moved, ...p.results] : p.results })),
        },
      );
      qc.setQueryData<StageSummary[]>(sumKey, (rows) =>
        rows?.map((r) =>
          r.stage === deal.stage
            ? { ...r, count: r.count - 1, total: String(Number(r.total) - value) }
            : r.stage === stage.id
              ? { ...r, count: r.count + 1, total: String(Number(r.total) + value) }
              : r,
        ),
      );
      return previous;
    },
    onError: (err, { deal, stage }, previous) => {
      if (previous) {
        qc.setQueryData(boardKey(filters, deal.stage), previous.from);
        qc.setQueryData(boardKey(filters, stage.id), previous.to);
        qc.setQueryData(summaryKey(filters), previous.summary);
      }
      toast(err instanceof ApiError ? err.message : "Couldn't move the deal", "error");
    },
    onSettled: (_data, _err, { deal, stage }) => {
      for (const queryKey of [boardKey(filters, deal.stage), boardKey(filters, stage.id), summaryKey(filters)]) {
        qc.invalidateQueries({ queryKey });
      }
      qc.invalidateQueries({ queryKey: ["deals", "detail", deal.id] });
      qc.invalidateQueries({ queryKey: ["deals", "list"] });
      qc.invalidateQueries({ queryKey: ["activities", "deal", deal.id] });
    },
  });

  if (isLoading) return <BoardSkeleton />;
  if (!stages?.length) {
    return <EmptyState title="No pipeline stages yet" description="An admin can add stages in Settings." />;
  }

  return (
    <DndContext
      id="deals-board"
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Only the board scrolls during a drag (to reach off-screen stages); dropping anywhere in a
      // column is enough, so columns never need to auto-scroll vertically.
      autoScroll={{ canScroll: (el) => el === boardRef.current, threshold: { x: 0.12, y: 0 } }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      onDragStart={({ active }) => setActiveDeal(dealOf(active) ?? null)}
      onDragCancel={() => setActiveDeal(null)}
      onDragEnd={({ active, over }) => {
        setActiveDeal(null);
        const deal = dealOf(active);
        const stage = stageOf(over);
        if (deal && stage && stage.id !== deal.stage) move.mutate({ deal, stage });
      }}
    >
      <div ref={boardRef} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} filters={filters} summary={totals.get(stage.id)} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeDeal ? <DealCard deal={activeDeal} lifted /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  filters,
  summary,
  onAdd,
}: {
  stage: PipelineStage;
  filters: BoardFilters;
  summary?: StageSummary;
  onAdd: (stage: PipelineStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}`, data: { stage } });
  const query = useInfiniteQuery({
    queryKey: boardKey(filters, stage.id),
    queryFn: ({ pageParam }) =>
      get<Paginated<Deal>>("/deals/", {
        ...filters,
        stage: stage.id,
        ordering: "-updated_at",
        page: pageParam,
        page_size: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
  });
  const deals = query.data?.pages.flatMap((p) => p.results) ?? [];
  const remaining = (query.data?.pages[0]?.count ?? 0) - deals.length;
  const tone = stageTone(stage);

  return (
    <section
      aria-label={`${stage.name} stage`}
      className={cx(
        "flex w-72 shrink-0 flex-col overflow-y-auto rounded-lg border-t-4 bg-slate-100 transition-shadow",
        tone === "won" ? "border-emerald-500" : tone === "lost" ? "border-red-400" : "border-indigo-500",
        isOver && "ring-2 ring-indigo-400",
      )}
      style={{ maxHeight: "calc(100vh - 13rem)" }}
    >
      <div ref={setNodeRef} className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-2 bg-slate-100 px-3 pb-2 pt-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-800">{stage.name}</h2>
            <p className="text-xs text-slate-500">
              {summary ? `${summary.count} · ${formatMoney(summary.total)}` : <span className="invisible">0</span>}
            </p>
          </div>
          <IconButton label={`Add deal in ${stage.name}`} icon={ICONS.plus} onClick={() => onAdd(stage)} />
        </header>
        <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
          {query.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full bg-slate-200/80" />)
          ) : query.isError ? (
            <p className="py-6 text-center text-xs text-red-600">Couldn&apos;t load deals.</p>
          ) : deals.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No deals</p>
          ) : (
            deals.map((d) => <DraggableDeal key={d.id} deal={d} />)
          )}
          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="rounded-md py-1.5 text-xs font-medium text-indigo-600 hover:bg-white disabled:opacity-60"
            >
              {query.isFetchingNextPage ? "Loading…" : `Show ${Math.min(PAGE_SIZE, remaining)} more`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function DraggableDeal({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `deal-${deal.id}`, data: { deal } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${deal.title}, ${formatMoney(deal.value)}`}
      className={cx(
        "relative cursor-grab touch-manipulation rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        isDragging && "opacity-40",
      )}
    >
      <DealCard deal={deal} />
      {/* Stretched link: a click opens the deal; moving the pointer first starts a drag instead. */}
      <Link
        href={`/deals/detail?id=${deal.id}`}
        draggable={false}
        aria-label={`Open ${deal.title}`}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      />
    </div>
  );
}

function DealCard({ deal, lifted }: { deal: Deal; lifted?: boolean }) {
  const close = deal.expected_close_date;
  const late = !!close && !deal.closed_at && close < localDateString();
  return (
    <div
      className={cx(
        "rounded-md border border-slate-200 bg-white p-3 shadow-sm",
        lifted && "rotate-2 cursor-grabbing shadow-lg ring-2 ring-indigo-500",
      )}
    >
      <p className="line-clamp-2 text-sm font-medium text-slate-900">{deal.title}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{deal.company_name || deal.contact_name || "No company"}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800">{formatMoney(deal.value)}</span>
        {close && (
          <span className={late ? "font-medium text-red-600" : "text-slate-500"} title={late ? "Past expected close date" : "Expected close"}>
            {formatDate(close)}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-400">{deal.owner_name}</p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0 space-y-2 rounded-lg bg-slate-100 p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
