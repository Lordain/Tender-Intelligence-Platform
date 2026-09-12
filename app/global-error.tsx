"use client";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself,
 * which app/error.tsx cannot — it renders INSIDE that layout. Because the
 * layout failed, this component replaces the whole document and has to
 * supply its own <html>/<body>, and it cannot rely on anything the layout
 * provides (fonts, LocaleProvider, Header/Footer), so every style here is
 * inline on purpose rather than a Tailwind class that may not have loaded.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="zh">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fffdf9", color: "#071826" }}>
        <div style={{ maxWidth: "40rem", margin: "0 auto", padding: "5rem 1.25rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 900, margin: 0 }}>网站暂时无法加载</h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#64717c" }}>
            请稍后刷新页面重试。如果问题持续存在，请把下面的错误编号发给我们。
          </p>
          {error.digest && (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem", color: "#52636e" }}>
              错误编号：{error.digest}
            </p>
          )}
          {/* A plain <a>, not next/link, on purpose: the root layout is what
              failed, so a client-side navigation would re-mount the same
              broken tree. This needs a full document load. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ display: "inline-block", marginTop: "1rem", background: "#ffb21c", color: "#071826", padding: "0.625rem 1.25rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 900, textDecoration: "none" }}>
            返回首页
          </a>
        </div>
      </body>
    </html>
  );
}
