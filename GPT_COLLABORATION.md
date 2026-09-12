# 项目协作说明 —— 给 GPT 的入职文档

这份文档是给参与本项目开发的 GPT（ChatGPT / Codex 等）看的，目的是让它在不重新摸索整个代码库的情况下，快速理解项目背景、代码风格、和它在团队里的分工边界。Claude 也在同一个代码库上工作，两者分工见下文"分工"一节。

## 项目是什么

**Tender Intelligence Platform**（招标情报平台）——一个帮助中国企业评估拉美（目前聚焦墨西哥）政府招标项目的中文 B2B SaaS。核心价值：把西语招标信息翻译、结构化、按"是否值得中资企业关注"分级，帮企业快速做投标决策。

- UI 面向中国企业，中文为主要语言（`types/tender.ts` 里几乎所有文本字段都是 `LocalizedText = { es, en, zh }` 三语结构，但产品实际只渲染 zh）
- 数据来源：政府招标网站的公开导出（Excel/CSV/JSON），不是标准 API——每个数据源都有自己的抓取脚本，细节见 `lib/ingestion/README.md`（这个文件很长，但记录了大量真实踩过的坑，改动相关代码前建议先搜索关键词）
- 商业模式正在往"免费标准分析 + 付费精度分析"的两档模式走（Claude Sonnet 5 标准 / Claude Opus 5 精度），目前也在评估用更便宜的 Qwen/Gemini 做翻译和标书分析

## 技术栈

- **Next.js 16**（App Router + Turbopack）——**注意**：这是一个比训练数据更新的版本，API 可能和你记忆中的不一样。已知的重大变化：`middleware.ts` 改名叫 `proxy.ts`（导出函数名也是 `proxy` 不是 `middleware`，见根目录 `proxy.ts`）。写 Next.js 相关代码前，先读 `node_modules/next/dist/docs/` 里对应的指南，不要凭训练记忆猜 API。这条规则写在 `AGENTS.md` 里，那个文件是 `next dev` 自动生成/维护的，**不要手动编辑它**。
- TypeScript（严格模式，`npx tsc --noEmit -p .` 必须无错误才算改完）
- Tailwind CSS（深色模式用 `dark:` 前缀，色板是 zinc 系灰阶，看现有组件抄写法就行，不要引入新的设计系统）
- Supabase（Postgres + Auth + Row Level Security 概念上存在，但实际上服务端读写基本都用 service-role key 绕过 RLS，见下文"权限模型"）
- ESLint（`npm run lint` / `npx eslint <file>` 必须无错误无警告）
- 包管理：npm（有 `package-lock.json`，不要切换到 yarn/pnpm）

## 目录结构速览

```
app/            Next.js App Router 页面 + API 路由
  admin/        后台管理页面（/admin/tenders 是最新加的项目增删改查后台）
  api/          Route Handlers（app/api/admin/tenders/ 是最新的 CRUD API）
components/
  admin/        后台管理相关组件
  tenders/      面向客户的招标列表/详情组件
  layout/       导航栏等公共布局组件
lib/
  ingestion/    数据抓取/映射/入库脚本的核心逻辑（29 个文件，最大最复杂的目录）
  db/           从 Supabase 读数据的封装（tenders.ts）
  relevance.ts  核心筛选/分级规则引擎（见下文，改动需极其谨慎）
  admin-auth.ts 后台管理员权限校验
  currency.ts   多币种转 USD 的汇率表
  industry.ts   行业分类枚举 + 关键词分类逻辑
  tender-labels.ts  各种枚举值的中/英/西文标签映射（写 UI 下拉框时先看这里有没有现成的）
scripts/        用 tsx 直接运行的 CLI 脚本（数据抓取、翻译、重新分类、迁移等）
supabase/migrations/  按编号递增的 SQL 迁移文件（0001_init.sql, 0002_..., 目前到 0009）
types/tender.ts 全项目最核心的类型定义，改之前务必搜索所有引用
```

## 权限模型（写后台/API 代码时必读）

- `/admin/documents-needed` 是老页面，用的是"只要登录就能看"的宽松校验（客户端 `useUser()` 判断）——这是历史遗留，不是新代码该抄的模式。
- `/admin/tenders`（新的项目增删改查后台）用的是真正的管理员白名单：`lib/admin-auth.ts` 的 `isAdminEmail()` / `getAdminUser()`，靠环境变量 `ADMIN_EMAILS`（逗号分隔邮箱）判断，**默认没配置就是谁都不是管理员（fail-closed）**，不是"谁都能进"。所有新的后台写操作（无论页面还是 API 路由）都必须用这个模式校验，且要在 API 路由里单独校验一遍（不能只信任页面层的校验，因为 API 路由是独立可访问的入口）。

## 数据库迁移规范

- `supabase/migrations/000N_描述.sql`，编号递增，不要改已有编号的文件内容（除非明确是修复一个还没上线的迁移）。
- 外键基本都是 `on delete cascade`（见 `0001_init.sql`），新建子表时保持这个约定，除非有明确理由不这样做。
- 迁移写完后需要用户手动去 Supabase SQL Editor 执行——这个仓库里没有自动迁移执行的 CI/CD，写完请在 commit message 或者回复里提醒用户手动执行。

## 代码风格（希望 GPT 产出的代码尽量贴近这个风格，方便 review）

- **注释只写"为什么"，不写"是什么"**——变量/函数名要能自解释做什么；注释是用来记录"这里有个不明显的坑/约束/真实踩过的 bug"，不是复述代码逻辑。
- **不要过度设计**——不需要的抽象、配置项、"以防未来需要"的扩展点，一律不要加。三行重复代码比一个只用一次的抽象更好。
- **不要为不可能发生的情况写防御性代码**——只在真正的系统边界（用户输入、外部 API 返回）做校验，内部函数之间的调用信任类型系统。
- **绝不凭记忆猜第三方 API/SDK 的用法**，尤其是模型 ID、请求参数格式这种容易过时的细节——如果不确定，去搜官方文档确认，或者在代码里写明"未实测/待确认"，参考 `lib/ingestion/translate-titles-qwen.ts` 和 `translate-titles-gemini.ts` 的写法（那两个文件的模型是训练数据之后发布的，所有 API 细节都是联网搜索核实过的，不是猜的）。
- **改动后必须自查**：`npx tsc --noEmit -p .`、`npx eslint <改动的文件>`、如果碰了 `lib/relevance.ts` 相关逻辑，跑 `npm run test:relevance`（40 个真实案例的回归测试，全部必须 PASS）。

## 分工建议（用户的原话，供参考）

- **Claude 负责**：项目架构设计、复杂前端组件、疑难 bug 排查、核心功能重构。
- **GPT 负责**：标准 API 接口的编写、数据库迁移脚本（SQL）、单元测试、代码格式转换、报错信息解释、网站外观设计（视觉/样式，不涉及业务逻辑改动）。

**具体到这个仓库，建议 GPT 优先接手这些任务：**

1. **补单元测试**：目前仓库里没有 Jest/Vitest 之类的测试框架，只有 `scripts/test-relevance.ts` 这种针对 `lib/relevance.ts` 的自定义回归测试（不是标准单测框架）。`lib/currency.ts`、`lib/industry.ts`、`lib/format.ts`、`lib/tender-labels.ts` 这些都是纯函数、逻辑稳定，是很好的单测起点。如果要引入测试框架，建议用 **Vitest**（和 Next.js/TS 生态配合最顺、启动快），装好后把已有的 `npm run test:relevance` 保留（那个是特意设计的"每加一个真实案例就永久保留"的规则回归测试，不要用 Vitest 重写它，两者并存即可）。
2. **标准 CRUD API 路由**：照抄 `app/api/admin/tenders/route.ts` 和 `app/api/admin/tenders/[slug]/route.ts` 的模式（`getAdminUser()` 校验 + `createSupabaseAdminClient()` 读写 + Next.js 16 的 `params: Promise<{...}>` 写法）。
3. **数据库迁移 SQL**：按上面"数据库迁移规范"来写，写完后运行一次 `npx tsc --noEmit -p .` 确认相关 TypeScript 类型（如果新增字段需要同步更新 `types/tender.ts` 和 `lib/db/tenders.ts` 的行映射）没有漏改。
4. **视觉/样式打磨**：现有组件的 Tailwind class 写法可以直接抄，配色、圆角、间距都已经有固定风格（看 `components/admin/DocumentsNeededView.tsx` 或 `components/tenders/` 下的组件即可）。**不要改动组件里的业务逻辑/数据获取逻辑**，只调整样式/布局。
5. **代码格式化、报错信息解释、把某段命令式代码整理得更清晰**——这些都可以放心做，风险低。

**不建议 GPT 单独动的部分（除非明确被要求）：**

- `lib/relevance.ts` 的分级规则本身（阈值、关键词列表）——这是产品的核心筛选逻辑，改动需要理解大量业务背景，且必须跑通 `npm run test:relevance` 的 40 个真实回归案例。
- `lib/admin-auth.ts` 的权限校验逻辑（fail-closed 设计是刻意的安全决策）。
- `lib/ingestion/` 下各数据源的映射/抓取逻辑——每一行几乎都对应一个真实调试出来的坑（编码问题、字段名误解、单位换算等），改之前务必先读该文件的头部注释。
- 涉及金额/货币的字段——本项目的约定是**始终存源货币原始数值 + 货币代码，让 `lib/currency.ts` 统一转换成 USD**，不要信任某个数据源自己算好的 USD 换算值（历史上因为这个踩过坑）。

## 协作流程建议

- 两边都在同一个分支（`claude/ai-tender-intelligence-platform-onfhq1`）上工作时，容易冲突——建议：每次开始改动前先 `git pull`，改完立刻 commit + push，避免长时间占着同一批文件不提交。
- commit message 用英文，说明"为什么改"而不只是"改了什么"（看现有 git log 的风格）。
- 如果 GPT 改动涉及到上面"不建议单独动"的部分，请先在对话里跟用户确认，不要直接改。

---

如果这份文档和实际代码有出入（比如某个约定已经变了），以代码本身和最新的 commit 历史为准，这份文档可能没有第一时间更新。
