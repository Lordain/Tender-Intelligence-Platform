import { notFound } from "next/navigation";
import { getTenderBySlug } from "@/lib/tenders";
import { TenderDetailView } from "@/components/tenders/TenderDetailView";

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tender = await getTenderBySlug(slug);

  if (!tender) {
    notFound();
  }

  return <TenderDetailView tender={tender} />;
}
