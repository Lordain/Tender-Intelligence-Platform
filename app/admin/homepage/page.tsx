import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { HomepageControlPanel } from "@/components/admin/HomepageControlPanel";
import { fetchHomepageControlSettings } from "@/lib/db/site-settings";
import { getAllTenders } from "@/lib/tenders";

export default async function AdminHomepagePage() {
  const [tenders, settings] = await Promise.all([getAllTenders(), fetchHomepageControlSettings()]);
  const sorted = tenders.slice().sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));

  const legacyFeatured = [
    ...sorted.filter((tender) => tender.homepageFeatured),
    ...sorted.filter((tender) => !tender.homepageFeatured),
  ].slice(0, settings.featuredCount);
  const featuredSlugs = settings.featuredSlugs ?? legacyFeatured.map((tender) => tender.slug);
  const featuredSet = new Set(featuredSlugs);
  const tickerSlugs = settings.tickerSlugs
    ?? sorted.filter((tender) => !featuredSet.has(tender.slug)).slice(0, settings.tickerCount).map((tender) => tender.slug);

  const options = tenders.map((tender) => ({
    id: tender.id,
    slug: tender.slug,
    tenderNumber: tender.tenderNumber,
    title: tender.title,
    country: tender.country,
    publicationDate: tender.publicationDate,
  }));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Homepage control"
        title="首页控制"
        description="分别管理首页免费展示项目与滚动预览项目；两处项目互不重复，添加顺序就是前台展示顺序。"
      />
      <HomepageControlPanel
        tenders={options}
        initialFeaturedSlugs={featuredSlugs}
        initialTickerSlugs={tickerSlugs}
        initialFeaturedCount={settings.featuredCount}
        initialTickerCount={settings.tickerCount}
      />
    </div>
  );
}
