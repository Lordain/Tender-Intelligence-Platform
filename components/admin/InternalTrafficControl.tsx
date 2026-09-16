"use client";

import { useState } from "react";

export function InternalTrafficControl({ initiallyMarked }: { initiallyMarked: boolean }) {
  const [marked, setMarked] = useState(initiallyMarked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function updateMarker() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/analytics/internal-device", {
        method: marked ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("request failed");
      setMarked(!marked);
    } catch {
      setError("设置失败，请刷新后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#071826]">本设备访问</p>
          <p className="mt-1 text-xs leading-5 text-[#71808a]">
            {marked
              ? "已标记为内部设备；即使退出登录，今后在此浏览器产生的访问也会单独统计。"
              : "管理员登录期间会自动识别为内部访问；标记本设备后，退出登录测试也不会混入客户流量。"}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={updateMarker}
          className={`rounded-lg px-4 py-2 text-xs font-black transition-colors disabled:cursor-wait disabled:opacity-60 ${
            marked ? "bg-[#edf1f2] text-[#425461] hover:bg-[#e1e7e9]" : "bg-[#061b2b] text-white hover:bg-[#0b3049]"
          }`}
        >
          {pending ? "处理中…" : marked ? "取消内部标记" : "将本设备标记为内部"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-[#b42318]">{error}</p>}
    </div>
  );
}
