"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BASIC_PLAN_COUNTRY_LIMIT } from "@/lib/access-control";

const countries = [{ value: "Mexico", label: "墨西哥" }, { value: "Brazil", label: "巴西" }, { value: "Colombia", label: "哥伦比亚" }, { value: "Peru", label: "秘鲁" }, { value: "Chile", label: "智利" }, { value: "Argentina", label: "阿根廷" }, { value: "Dominican Republic", label: "多米尼加" }, { value: "Panama", label: "巴拿马" }, { value: "Ecuador", label: "厄瓜多尔" }, { value: "Bolivia", label: "玻利维亚" }];

const labelOf = (value: string) => countries.find((item) => item.value === value)?.label ?? value;

export function BasicCountrySelection({ selectedCountries }: { selectedCountries: string[] }) {
  const router = useRouter();
  const remaining = Math.max(0, BASIC_PLAN_COUNTRY_LIMIT - selectedCountries.length);
  const [picks, setPicks] = useState<string[]>(() => Array(remaining).fill(""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chosen = picks.filter(Boolean);
  const selectedText = selectedCountries.map(labelOf).join("、");
  return <section className="mt-6 rounded-2xl border border-[#dbe2e5] bg-white p-5">
    <h2 className="text-lg font-black text-[#071826]">基础版国家</h2>
    {selectedCountries.length > 0 && <p className="mt-2 text-sm text-[#425461]">您已选择{selectedText}，当前订阅期间可查看{selectedCountries.length > 1 ? "这些国家" : "该国"}全部项目详情。</p>}
    {remaining > 0 && <>
      <p className="mt-2 text-sm text-[#64717c]">{selectedCountries.length > 0 ? `还可再选择 ${remaining} 个国家。` : `可选择 ${BASIC_PLAN_COUNTRY_LIMIT} 个国家以解锁完整项目详情。`}选定后，本次订阅期间不可更改。</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {picks.map((pick, index) => <select key={index} aria-label={`选择第 ${selectedCountries.length + index + 1} 个国家`} value={pick} onChange={(event) => setPicks(picks.map((item, at) => at === index ? event.target.value : item))} className="rounded-xl border border-[#dbe2e5] px-4 py-2 text-sm">
          <option value="">{remaining > 1 ? `第 ${selectedCountries.length + index + 1} 个国家` : "选择国家"}</option>
          {countries.filter((item) => !selectedCountries.includes(item.value) && !picks.some((other, at) => at !== index && other === item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>)}
        <button type="button" disabled={saving || chosen.length === 0} onClick={async () => { setSaving(true); setError(""); const response = await fetch("/api/account/basic-country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ countries: chosen }) }); const result = await response.json(); setSaving(false); if (!response.ok) setError(result.error ?? "保存失败"); else { router.refresh(); window.location.reload(); } }} className="rounded-xl bg-[#061b2b] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "确认国家"}</button></div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </>}
  </section>;
}
