"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { localize, uiText, useLocale } from "@/lib/i18n";

const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function AccountPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const { user, loading } = useUser();
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || loading) return;
    if (!user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    supabase
      .from("profiles")
      .select("company_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setCompanyName(data?.company_name ?? ""));

    supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => setPlan(data?.plan ?? null));
  }, [user]);

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);

    const supabase = getSupabaseBrowserClient();
    // A profiles row always exists by now (created by the on-signup trigger),
    // so this is a plain update — RLS only grants update, not insert, on this table.
    await supabase.from("profiles").update({ company_name: companyName }).eq("id", user.id);

    setSaving(false);
    setSaved(true);
  }

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="text-sm text-zinc-500">{localize(uiText.authNotConfigured, locale)}</p>
      </div>
    );
  }

  if (loading || !user) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {localize(uiText.account, locale)}
      </h1>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div>
          <div className="text-xs text-zinc-400">{localize(uiText.emailLabel, locale)}</div>
          <div className="font-medium text-zinc-900 dark:text-zinc-50">{user.email}</div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">
              {localize(uiText.companyNameLabel, locale)}
            </span>
            <input
              type="text"
              value={companyName}
              onChange={(event) => {
                setCompanyName(event.target.value);
                setSaved(false);
              }}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="self-start rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {localize(uiText.saveProfile, locale)}
            </button>
            {saved && (
              <span className="text-xs text-emerald-600">{localize(uiText.profileSaved, locale)}</span>
            )}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="text-xs text-zinc-400">{localize(uiText.currentPlan, locale)}</div>
        <div className="font-medium text-zinc-900 dark:text-zinc-50">
          {plan ?? localize(uiText.freePlan, locale)}
        </div>
        <Link
          href="/pricing"
          className="w-fit text-xs font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50"
        >
          {localize(uiText.viewPlans, locale)}
        </Link>
      </section>
    </div>
  );
}
