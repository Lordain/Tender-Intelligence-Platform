"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device-id";

type Device = {
  deviceId: string;
  label: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

function relative(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / (60 * 24))} 天前`;
}

/**
 * The owner's view of the device cap, and the reason the cap is safe to
 * ship: someone who changed laptops, cleared their site data, or signed in
 * from a hotel PC can free a slot themselves. Without this every complaint
 * about the limit lands on support as a manual database edit.
 */
export function AccountDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [limit, setLimit] = useState(3);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const deviceId = getDeviceId() ?? "";
    fetch(`/api/account/devices?deviceId=${encodeURIComponent(deviceId)}`)
      .then((response) => response.json())
      .then((data) => {
        setDevices(data.devices ?? []);
        if (typeof data.limit === "number") setLimit(data.limit);
      })
      .catch(() => setDevices([]));
  }, []);

  useEffect(load, [load]);

  async function remove(device: Device) {
    // Removing the browser you are reading this in signs you out of it, so
    // it is worth one confirmation rather than a surprise.
    if (device.isCurrent && !confirm("这是您当前正在使用的设备，移除后需要重新登录。确定吗？")) return;
    setBusy(device.deviceId);
    setError("");
    try {
      const response = await fetch(`/api/account/devices?deviceId=${encodeURIComponent(device.deviceId)}`, { method: "DELETE" });
      if (!response.ok) {
        setError((await response.json().catch(() => ({}))).error ?? "移除失败");
        return;
      }
      load();
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
      <h2 className="text-xl font-black text-[#071826]">登录设备</h2>
      <p className="mt-2 text-sm leading-6 text-[#64717c]">
        每个账号最多同时在 {limit} 台设备上登录。超出时，最久没有使用的那台会被自动登出——不会影响您正在用的这台。
        换了电脑或不再使用某台设备，可以在这里直接移除。
      </p>

      {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}

      <div className="mt-5 space-y-2">
        {devices.length === 0 && <p className="text-sm text-[#7a878f]">暂无记录。</p>}
        {devices.map((device) => (
          <div key={device.deviceId} className="flex items-center justify-between gap-3 rounded-xl bg-[#f2f4f3] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#071826]">
                {device.label}
                {device.isCurrent && <span className="ml-2 rounded-full bg-[#ffb21c] px-2 py-0.5 text-[10px] font-black text-[#071826]">当前设备</span>}
              </p>
              <p className="text-xs font-bold text-[#8a7143]">最近活动 {relative(device.lastSeenAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(device)}
              disabled={busy === device.deviceId}
              className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-40"
            >
              {busy === device.deviceId ? "移除中…" : "移除"}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-[#7a878f]">
        已登录 {devices.length} / {limit} 台。需要多人同时使用，请改用企业版：可添加 2 个成员账号，各自独立登录并单独计算设备数。
      </p>
    </section>
  );
}
