"use client";

/**
 * A stable id for this browser profile, used by the device cap.
 *
 * Same mechanism as the analytics session id in lib/analytics-client.ts:
 * localStorage, minted once, never expiring. That makes it a browser
 * identifier rather than a fingerprint — nothing is derived from the
 * machine, so two browsers on one laptop are two devices and a browser
 * whose site data is cleared becomes a new one.
 *
 * The cap counts generously as a result, which is why exceeding it evicts
 * the stalest device instead of refusing a sign-in, and why the owner can
 * remove a device from 账户管理 themselves.
 */
const DEVICE_KEY = "tender-intelligence:device-id";

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // Private mode, or site data blocked. Returning null makes the caller
    // skip the whole mechanism rather than mint a fresh id on every page
    // load, which would burn through the cap in three clicks.
    return null;
  }
}
