import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getParticipationGuide, participationGuides } from "@/lib/participation-guides";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return participationGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getParticipationGuide(slug);
  if (!guide) return {};

  return {
    title: `${guide.platform} 参标指南`,
    description: guide.summary,
  };
}

export default async function GuideDetailPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getParticipationGuide(slug);
  if (!guide) notFound();

  const currentIndex = participationGuides.findIndex((item) => item.slug === guide.slug);
  const nextGuide = participationGuides[(currentIndex + 1) % participationGuides.length];

  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <header className="bg-[#061b2b] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/guides" className="inline-flex items-center gap-2 text-sm font-bold text-white/62 transition hover:text-white">← 返回全部参标指南</Link>
          <div className="mt-9 max-w-4xl">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">{guide.country}</span>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">{guide.platform}</span>
              </div>
              <h1 className="mt-5 max-w-4xl text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">{guide.title}</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-white/68">{guide.summary}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Platform introduction</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{guide.platform} 是什么？</h2>
          <p className="mt-4 text-sm leading-8 text-[#52636e] sm:text-base">{guide.whatIs}</p>
        </section>

        <div className="mt-6 rounded-2xl border border-[#e6b13f] bg-[#fff3cf] p-5 sm:p-6">
          <p className="font-black text-[#6d4900]">重要说明</p>
          <p className="mt-2 text-sm leading-7 text-[#6d5a31]">本页用于帮助企业做前期准备，不代表采购方确认您具备资格。具体项目的公告、招标文件、附件、澄清答复及更正通知具有最终效力。</p>
        </div>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {guide.quickFacts.map((fact) => (
            <div key={fact.label} className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a969d]">{fact.label}</p>
              <p className="mt-2 text-sm font-black leading-6">{fact.value}</p>
            </div>
          ))}
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:self-start lg:sticky lg:top-6">
            <div className="rounded-2xl bg-[#061b2b] p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">本页目录</p>
              <nav className="mt-4 space-y-1">
                {guide.sections.map((section) => (
                  <a key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-sm text-white/66 transition hover:bg-white/8 hover:text-white">{section.title}</a>
                ))}
                <a href="#sources" className="block rounded-lg px-3 py-2 text-sm text-white/66 transition hover:bg-white/8 hover:text-white">官方来源</a>
              </nav>
            </div>
            <div className="mt-4 rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b86e00]">适合谁看</p>
              <p className="mt-3 text-sm leading-7 text-[#586873]">{guide.audience}</p>
            </div>
          </aside>

          <div className="space-y-8">
            {guide.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
                <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{section.title}</h2>
                {section.intro && <p className="mt-4 text-sm leading-7 text-[#586873]">{section.intro}</p>}

                {section.steps && (
                  <ol className="mt-7 space-y-6">
                    {section.steps.map((step, index) => (
                      <li key={step.title} className="grid gap-4 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                        <span className="flex size-11 items-center justify-center rounded-full bg-[#ffb21c] font-mono text-sm font-black text-[#071826]">{String(index + 1).padStart(2, "0")}</span>
                        <div className="border-b border-[#e5e9ea] pb-6 last:border-b-0 last:pb-0">
                          <h3 className="font-black">{step.title}</h3>
                          <p className="mt-2 text-sm leading-7 text-[#586873]">{step.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {section.items && (
                  <ul className="mt-6 grid gap-3">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-3 rounded-xl bg-[#f2f3f1] px-4 py-3 text-sm leading-7 text-[#43545f]">
                        <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-[#b86e00]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.note && (
                  <div className="mt-6 border-l-4 border-[#ffb21c] bg-[#fff7e4] px-5 py-4 text-sm leading-7 text-[#66562f]">{section.note}</div>
                )}
              </section>
            ))}

            <section id="sources" className="scroll-mt-8 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">Official sources</p>
              <h2 className="mt-3 text-2xl font-black">官方入口与核验来源</h2>
              <p className="mt-3 text-sm leading-7 text-white/58">建议收藏官方入口，并在准备投标时重新检查最新公告、操作手册与项目文件。</p>
              <div className="mt-6 grid gap-3">
                {guide.sources.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-xl border border-white/12 bg-white/6 px-4 py-4 text-sm font-bold transition hover:border-[#ffb21c] hover:bg-white/10">
                    <span>{source.label}</span><span className="shrink-0 text-[#ffb21c]">打开 ↗</span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="mt-12 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">继续阅读</p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-[#64717c]">下一篇指南</p>
              <h2 className="mt-1 text-xl font-black">{nextGuide.platform}</h2>
            </div>
            <Link href={`/guides/${nextGuide.slug}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black transition hover:bg-[#ffc34d]">查看指南 →</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
