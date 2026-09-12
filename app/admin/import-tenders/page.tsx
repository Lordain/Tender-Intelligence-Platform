import { redirect } from "next/navigation";

/** Bare /admin/import-tenders has no content of its own now that the page is split per country — Mexico is first alphabetically/historically, so it's the default landing tab. */
export default function AdminImportTendersIndexPage() {
  redirect("/admin/import-tenders/mexico");
}
