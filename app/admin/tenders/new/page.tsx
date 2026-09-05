import { AdminTenderForm } from "@/components/admin/AdminTenderForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function NewAdminTenderPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader eyebrow="New record" title="添加新项目" description="补充项目基础资料与来源信息，带 * 的字段为必填项。" backHref="/admin/tenders" />
      <AdminTenderForm />
    </div>
  );
}
