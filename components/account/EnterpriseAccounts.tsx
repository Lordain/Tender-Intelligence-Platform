"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  email: string;
  member_user_id: string | null;
  status: "pending" | "accepted" | "declined";
};

/**
 * Adding an address here sends an INVITATION. It grants nothing until that
 * person accepts it from their own signed-in account, so the status shown
 * per row is the real state of the seat, not just whether they registered.
 */
function statusLabel(member: Member) {
  if (member.status === "accepted") return { text: "已加入 · 完整权限", tone: "text-[#1d7a4c]" };
  if (member.status === "declined") return { text: "已拒绝邀请", tone: "text-[#b42318]" };
  return {
    text: member.member_user_id ? "已注册 · 等待本人接受邀请" : "已发送邀请 · 等待对方注册并接受",
    tone: "text-[#8a7143]",
  };
}

export function EnterpriseAccounts() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // setState lives in the promise callback, not in the effect body — the
  // same shape as lib/use-entitlement.ts, and what react-hooks expects of a
  // fetch-on-mount. Bumping reloadKey is how a write asks for a fresh list.
  useEffect(() => {
    fetch("/api/account/enterprise-members")
      .then((response) => response.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, [reloadKey]);

  async function add() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/account/enterprise-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "添加失败");
        return;
      }
      // Whether the invitation email actually went out matters to the owner:
      // if it didn't, the invitee only finds it by signing in on their own.
      setNotice(data.notified
        ? `邀请已发送至 ${email}，对方确认后席位才会生效。`
        : `邀请已创建，但邮件未能发出。请自行通知 ${email} 登录后到「账户管理」接受邀请。`);
      setEmail("");
      setReloadKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  const usedSeats = members.filter((member) => member.status !== "declined").length;

  return (
    <section className="mt-6 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
      <h2 className="text-xl font-black text-[#071826]">企业账户</h2>
      <p className="mt-2 text-sm leading-6 text-[#64717c]">企业版共支持 3 个邮箱账号。添加后系统会向对方发送邀请，<strong className="font-bold text-[#071826]">经对方本人确认后</strong>才会获得完整权限，并可分别设置通知条件。</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => { setEmail(event.target.value); setError(""); setNotice(""); }}
          placeholder="成员邮箱"
          className="h-11 flex-1 rounded-xl border border-[#d8e0e3] bg-white px-4 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!email || busy || usedSeats >= 2}
          className="h-11 rounded-xl bg-[#ffb21c] px-5 text-sm font-black text-[#071826] disabled:opacity-40"
        >
          {busy ? "发送中…" : "发送邀请"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm font-bold text-[#805100]">{notice}</p>}
      <div className="mt-5 space-y-2">
        {members.map((member) => {
          const status = statusLabel(member);
          return (
            <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#f2f4f3] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#071826]">{member.email}</p>
                <p className={`text-xs font-bold ${status.tone}`}>{status.text}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {member.status === "pending" && !member.member_user_id && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`/register?email=${encodeURIComponent(member.email)}&next=/account`}
                    className="rounded-lg border border-[#b8c4c9] px-3 py-2 text-xs font-bold"
                  >
                    打开注册页
                  </a>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/account/enterprise-members?id=${member.id}`, { method: "DELETE" });
                    setReloadKey((key) => key + 1);
                  }}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                >
                  移除
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[#7a878f]">当前已占用 {usedSeats + 1} / 3 个账号（含主账号；已拒绝的邀请不占席位，移除后可另邀他人）</p>
    </section>
  );
}
