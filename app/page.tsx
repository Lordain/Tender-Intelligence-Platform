import { getAllTenders } from "@/lib/tenders";
import { fetchHomepageFeaturedCount } from "@/lib/db/site-settings";
import { HomeHero } from "@/components/tenders/HomeHero";
import { FeaturedTenders } from "@/components/tenders/FeaturedTenders";
import { ValuePropositions } from "@/components/home/ValuePropositions";

export default async function Home() {
  const [tenders, featuredCount] = await Promise.all([getAllTenders(), fetchHomepageFeaturedCount()]);

  // Admin-picked tenders (app/admin/tenders — the "首页" checkbox) come
  // first, most recent first; if fewer than featuredCount were picked, the
  // rest is auto-filled with the next most recent tenders so the homepage
  // never looks sparse just because an admin hasn't curated it yet.
  const manuallyFeatured = tenders
    .filter((t) => t.homepageFeatured)
    .slice()
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  const manuallyFeaturedSlugs = new Set(manuallyFeatured.map((t) => t.slug));
  const autoFill = tenders
    .filter((t) => !manuallyFeaturedSlugs.has(t.slug))
    .slice()
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  const featured = [...manuallyFeatured, ...autoFill].slice(0, featuredCount);

  return (
    <div className="flex flex-col">
      <HomeHero tenders={featured} />
      <FeaturedTenders tenders={featured} />
      <ValuePropositions />
    </div>
  );
}
