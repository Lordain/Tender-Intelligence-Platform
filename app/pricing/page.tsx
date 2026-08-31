"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { PRICING_TIERS } from "@/lib/pricing";

export default function PricingPage() {
  const { locale } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {localize(uiText.pricingTitle, locale)}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{localize(uiText.pricingSubtitle, locale)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`flex flex-col gap-5 rounded-2xl border p-6 ${
              tier.highlighted
                ? "border-zinc-900 shadow-lg dark:border-zinc-50"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            {tier.highlighted && (
              <span className="w-fit rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
                {localize(uiText.mostPopular, locale)}
              </span>
            )}
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {localize(tier.name, locale)}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">{localize(tier.description, locale)}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {localize(tier.price, locale)}
              </span>
              <span className="text-sm text-zinc-500">{localize(tier.period, locale)}</span>
            </div>
            <ul className="flex flex-1 flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{localize(feature, locale)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`rounded-full px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                tier.highlighted
                  ? "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  : "border border-zinc-200 text-zinc-900 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-50"
              }`}
            >
              {localize(tier.cta, locale)}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-zinc-400">{localize(uiText.paymentNotConfigured, locale)}</p>
    </div>
  );
}
