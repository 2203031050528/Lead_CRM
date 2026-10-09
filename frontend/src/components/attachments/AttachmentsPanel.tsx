"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent } from "react";

import { Button, Card, ConfirmDialog, cx, ICONS, IconButton, Skeleton, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { ApiError, del, get, post } from "@/lib/api/client";
import type { Attachment, Paginated } from "@/lib/api/types";
import { formatBytes, formatDate, timeAgo } from "@/lib/format";

const MAX_BYTES = 10 * 1024 * 1024;
const OPENABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export interface AttachmentParent {
  field: "lead" | "deal" | "contact";
  id: number;
}

interface Upload {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

interface UploadTarget {
  upload: { url: string; fields: Record<string, string> };
  token: string;
}

/** Browser → S3 directly (presigned POST); XHR because fetch can't report upload progress. */
function sendToStorage(target: UploadTarget["upload"], file: File, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(target.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file); // S3 requires the file to be the last field
    const xhr = new XMLHttpRequest();
    xhr.open("POST", target.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the file (HTTP ${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Couldn't reach file storage."));
    xhr.send(form);
  });
}

let nextUploadId = 1;

export function AttachmentsPanel({ parent }: { parent: AttachmentParent }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const queryKey = ["attachments", parent.field, parent.id];

  const list = useQuery({
    queryKey,
    queryFn: () => get<Paginated<Attachment>>("/attachments/", { [parent.field]: parent.id, page_size: 100 }),
  });

  const patchUpload = (id: number, change: Partial<Upload>) =>
    setUploads((all) => all.map((u) => (u.id === id ? { ...u, ...change } : u)));

  const uploadOne = async (file: File) => {
    const id = nextUploadId++;
    setUploads((all) => [...all, { id, name: file.name, progress: 0 }]);
    if (file.size > MAX_BYTES) return patchUpload(id, { error: "Larger than 10 MB." });
    if (file.size === 0) return patchUpload(id, { error: "The file is empty." });
    try {
      const target = await post<UploadTarget>("/attachments/upload-url/", {
        filename: file.name,
        size: file.size,
        content_type: file.type,
        [parent.field]: parent.id,
      });
      await sendToStorage(target.upload, file, (p) => patchUpload(id, { progress: p }));
      await post<Attachment>("/attachments/", { token: target.token });
      setUploads((all) => all.filter((u) => u.id !== id));
      qc.invalidateQueries({ queryKey });
      toast(`Uploaded ${file.name}`);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 503
            ? "File storage isn't set up yet. Ask an admin to configure S3."
            : (Object.values(err.errors)[0]?.[0] ?? err.message)
          : err instanceof Error
            ? err.message
            : "Upload failed.";
      patchUpload(id, { error: message });
    }
  };

  const uploadAll = (files: FileList | null | undefined) => Array.from(files ?? []).forEach(uploadOne);

  const remove = useMutation({
    mutationFn: (a: Attachment) => del(`/attachments/${a.id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setDeleting(null);
      toast("File deleted");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't delete the file", "error"),
  });

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    uploadAll(e.dataTransfer.files);
  };
  const files = list.data?.results ?? [];

  return (
    <Card className="p-0">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cx("rounded-lg", over && "bg-indigo-50 ring-2 ring-inset ring-indigo-300")}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Attachments{list.data ? ` (${list.data.count})` : ""}</h2>
          <Button variant="ghost" className="py-1" onClick={() => input.current?.click()}>
            + Upload files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            aria-label="Upload files"
            onChange={(e) => {
              uploadAll(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <ul className="divide-y divide-slate-100 border-b border-slate-100">
            {uploads.map((u) => (
              <li key={u.id} className="px-5 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-slate-700">{u.name}</span>
                  {u.error ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-slate-500 hover:text-slate-700"
                      onClick={() => setUploads((all) => all.filter((x) => x.id !== u.id))}
                    >
                      Dismiss
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{Math.round(u.progress * 100)}%</span>
                  )}
                </div>
                {u.error ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {u.error}
                  </p>
                ) : (
                  <div
                    className="mt-1.5 h-1 overflow-hidden rounded-full bg-indigo-100"
                    role="progressbar"
                    aria-label={`Uploading ${u.name}`}
                    aria-valuenow={Math.round(u.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {list.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : files.length === 0 && uploads.length === 0 ? (
          <p className="px-5 py-5 text-sm text-slate-400">No files yet. Drop files here or use “Upload files” (10 MB max each).</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((a) => {
              const download = `/api/v1/attachments/${a.id}/download/`;
              return (
                <li key={a.id} className="group flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <a href={download} className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
                      {a.filename}
                    </a>
                    <p className="text-xs text-slate-500">
                      {formatBytes(a.size)} · {a.uploaded_by_name} ·{" "}
                      <time dateTime={a.created_at} title={formatDate(a.created_at, true)}>
                        {timeAgo(a.created_at)}
                      </time>
                    </p>
                  </div>
                  {OPENABLE.has(a.content_type) && (
                    <a
                      href={`${download}?inline=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Open
                    </a>
                  )}
                  {(a.uploaded_by === me?.id || canManage(me?.role)) && (
                    <IconButton label={`Delete ${a.filename}`} icon={ICONS.trash} onClick={() => setDeleting(a)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete file?"
        message={<>“{deleting?.filename}” will be removed permanently.</>}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
