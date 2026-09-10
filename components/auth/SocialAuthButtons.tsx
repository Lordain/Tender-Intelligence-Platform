"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { safeNextPath } from "@/lib/auth-redirect";
import { localize, uiText, useLocale } from "@/lib/i18n";

type SocialAuthButtonsProps = {
  onError: (message: string | null) => void;
};

export function SocialAuthButtons({ onError }: SocialAuthButtonsProps) {
  const { locale } = useLocale();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);

  async function continueWith(provider: "google" | "apple") {
    setLoadingProvider(provider);
    onError(null);

    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        ...(provider === "apple" ? { scopes: "name email" } : {}),
      },
    });

    if (error) {
      onError(error.message);
      setLoadingProvider(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => continueWith("google")}
          disabled={loadingProvider !== null}
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#cfd9dd] bg-white px-4 py-3 text-sm font-bold text-[#071826] transition-colors hover:border-[#9eacb2] hover:bg-[#f7f9f9] disabled:cursor-wait disabled:opacity-60"
        >
          <GoogleIcon />
          {localize(
            loadingProvider === "google" ? uiText.connectingToGoogle : uiText.continueWithGoogle,
            locale,
          )}
        </button>

        <button
          type="button"
          onClick={() => continueWith("apple")}
          disabled={loadingProvider !== null}
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-black bg-black px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#242424] disabled:cursor-wait disabled:opacity-60"
        >
          <AppleIcon />
          {localize(
            loadingProvider === "apple" ? uiText.connectingToApple : uiText.continueWithApple,
            locale,
          )}
        </button>
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[#d8e0e3]" />
        <span className="text-xs font-semibold text-[#87939a]">
          {localize(uiText.orContinueWithEmail, locale)}
        </span>
        <span className="h-px flex-1 bg-[#d8e0e3]" />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.2a10 10 0 0 0 0 9.4l3.3-2.6Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.8-2.8A9.4 9.4 0 0 0 12 2a10 10 0 0 0-8.8 5.3l3.3 2.6a5.8 5.8 0 0 1 5.5-4Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M16.7 12.7c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 1-3.8 1-.8 0-2-1-3.3-1a4.9 4.9 0 0 0-4.1 2.5c-1.8 3-.5 7.5 1.3 10 .9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.4-.8 1.5 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.2 4.2 0 0 1-3.1-3.9ZM14.2 5.4A4.3 4.3 0 0 0 15.3 2a4.7 4.7 0 0 0-3 1.6 4 4 0 0 0-1.1 3.3 3.9 3.9 0 0 0 3-1.5Z" />
    </svg>
  );
}
