"use client";

import { useEffect, useState } from "react";

type Member = { id: string; email: string; member_user_id: string | null };

export function EnterpriseAccounts() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const load = () => fetch("/api/account/enterprise-members").then((r) => r.json()).then((d) => setMembers(d.members ?? []));
  useEffect(() => { void load(); }, []);

  async function add() {
    setError("");
    const response = await fetch("/api/account/enterprise-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "添加失败");
    setEmail(""); await load();
  }

  return (
    <section className="mt-6 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
      <h2 className="text-xl font-black text-[#071826]">企业账户</h2>
      <p className="mt-2 text-sm leading-6 text-[#64717c]">企业版共支持 3 个邮箱账号。成员注册后自动获得完整权限，并可分别设置通知条件。</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="成员邮箱" className="h-11 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm" /><button type="button" onClick={add} disabled={!email || members.length >= 2} className="h-11 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] disabled:opacity-40">添加企业账户</button></div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f2f4f3] px-4 py-3"><div><p className="text-sm font-bold text-[#071826]">{member.email}</p><p className="text-xs text-[#71808a]">{member.member_user_id ? "已注册 · 完整权限" : "等待注册"}</p></div><div className="flex gap-2">{!member.member_user_id && <a target="_blank" rel="noreferrer" href={`/register?email=${encodeURIComponent(member.email)}&next=/notifications`} className="rounded-lg border border-[#b8c4c9] px-3 py-2 text-xs font-bold">打开注册页</a>}<button type="button" onClick={async () => { await fetch(`/api/account/enterprise-members?id=${member.id}`, { method: "DELETE" }); await load(); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">移除</button></div></div>)}</div>
      <p className="mt-4 text-xs text-[#7a878f]">当前共 {members.length + 1} / 3 个账号（含主账号）</p>
    </section>
  );
}
