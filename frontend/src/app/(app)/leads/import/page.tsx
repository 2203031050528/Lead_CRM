"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";

import { Alert, Button, Card, cx, PageHeader, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";

const MAX_BYTES = 10 * 1024 * 1024;

interface Preview {
  headers: string[];
  rows: number;
  sample: string[][];
  mapping: string[];
  fields: { value: string; label: string }[];
  max_rows: number;
}

interface CheckResult {
  total: number;
  valid: number;
  invalid: number;
  row_errors: { row: number; errors: Record<string, string[]> }[];
  created: number;
  dry_run: boolean;
}

type Step = "upload" | "map" | "review" | "done";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Choose file" },
  { key: "map", label: "Match columns" },
  { key: "review", label: "Review" },
  { key: "done", label: "Import" },
];

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return Object.values(err.errors)[0]?.[0] ?? err.message;
  return "Something went wrong. Please try again.";
}

function send(path: string, file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  return api(path, { method: "POST", body: form });
}

export default function ImportLeadsPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("The file is larger than 10 MB.");
    if (!/\.(csv|txt)$/i.test(f.name) && f.type !== "text/csv") return setError("Choose a .csv file.");
    run(async () => {
      const p = (await send("/leads/import/preview/", f)) as Preview;
      setFile(f);
      setPreview(p);
      setMapping(p.mapping);
      setStep("map");
    });
  };

  const labels = Object.fromEntries((preview?.fields ?? []).map((f) => [f.value, f.label]));
  const hasName = mapping.some((m) => m === "name" || m === "first_name" || m === "last_name");

  const checkRows = () =>
    run(async () => {
      const r = (await send("/leads/import/", file!, { mapping: JSON.stringify(mapping), dry_run: "true" })) as CheckResult;
      setCheck(r);
      setSkipInvalid(false);
      setStep("review");
    });

  const importRows = () =>
    run(async () => {
      const r = (await send("/leads/import/", file!, {
        mapping: JSON.stringify(mapping),
        dry_run: "false",
        skip_invalid: String(skipInvalid),
      })) as CheckResult;
      setCheck(r);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      setStep("done");
    });

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setCheck(null);
    setError(null);
  };

  return (
    <>
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-700">
        ← Leads
      </Link>
      <div className="mt-2">
        <PageHeader title="Import leads" description="Upload a CSV with up to 5,000 rows. Nothing is saved until the last step." />
      </div>
      <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Import steps">
        {STEPS.map((s, i) => {
          const current = s.key === step;
          const done = STEPS.findIndex((x) => x.key === step) > i;
          return (
            <li
              key={s.key}
              aria-current={current ? "step" : undefined}
              className={cx(
                "flex items-center gap-2 rounded-full px-3 py-1",
                current ? "bg-indigo-600 text-white" : done ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500",
              )}
            >
              <span className="text-xs font-semibold">{i + 1}</span>
              {s.label}
            </li>
          );
        })}
      </ol>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {step === "upload" && <UploadStep busy={busy} onFile={choose} />}

      {step === "map" && preview && (
        <Card className="p-0">
          <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{file?.name}</span> · {preview.rows.toLocaleString()} row
            {preview.rows === 1 ? "" : "s"}. Match each column to a lead field.
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Column in your file</th>
                  <th scope="col" className="px-5 py-2 font-medium">Example values</th>
                  <th scope="col" className="px-5 py-2 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.headers.map((header, i) => {
                  const examples = preview.sample.map((r) => r[i]).filter(Boolean).slice(0, 2);
                  return (
                    <tr key={header}>
                      <td className="px-5 py-2.5 font-medium text-slate-900">{header}</td>
                      <td className="max-w-xs truncate px-5 py-2.5 text-slate-500" title={examples.join(", ")}>
                        {examples.join(", ") || "—"}
                      </td>
                      <td className="px-5 py-2.5">
                        <Select
                          aria-label={`Import “${header}” as`}
                          value={mapping[i]}
                          onChange={(e) => setMapping((m) => m.map((v, j) => (j === i ? e.target.value : v)))}
                          className="w-56"
                        >
                          <option value="">Don&apos;t import</option>
                          {preview.fields.map((f) => (
                            <option key={f.value} value={f.value} disabled={mapping.includes(f.value) && mapping[i] !== f.value}>
                              {f.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">
              {hasName ? "Sources, tags and owners must already exist. Owners are matched by username or email." : "Map a column to Name (or First name / Last name) to continue."}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Choose another file
              </Button>
              <Button onClick={checkRows} disabled={!hasName} loading={busy}>
                Check rows
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "review" && check && (
        <Card className="p-0">
          <div className="space-y-1 border-b border-slate-100 px-5 py-4">
            <p className="text-base font-semibold text-slate-900">
              {check.valid.toLocaleString()} of {check.total.toLocaleString()} rows are ready to import
            </p>
            {check.invalid > 0 && (
              <p className="text-sm text-slate-600">
                {check.invalid.toLocaleString()} row{check.invalid === 1 ? " has" : "s have"} problems. Fix them in your file
                and upload it again, or skip them.
              </p>
            )}
          </div>
          {check.invalid > 0 && (
            <>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="w-20 px-5 py-2 font-medium">Row</th>
                      <th scope="col" className="w-48 px-5 py-2 font-medium">Field</th>
                      <th scope="col" className="px-5 py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {check.row_errors.flatMap((r) =>
                      Object.entries(r.errors).map(([field, msgs]) => (
                        <tr key={`${r.row}-${field}`}>
                          <td className="px-5 py-2 tabular-nums text-slate-700">{r.row}</td>
                          <td className="px-5 py-2 text-slate-700">{labels[field] ?? field}</td>
                          <td className="px-5 py-2 text-slate-600">{msgs.join(" ")}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm">
                <button type="button" className="text-indigo-600 hover:underline" onClick={() => downloadErrors(check, labels)}>
                  Download error report
                </button>
                {check.row_errors.length < check.invalid && (
                  <span className="text-xs text-slate-500">Showing the first {check.row_errors.length} problem rows.</span>
                )}
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" className="accent-indigo-600" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                  Skip the {check.invalid.toLocaleString()} row{check.invalid === 1 ? "" : "s"} with problems
                </label>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <Button variant="secondary" onClick={() => setStep("map")}>
              Back to columns
            </Button>
            <Button onClick={importRows} loading={busy} disabled={check.valid === 0 || (check.invalid > 0 && !skipInvalid)}>
              Import {check.valid.toLocaleString()} lead{check.valid === 1 ? "" : "s"}
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && check && (
        <Card className="py-10 text-center">
          <p className="text-lg font-semibold text-slate-900">
            Imported {check.created.toLocaleString()} lead{check.created === 1 ? "" : "s"}
          </p>
          {check.invalid > 0 && <p className="mt-1 text-sm text-slate-500">{check.invalid} row(s) were skipped.</p>}
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
            <Link href="/leads" className="inline-flex items-center rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              View leads
            </Link>
          </div>
        </Card>
      )}
    </>
  );
}

function UploadStep({ busy, onFile }: { busy: boolean; onFile: (f: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFile(e.dataTransfer.files[0]);
  };
  return (
    <Card>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cx(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center",
          over ? "border-indigo-400 bg-indigo-50" : "border-slate-300",
        )}
      >
        <p className="text-sm font-medium text-slate-900">Drop a CSV file here</p>
        <p className="mt-1 text-xs text-slate-500">UTF-8 or Excel CSV, comma or semicolon separated, up to 10 MB</p>
        <Button className="mt-4" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          Choose file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CSV file"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Columns we recognise automatically: Name (or First/Last name), Email, Phone, Company, Source, Status, Value, Owner,
        Tags, Notes.
      </p>
    </Card>
  );
}

function downloadErrors(check: CheckResult, labels: Record<string, string>) {
  const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Row", "Field", "Problem"].map(quote).join(",")];
  for (const r of check.row_errors) {
    for (const [field, msgs] of Object.entries(r.errors)) lines.push([r.row, labels[field] ?? field, msgs.join(" ")].map(quote).join(","));
  }
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "import-errors.csv" });
  a.click();
  URL.revokeObjectURL(url);
}
