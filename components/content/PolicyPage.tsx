import Link from "next/link";

export type PolicySection = { id: string; title: string; paragraphs: string[]; items?: string[] };

export function PolicyPage({ eyebrow, title, intro, updated, sections }: { eyebrow: string; title: string; intro: string; updated: string; sections: PolicySection[] }) {
  return (
    <div className="bg-[#f7f4ee]">
      <header className="border-b border-white/10 bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffb21c]">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-white/68">{intro}</p>
          <p className="mt-7 text-xs text-white/42">最后更新：{updated}</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-16">
        <aside>
          <nav className="sticky top-8 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-4">
            <p className="px-2 text-xs font-bold text-[#8b5b00]">本页目录</p>
            <div className="mt-2 space-y-1">
              {sections.map((section, index) => <Link key={section.id} href={`#${section.id}`} className="block rounded-lg px-2 py-2 text-xs leading-5 text-[#52636e] hover:bg-[#edf2f3] hover:text-[#071826]">{index + 1}. {section.title}</Link>)}
            </div>
          </nav>
        </aside>
        <article className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-2 sm:px-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-8 border-b border-[#e3e8ea] py-8 last:border-0">
              <p className="text-xs font-black text-[#b86e00]">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 text-xl font-black text-[#071826]">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[#52636e]">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items && <ul className="list-disc space-y-2 pl-5">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
