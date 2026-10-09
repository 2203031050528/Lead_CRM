"use client";

import { useQuery } from "@tanstack/react-query";

import { get } from "@/lib/api/client";
import type { LeadSource, Paginated, PipelineStage, Tag, User } from "@/lib/api/types";

const LONG = 5 * 60_000;

export const useUsers = () =>
  useQuery({
    queryKey: ["users", "active"],
    queryFn: () => get<Paginated<User>>("/users/", { is_active: true, page_size: 200, ordering: "first_name" }),
    select: (d) => d.results,
    staleTime: LONG,
  });

export const useSources = () =>
  useQuery({ queryKey: ["lead-sources"], queryFn: () => get<LeadSource[]>("/lead-sources/"), staleTime: LONG });

export const useTags = () => useQuery({ queryKey: ["tags"], queryFn: () => get<Tag[]>("/tags/"), staleTime: LONG });

export const useStages = () =>
  useQuery({ queryKey: ["stages"], queryFn: () => get<PipelineStage[]>("/stages/"), staleTime: LONG });
