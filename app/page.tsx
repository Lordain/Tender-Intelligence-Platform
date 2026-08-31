import { getAllTenders } from "@/lib/tenders";
import { HomeHero } from "@/components/tenders/HomeHero";
import { FeaturedTenders } from "@/components/tenders/FeaturedTenders";

const FEATURED_COUNT = 3;

export default async function Home() {
  const tenders = await getAllTenders();
  const featured = tenders
    .slice()
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
    .slice(0, FEATURED_COUNT);

  return (
    <div className="flex flex-col">
      <HomeHero />
      <FeaturedTenders tenders={featured} />
    </div>
  );
}
