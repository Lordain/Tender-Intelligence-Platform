"use client";

import { useEffect, useState } from "react";

type Invitation = { id: string; invitedBy: string; createdAt: string };

/**
 * The consent step for an enterprise seat. Rendered for every signed-in user,
 * not just enterprise owners — the whole point is that the person being
 * invited decides. Renders nothing at all when there is no invitation waiting.
 */
export function PendingInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // setState lives in the promise callback, not in the effect body — the
  // same shape as lib/use-entitlement.ts, and what react-hooks expects of a
  // fetch-on-mount. reloadKey is how a decline asks for a fresh list.
  useEffect(() => {
    fetch("/api/account/invitations")
      .then((response) => response.json())
      .then((data) => setInvitations(data.invitations ?? []))
      .catch(() => setInvitations([]));
  }, [reloadKey]);

  async function respond(id: string, action: "accept" | "decline") {
    setError("");
    setPendingId(id);
    try {
      const response = await fetch("/api/account/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "操作失败，请稍后重试。");
        return;
      }
      if (action === "decline") {
        setReloadKey((key) => key + 1);
        return;
      }
      // Accepting changes the entitlement, and the plan card, the header and
      // the notification settings all read it independently at mount. A full
      // reload is the one thing that puts every one of them on the new answer.
      window.location.reload();
    } catch {
      setError("网络错误，请稍后重试。");
    } finally {
      setPendingId(null);
    }
  }

  if (invitations.length === 0) return null;

  return (
    <section className="mt-6 rounded-3xl border border-[#efcf80] bg-[#fff7df] p-6 sm:p-8">
      <h2 className="text-xl font-black text-[#071826]">企业版邀请</h2>
      <p className="mt-2 text-sm leading-6 text-[#805100]">以下企业邀请您加入其订阅。接受后您将获得完整项目权限，并可单独设置邮件通知条件。</p>
      {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
      <div className="mt-5 space-y-2">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-[#f0dcae] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#071826]">{invitation.invitedBy}</p>
              <p className="text-xs text-[#8a7143]">邀请时间：{new Date(invitation.createdAt).toLocaleDateString("zh-CN")}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={pendingId === invitation.id}
                onClick={() => respond(invitation.id, "decline")}
                className="rounded-lg border border-[#d8e0e3] px-4 py-2 text-xs font-bold text-[#52636e] hover:bg-[#f1f3f2] disabled:opacity-40"
              >
                拒绝
              </button>
              <button
                type="button"
                disabled={pendingId === invitation.id}
                onClick={() => respond(invitation.id, "accept")}
                className="rounded-lg bg-[#071826] px-4 py-2 text-xs font-black text-white hover:bg-[#163b52] disabled:opacity-40"
              >
                {pendingId === invitation.id ? "处理中…" : "接受邀请"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
