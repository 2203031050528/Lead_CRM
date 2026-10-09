import type { FieldError, FieldValues, Path, Resolver, UseFormSetError } from "react-hook-form";
import type { z } from "zod";

import { ApiError } from "@/lib/api/client";

/** Minimal zod → react-hook-form resolver (avoids an extra dependency). */
export function zodResolver<S extends z.ZodTypeAny>(schema: S): Resolver<z.infer<S>> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      let node = errors;
      issue.path.forEach((key, i) => {
        const k = String(key);
        if (i === issue.path.length - 1) {
          node[k] ??= { type: issue.code, message: issue.message } satisfies FieldError;
        } else {
          node = (node[k] ??= {}) as Record<string, unknown>;
        }
      });
    }
    return { values: {}, errors: errors as never };
  };
}

/**
 * Maps a DRF error onto form fields. Returns the message to show for errors that
 * don't belong to a known field (or null if everything was mapped).
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string | null {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  const leftovers: string[] = [];
  for (const [field, messages] of Object.entries(err.errors)) {
    if (fields.includes(field)) setError(field as Path<T>, { type: "server", message: messages[0] });
    else leftovers.push(`${field}: ${messages[0]}`);
  }
  if (Object.keys(err.errors).length === 0) return err.message;
  return leftovers.length ? leftovers.join(" ") : null;
}
