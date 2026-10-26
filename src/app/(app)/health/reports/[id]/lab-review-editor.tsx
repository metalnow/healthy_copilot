"use client";

import { useState, useTransition } from "react";
import { FormError, inputClass } from "@/components/form";
import { LOW_CONFIDENCE } from "@/lib/ai/draft";
import { ABNORMAL_FLAGS } from "@/lib/enums";
import { LAB_CATALOG, LAB_CATEGORIES, toCanonicalUnit } from "@/lib/labs/catalog";
import { FLAG_LABELS } from "@/lib/labs/format";
import type { FollowUpDraft } from "@/lib/follow-ups";
import type { LabDraftItem } from "@/lib/labs/review";
import { confirmLabs } from "../../actions";

type Row = LabDraftItem & { key: number };
type FollowUpRow = FollowUpDraft & { key: number };
let nextKey = 1;

const smallInput = `${inputClass} px-2 py-1.5 text-sm`;

function numberOrUndefined(value: string) {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function CodeSelect({ value, onChange }: { value: string; onChange: (code: LabDraftItem["code"]) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LabDraftItem["code"])}
      aria-label="對應項目"
      className={smallInput}
    >
      {Object.entries(LAB_CATEGORIES).map(([category, label]) => (
        <optgroup key={category} label={label}>
          {LAB_CATALOG.filter((d) => d.category === category).map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function LabReviewEditor({
  documentId,
  initial,
  notes,
}: {
  documentId: string;
  initial: { reportDate?: string; institution?: string; items: LabDraftItem[]; followUps: FollowUpDraft[] };
  notes?: string;
}) {
  const [reportDate, setReportDate] = useState(initial.reportDate ?? "");
  const [institution, setInstitution] = useState(initial.institution ?? "");
  const [rows, setRows] = useState<Row[]>(() => initial.items.map((i) => ({ ...i, key: nextKey++ })));
  const [followUps, setFollowUps] = useState<FollowUpRow[]>(() => initial.followUps.map((f) => ({ ...f, key: nextKey++ })));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const updateFollowUp = (key: number, patch: Partial<FollowUpDraft>) =>
    setFollowUps((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const update = (key: number, patch: Partial<LabDraftItem>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch, confidence: undefined } : r)));

  const save = () =>
    startTransition(async () => {
      setError(undefined);
      const items = rows.map((row) => {
        const item: Partial<Row> = { ...row };
        delete item.key;
        return item as LabDraftItem;
      });
      const result = await confirmLabs({
        documentId,
        reportDate,
        institution: institution.trim() || undefined,
        items,
        // 完全空白的追蹤列直接略過
        followUps: followUps.filter((f) => f.finding.trim() || f.action.trim()).map((f) => ({ finding: f.finding, action: f.action, department: f.department, intervalMonths: f.intervalMonths })),
      });
      if (result?.error) setError(result.error);
    });

  const lowCount = rows.filter((r) => r.confidence !== undefined && r.confidence < LOW_CONFIDENCE).length;

  return (
    <div className="space-y-4">
      {notes && <p className="text-sm text-muted">AI 備註：{notes}</p>}
      <p className="text-sm text-muted">
        AI 擷取出 {rows.length} 項，請對照原始報告逐項確認。
        {lowCount > 0 && <span className="text-warning">其中 {lowCount} 項信心較低，已標示。</span>}
        單位會在儲存時自動換算成標準單位。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">檢查日期</span>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">醫療院所</span>
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={100} className={inputClass} />
        </label>
      </div>

      <ul className="space-y-3">
        {rows.map((row, index) => {
          const low = row.confidence !== undefined && row.confidence < LOW_CONFIDENCE;
          const converted =
            row.value !== undefined && row.unit ? toCanonicalUnit(row.code, row.value, row.unit) : null;
          return (
            <li
              key={row.key}
              className={`space-y-2 rounded-xl border bg-surface p-3 ${low ? "border-warning/60" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  第 {index + 1} 項{row.page && `・報告第 ${row.page} 頁`}
                  {low && <span className="ml-2 text-warning">信心低，請確認</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  aria-label={`刪除第 ${index + 1} 項`}
                  className="px-1"
                >
                  刪除
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={row.displayName}
                  onChange={(e) => update(row.key, { displayName: e.target.value })}
                  aria-label={`第 ${index + 1} 項名稱`}
                  className={smallInput}
                />
                <CodeSelect value={row.code} onChange={(code) => update(row.key, { code })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  inputMode="decimal"
                  defaultValue={row.value ?? ""}
                  onChange={(e) => update(row.key, { value: numberOrUndefined(e.target.value) })}
                  placeholder="數值"
                  aria-label={`第 ${index + 1} 項數值`}
                  className={smallInput}
                />
                <input
                  value={row.unit ?? ""}
                  onChange={(e) => update(row.key, { unit: e.target.value || undefined })}
                  placeholder="單位"
                  aria-label={`第 ${index + 1} 項單位`}
                  className={smallInput}
                />
                <select
                  value={row.abnormalFlag ?? ""}
                  onChange={(e) =>
                    update(row.key, {
                      abnormalFlag: (e.target.value || undefined) as LabDraftItem["abnormalFlag"],
                    })
                  }
                  aria-label={`第 ${index + 1} 項標示`}
                  className={smallInput}
                >
                  <option value="">依參考值</option>
                  {ABNORMAL_FLAGS.filter((f) => f !== "unknown").map((f) => (
                    <option key={f} value={f}>
                      {FLAG_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={row.textValue ?? ""}
                  onChange={(e) => update(row.key, { textValue: e.target.value || undefined })}
                  placeholder="文字結果（陰性…）"
                  aria-label={`第 ${index + 1} 項文字結果`}
                  className={`${smallInput} col-span-1`}
                />
                <input
                  inputMode="decimal"
                  defaultValue={row.referenceMin ?? ""}
                  onChange={(e) => update(row.key, { referenceMin: numberOrUndefined(e.target.value) })}
                  placeholder="參考下限"
                  aria-label={`第 ${index + 1} 項參考下限`}
                  className={smallInput}
                />
                <input
                  inputMode="decimal"
                  defaultValue={row.referenceMax ?? ""}
                  onChange={(e) => update(row.key, { referenceMax: numberOrUndefined(e.target.value) })}
                  placeholder="參考上限"
                  aria-label={`第 ${index + 1} 項參考上限`}
                  className={smallInput}
                />
              </div>
              {converted?.converted && (
                <p className="text-xs text-muted">
                  將換算為 {converted.value} {converted.unit}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setRows((current) => [...current, { key: nextKey++, code: "OTHER", displayName: "" }])}
        className="text-sm text-accent"
      >
        ＋ 新增一項
      </button>

      <section className="space-y-3 border-t border-border pt-4">
        <h3 className="font-semibold">追蹤建議</h3>
        <p className="text-sm text-muted">
          {followUps.length > 0
            ? "AI 從報告的健康建議、醫師評語整理出以下追蹤事項，確認後會加入「追蹤事項」。不需要的可以刪除。"
            : "報告上沒有找到追蹤建議。需要時可以自己新增。"}
        </p>
        <ul className="space-y-3">
          {followUps.map((f, index) => (
            <li key={f.key} className="space-y-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>追蹤 {index + 1}</span>
                <button
                  type="button"
                  onClick={() => setFollowUps((current) => current.filter((x) => x.key !== f.key))}
                  aria-label={`刪除追蹤 ${index + 1}`}
                  className="px-1"
                >
                  刪除
                </button>
              </div>
              <input
                value={f.finding}
                onChange={(e) => updateFollowUp(f.key, { finding: e.target.value })}
                placeholder="發現，例如 膽囊息肉 0.4 cm"
                aria-label={`追蹤 ${index + 1} 發現`}
                maxLength={200}
                className={smallInput}
              />
              <input
                value={f.action}
                onChange={(e) => updateFollowUp(f.key, { action: e.target.value })}
                placeholder="建議作法，例如 6 個月後複檢超音波"
                aria-label={`追蹤 ${index + 1} 建議作法`}
                maxLength={300}
                className={smallInput}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={f.department ?? ""}
                  onChange={(e) => updateFollowUp(f.key, { department: e.target.value || undefined })}
                  placeholder="科別"
                  aria-label={`追蹤 ${index + 1} 科別`}
                  maxLength={50}
                  className={smallInput}
                />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    inputMode="numeric"
                    value={f.intervalMonths ?? ""}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      updateFollowUp(f.key, { intervalMonths: e.target.value && n >= 1 && n <= 60 ? n : undefined });
                    }}
                    placeholder="—"
                    aria-label={`追蹤 ${index + 1} 幾個月後`}
                    className={`${smallInput} w-16`}
                  />
                  個月後
                </label>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setFollowUps((current) => [...current, { key: nextKey++, finding: "", action: "" }])}
          className="text-sm text-accent"
        >
          ＋ 新增追蹤
        </button>
      </section>

      <FormError message={error} />
      <button
        type="button"
        onClick={save}
        disabled={pending || rows.length === 0 || !reportDate}
        className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground disabled:opacity-60"
      >
        {pending ? "儲存中…" : `確認儲存 ${rows.length} 項${followUps.length ? `與 ${followUps.length} 個追蹤` : ""}`}
      </button>
    </div>
  );
}
