"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const countries = [{ value: "Mexico", label: "墨西哥" }, { value: "Brazil", label: "巴西" }, { value: "Colombia", label: "哥伦比亚" }, { value: "Peru", label: "秘鲁" }];

export function BasicCountrySelection({ selectedCountry }: { selectedCountry: string | null }) {
  const router = useRouter();
  const [country, setCountry] = useState("Mexico");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = countries.find((item) => item.value === selectedCountry);
  return <section className="mt-6 rounded-2xl border border-[#dbe2e5] bg-white p-5">
    <h2 className="text-lg font-black text-[#071826]">基础版国家</h2>
    {selected ? <p className="mt-2 text-sm text-[#425461]">您已选择{selected.label}，当前订阅期间可查看该国全部项目详情。</p> : <>
      <p className="mt-2 text-sm text-[#64717c]">请选择一个国家以解锁完整项目详情。选定后，本次订阅期间不可更改。</p>
      <div className="mt-4 flex flex-wrap gap-3"><select value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-xl border border-[#dbe2e5] px-4 py-2 text-sm">{countries.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <button type="button" disabled={saving} onClick={async () => { setSaving(true); setError(""); const response = await fetch("/api/account/basic-country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) }); const result = await response.json(); setSaving(false); if (!response.ok) setError(result.error ?? "保存失败"); else { router.refresh(); window.location.reload(); } }} className="rounded-xl bg-[#061b2b] px-5 py-2 text-sm font-bold text-white">{saving ? "保存中…" : "确认国家"}</button></div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </>}
  </section>;
}
