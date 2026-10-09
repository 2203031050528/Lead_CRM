"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, isUnauthenticated, post } from "@/lib/api/client";
import type { Role, User } from "@/lib/api/types";

export const ME_KEY = ["auth", "me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api<User>("/auth/me/", { noAuthRedirect: true });
      } catch (err) {
        if (isUnauthenticated(err)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<User>("/auth/login/", { method: "POST", body, noAuthRedirect: true }),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post("/auth/logout/"),
    onSettled: () => {
      qc.clear();
      window.location.assign("/login");
    },
  });
}

export const canManage = (role?: Role) => role === "admin" || role === "manager";
export const isAdmin = (role?: Role) => role === "admin";
