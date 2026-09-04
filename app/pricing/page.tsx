"use client";

import Link from "next/link";
import { localize, uiText, useLocale } from "@/lib/i18n";
import { PRICING_TIERS } from "@/lib/pricing";

export default function PricingPage() {
  const { locale } = useLocale();

  return (
    <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-10 px-5 py-14 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-black tracking-[-0.04em] text-[#071826] sm:text-5xl">
          {localize(uiText.pricingTitle, locale)}
        </h1>
        <p className="text-[#64717c]">{localize(uiText.pricingSubtitle, locale)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`relative flex flex-col gap-5 rounded-2xl border bg-[#fffdf9] p-6 ${
              tier.highlighted
                ? "border-[#ffb21c] shadow-[0_24px_60px_-40px_rgba(6,27,43,.55)]"
                : "border-[#dbe2e5]"
            }`}
          >
            {tier.highlighted && (
              <span className="w-fit rounded-full bg-[#ffb21c] px-2.5 py-1 text-xs font-bold text-[#071826]">
                {localize(uiText.mostPopular, locale)}
              </span>
            )}
            <div>
              <h2 className="text-lg font-black text-[#071826]">
                {localize(tier.name, locale)}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#64717c]">{localize(tier.description, locale)}</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-[#071826]">
                {localize(tier.price, locale)}
              </span>
              <span className="text-sm text-zinc-500">{localize(tier.period, locale)}</span>
            </div>
            <ul className="flex flex-1 flex-col gap-2.5 text-sm text-[#52636e]">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-0.5 font-black text-[#b86e00]">✓</span>
                  <span>{localize(feature, locale)}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`rounded-full px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                tier.highlighted
                  ? "bg-[#ffb21c] text-[#071826] hover:bg-[#ffc247]"
                  : "border border-[#0a2b40] text-[#0a2b40] hover:bg-[#0a2b40] hover:text-white"
              }`}
            >
              {localize(tier.cta, locale)}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-[#849098]">{localize(uiText.paymentNotConfigured, locale)}</p>
    </div>
  );
}
