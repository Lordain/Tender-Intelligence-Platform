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
  const [copied, setCopied] = useState("");

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
      // Even a send Resend accepted can land in 垃圾邮件, so "已发送" must not
      // read as "已送达" — the owner needs to know the link is the reliable path.
      setNotice(data.notified
        ? `邀请已发送至 ${email}。邮件可能被判为垃圾邮件，建议同时用下方「复制邀请链接」通过微信等方式发给对方。`
        : `邀请已创建，但邮件未能发出。请用下方「复制邀请链接」把链接发给 ${email}。`);
      setEmail("");
      setReloadKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  const usedSeats = members.filter((member) => member.status !== "declined").length;

  /**
   * The same destination the invitation email points at, for the owner to
   * send through their own channel.
   *
   * Gmail put the invitation in 垃圾邮件 on 2026-09-13 while the nightly
   * digest from the same domain and the same Resend account reached the
   * inbox. The difference is not the markup: a digest goes to someone who
   * registered and has opened our mail before, and an invitation goes to an
   * address that has never had any contact with this domain. No amount of
   * HTML tuning earns that relationship, so the invitee has to be reachable
   * without it — and a message from a colleague they already correspond with
   * lands where ours cannot.
   *
   * It grants nothing on its own: accepting still requires signing in as the
   * invited address, so a link forwarded to the wrong person is inert.
   */
  function inviteLink(member: Member) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return member.member_user_id
      ? `${origin}/account`
      : `${origin}/register?email=${encodeURIComponent(member.email)}&next=/account`;
  }

  async function copyInviteLink(member: Member) {
    try {
      await navigator.clipboard.writeText(inviteLink(member));
      setCopied(member.id);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      // Clipboard access can be refused (http, or a permission prompt the
      // user dismissed). Say so rather than silently doing nothing.
      setError("复制失败，请手动复制：" + inviteLink(member));
    }
  }

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
                {member.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => copyInviteLink(member)}
                    className="rounded-lg border border-[#b8c4c9] px-3 py-2 text-xs font-bold"
                  >
                    {copied === member.id ? "已复制" : "复制邀请链接"}
                  </button>
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
