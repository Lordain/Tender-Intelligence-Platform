import { AdminTenderForm } from "@/components/admin/AdminTenderForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function NewAdminTenderPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="New record"
        title="添加新项目"
        description="填写项目资料、状态与预算、关键日期和官方正式投标入口。创建后将自动进入编辑页，可继续补充分析结果并查看前台效果；带 * 的字段为必填项。"
        backHref="/admin/tenders"
      />
      <AdminTenderForm />
    </div>
  );
}
