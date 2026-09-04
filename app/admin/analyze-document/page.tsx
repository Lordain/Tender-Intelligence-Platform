import { AnalyzeDocumentForm } from "@/components/admin/AnalyzeDocumentForm";

export default function AdminAnalyzeDocumentPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Document analysis</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">标书附件分析</h1>
      </div>
      <p className="text-sm text-[#52636e]">
        选择项目 slug，上传一份标书文件（PDF / Word），会自动判断有没有真实文字层，路由到 qwen3.5-plus（有文字层，便宜）或
        claude-haiku（扫描件，能看图）分析出资质要求 / 业绩要求 / 所需文件 / 风险提示，也可以勾选&quot;精度分析&quot;强制使用 claude-opus-5。
        上传的文件只在分析这段时间临时保存在服务器上，分析完成（不管成功还是失败）都会立刻删除，不会长期保留原始文件。
      </p>
      <AnalyzeDocumentForm />
    </div>
  );
}
