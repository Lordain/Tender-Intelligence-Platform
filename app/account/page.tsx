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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-14 sm:px-8">
      <h1 className="text-4xl font-black tracking-tight text-[#071826]">
        {localize(uiText.account, locale)}
      </h1>

      <section className="flex flex-col gap-5 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6">
        <div>
          <div className="text-xs text-[#849098]">{localize(uiText.emailLabel, locale)}</div>
          <div className="font-bold text-[#071826]">{user.email}</div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[#52636e]">
              {localize(uiText.companyNameLabel, locale)}
            </span>
            <input
              type="text"
              value={companyName}
              onChange={(event) => {
                setCompanyName(event.target.value);
                setSaved(false);
              }}
              className="h-11 rounded-xl border border-[#d8e0e3] bg-white px-3 text-sm focus:border-[#ffb21c] focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="self-start rounded-xl bg-[#ffb21c] px-4 py-2.5 text-xs font-black text-[#071826] transition-colors hover:bg-[#ffc247] disabled:opacity-50"
            >
              {localize(uiText.saveProfile, locale)}
            </button>
            {saved && (
              <span className="text-xs text-emerald-600">{localize(uiText.profileSaved, locale)}</span>
            )}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-[#061b2b] p-6 text-white">
        <div className="text-xs text-white/55">{localize(uiText.currentPlan, locale)}</div>
        <div className="font-bold">
          {plan ?? localize(uiText.freePlan, locale)}
        </div>
        <Link
          href="/pricing"
          className="w-fit text-xs font-bold text-[#ffb21c] underline underline-offset-4"
        >
          {localize(uiText.viewPlans, locale)}
        </Link>
      </section>
    </div>
  );
}
