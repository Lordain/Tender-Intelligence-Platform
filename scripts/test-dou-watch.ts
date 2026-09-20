/**
 * The DOU watch, run against the three real captures in `__fixtures__/dou/`.
 *
 * Nothing here touches the network: in.gov.br closes the socket on the user's
 * laptop and is outside this sandbox's allowlist entirely, so a test that
 * needed it would only ever run on the GitHub runner — which is a test that
 * stops being run. Every rule the watch applies is pure, and that is on
 * purpose.
 *
 * The two claims worth pinning are the ones the whole design rests on:
 *
 *   1. **in.gov.br's own search is noise.** Both captured searches are
 *      asserted to be full of things nobody asked for. If that ever stops
 *      being true, filtering a whole 2,139-notice edition locally stops being
 *      the right shape and this test should fail to say so.
 *   2. **All four axes are load-bearing.** Each one is removed in turn and
 *      the junk it was holding back is counted.
 */
import { readFileSync } from "node:fs";
import {
  douEditionUrl,
  douNoticeUrl,
  parseDouDate,
  readDouPayload,
  type DouNotice,
} from "@/lib/ingestion/dou-edition";
import { recentWeekdays, lastWeekday } from "@/lib/ingestion/connectors/dou-live";
import {
  classifyDouForm,
  classifyDouStage,
  watchDouEdition,
  DOU_NEVER_WATCHED_ORGANS,
  DOU_WATCHED_ORGANS,
  type DouStage,
} from "@/lib/ingestion/dou-watch";

const DIR = "lib/ingestion/__fixtures__/dou";
const load = (file: string) => readDouPayload(JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")));

let ran = 0;
let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  ran += 1;
  const okay = JSON.stringify(actual) === JSON.stringify(expected);
  if (!okay) failures += 1;
  console.log(`${okay ? "✓" : "✗"} ${name}${okay ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}
function ok(name: string, condition: boolean, detail = "") {
  check(`${name}${detail === "" ? "" : ` ${detail}`}`, condition, true);
}

console.log("── 日期与地址 ──");
check("DD/MM/YYYY → ISO", parseDouDate("18/09/2026"), "2026-09-18");
check("认不出来就是 undefined，不瞎猜", parseDouDate("18 de setembro"), undefined);
check("32 月不是月份", parseDouDate("01/32/2026"), undefined);
// leiturajornal wants Brazilian day order in the query string; handing it an
// ISO date returns the current edition instead, silently.
check("版面地址用的是巴西日序", douEditionUrl("do3", "2026-09-18"), "https://www.in.gov.br/leiturajornal?data=18-09-2026&secao=do3");
check("周六往前退到周五", lastWeekday(new Date("2026-09-19T12:00:00Z")).toISOString().slice(0, 10), "2026-09-18");
check("周日也退到周五", lastWeekday(new Date("2026-09-20T12:00:00Z")).toISOString().slice(0, 10), "2026-09-18");
check("连着取 3 个工作日会跳过周末", recentWeekdays(3, new Date("2026-09-21T12:00:00Z")), ["2026-09-21", "2026-09-18", "2026-09-17"]);

console.log("\n── 读版面 ──");
const edition = load("do3-data-json-1.json");
check("样本 216 条", edition.notices.length, 216);
check("样本自己声明了是裁过的", edition.sampledFrom, 2139);
check("日期从公告里读，不是从请求的参数", edition.publishedOn, "2026-09-18");
ok("每条都有 urlTitle（永久链接靠它）", edition.notices.every((n) => n.urlTitle.length > 0));
ok("每条都有 artType", edition.notices.every((n) => n.artType.length > 0));
ok("每条都有发布机构", edition.notices.every((n) => n.organs.length > 0));
// This is the measurement the whole "watch, don't import" decision rests on.
const withSnippet = edition.notices.filter((n) => n.snippet.length > 0);
ok("正文是被截断的 —— 绝大多数以省略号结尾", withSnippet.filter((n) => n.snippet.endsWith("...")).length / withSnippet.length > 0.9, `→ ${withSnippet.filter((n) => n.snippet.endsWith("...")).length}/${withSnippet.length}`);
ok("正文最长 403 字，中位数也是 403 —— 硬截断", Math.max(...withSnippet.map((n) => n.snippet.length)) <= 403);
check("永久链接是从 urlTitle 拼的", douNoticeUrl(edition.notices[0]), `https://www.in.gov.br/web/dou/-/${edition.notices[0].urlTitle}`);

console.log("\n── 为什么不用 in.gov.br 自己的搜索（两次真实抓取的结果）──");
const concessao = load("busca-concessao-json-1.json");
const licitacao = load("busca-licitacao-json-1.json");
// Both captures came back with exactly 20 rows and no paging parameter was
// measured. That is the recall ceiling: one weekday of Seção 3 alone is
// 2,139 notices, so a 20-row answer is a sample of unknown coverage —
// whereas the edition listing is the whole day by construction.
check("「concessão」只回 20 条", concessao.notices.length, 20);
check("「aviso de licitação」也只回 20 条", licitacao.notices.length, 20);
// Captured 2026-09-19. Every row scored 0: the engine matched the WORD
// anywhere, including inside the boilerplate every federal notice carries.
check("「concessão」第一条是所得税的规范性文件，不是特许经营", concessao.notices[0].artType, "Instrução Normativa");
check("「aviso de licitação」第一条是巴西农科院的奖学金协议", licitacao.notices[0].artType, "Extrato de Compromisso");
ok("搜索结果里高亮标记已经被剥掉了", [...concessao.notices, ...licitacao.notices].every((n) => !/[<>]/.test(n.snippet)));
// This is the measurement, and it is worse than "noisy": searching the exact
// word that names this platform's highest-value Brazilian target returns
// none of it. Nine of the twenty are ANTT `DECISÃO SUROD` rulings about
// concessions that already exist — tariff and penalty decisions, not
// competitions anyone can enter.
const fromConcessao = watchDouEdition(concessao.notices).kept;
check("搜「concessão」20 条里，一条能用的都没有", fromConcessao.length, 0);
ok("其中 9 条是 ANTT 对现有公路特许的裁决，不是新项目", concessao.notices.filter((n) => /DECIS[ÃA]O SUROD/i.test(n.title)).length >= 9);
// The other search does better, and still does not beat reading the edition:
// three of its four survivors are Petrobras spare parts, and the one real
// works competition is a CODEVASF Concorrência the edition filter catches
// anyway.
const fromLicitacao = watchDouEdition(licitacao.notices).kept;
check("搜「aviso de licitação」20 条里只留 1 条", fromLicitacao.length, 1);
ok("那 1 条是 CODEVASF 的 Concorrência Eletrônica", fromLicitacao.some((v) => /CODEVASF|Vales do S[ãa]o Francisco/i.test(v.notice.organPath) && v.form === "works_or_concession"));

console.log("\n── 阶段分类 ──");
const stage = (artType: string, title = "") => classifyDouStage({ artType, title });
check("Aviso de Licitação → opening", stage("Aviso de Licitação"), "opening");
check("带连字符的变体也认（-Concorrência）", stage("Aviso de Licitação-Concorrência"), "opening");
check("Aviso de Licitação-Registro de Preços 也认", stage("Aviso de Licitação-Registro de Preços"), "opening");
check("Aviso de Chamamento Público → opening", stage("Aviso de Chamamento Público"), "opening");
check("Aviso de Pré-Qualificação → opening", stage("Aviso de Pré-Qualificação"), "opening");
check("Aviso de Audiência Pública → opening", stage("Aviso de Audiência Pública"), "opening");
check("Aviso de Prorrogação → amendment", stage("Aviso de Prorrogação"), "amendment");
check("Aviso de Reabertura de Prazo → amendment", stage("Aviso de Reabertura de Prazo"), "amendment");
check("Aviso de Homologação → closing", stage("Aviso de Homologação"), "closing");
check("Resultado de Julgamento → closing", stage("Resultado de Julgamento"), "closing");
// A direct award is a notice that competition did NOT happen — the same call
// relevance-pt.ts records for PNCP's Dispensa and Inexigibilidade.
check("Aviso de Dispensa de Licitação 算 closing，不算 opening", stage("Aviso de Dispensa de Licitação"), "closing");
check("Aviso de Inexigibilidade 同理", stage("Aviso de Inexigibilidade de Licitação"), "closing");
check("Extrato de Contrato → contract", stage("Extrato de Contrato"), "contract");
check("Extrato de Termo Aditivo → contract", stage("Extrato de Termo Aditivo"), "contract");
check("Edital de Concurso Público 是招人，不是招标", stage("Edital de Concurso Público"), "administrative");
check("Edital de Citação 是司法传唤", stage("Edital de Citação"), "administrative");
// The generic buckets carry everything. Measured: the `Edital` bucket held
// both an eye-medication pregão and a chamamento público.
check("泛用的 Edital 看标题：标题是招标公告就算 opening", stage("Edital", "AVISO DE LICITAÇÃO PREGÃO ELETRÔNICO SRP Nº 59/2026"), "opening");
check("泛用的 Edital 看标题：标题是公开征集也算 opening", stage("Edital", "AVISO DE CHAMAMENTO PÚBLICO Nº 12/2026"), "opening");
check("标题也说不出来的，老实说 unclear", stage("Aviso", "AVISO"), "unclear");

console.log("\n── 采购方式（14.133 禁止用 Pregão 招工程，所以工具名就是分类）──");
check("Concorrência → 工程/特许", classifyDouForm("Modalidade: Concorrência 51/2026"), "works_or_concession");
check("Contratação Integrada → 工程/特许", classifyDouForm("Objeto: Contratação Integrada de empresa para elaboração dos Projetos"), "works_or_concession");
check("Diálogo Competitivo → 工程/特许", classifyDouForm("DIÁLOGO COMPETITIVO Nº 1/2026"), "works_or_concession");
check("PMI/征集意向 → 工程/特许", classifyDouForm("AVISO DE MANIFESTAÇÃO DE INTERESSE"), "works_or_concession");
check("特许经营 → 工程/特许", classifyDouForm("concessão patrocinada do trecho rodoviário"), "works_or_concession");
check("Pregão → 普通货物服务", classifyDouForm("PREGÃO ELETRÔNICO Nº 10/2026 Aquisição de medicamentos"), "commodity");
check("Tomada de Preços → 普通货物服务", classifyDouForm("TOMADA DE PREÇOS Nº 3/2026"), "commodity");
// Same word, opposite direction of money: a scrap auction is the state
// selling, a concession auction is the state buying thirty years of
// investment. Only the object tells them apart.
check("拍卖废旧物资 → 处置，不是采购", classifyDouForm("LEILÃO ONLINE Nº 1/2026 alienação de bens móveis inservíveis"), "disposal");
// 2026-09-18 全量版面校准出来的那条规则：Petrobras 一个机构就占了 37 条命中里的 27 条，
// 而它的公告从不写采购方式，只写 `Objeto: Aquisição de <零件>`。没写方式就看标的物。
check("没写方式、但标的物是买东西 → commodity", classifyDouForm("AVISO DE LICITAÇÃO Nº 7004653067 Objeto: Aquisição de Damper corta fogo"), "commodity");
check("没写方式、但标的物是工程 → works_or_concession", classifyDouForm("Objeto: execução de obra de engenharia civil, reforma estrutural do cais"), "works_or_concession");
check("两样都没写，才是 unknown", classifyDouForm("AVISO DE LICITAÇÃO Nº 12/2026 - UASG 710300"), "unknown");
// 地名不算工程信号：Transpetro 的化验合同提到了 Terminal de Cabiunas，那说的是在哪儿干，不是干什么。
check("标的物里的地名不当成工程信号", classifyDouForm("Objeto: Serviços de ensaios físico químicos de petróleo para o Terminal de Cabiunas"), "commodity");
// 14.133 把 credenciamento 归在 inexigibilidade —— 谁合格谁进名录，没有竞争可言。
check("credenciamento 是入围登记，不是竞争性招标", classifyDouForm("AVISO DE CREDENCIAMENTO Nº 1/2024 OPERAÇÃO CARRO-PIPA"), "registration");
check("带 credenciamento 的 chamamento público 也算入围登记", classifyDouForm("AVISO DE CHAMAMENTO PÚBLICO Nº 1/2024 o credenciamento de prestadores de serviços"), "registration");
check("habilitação institucional 同理", classifyDouForm("EDITAL DE CHAMAMENTO PÚBLICO PERMANENTE Nº 1/2026 Habilitação institucional de fundações de apoio"), "registration");
// 但干净的 chamamento público（PMI 那种征集意向）仍然要留。
check("干净的 chamamento público 仍算工程/特许", classifyDouForm("AVISO DE CHAMAMENTO PÚBLICO para manifestação de interesse"), "works_or_concession");
check("先看工程再看普通：两个词都在时按工程算", classifyDouForm("CONCORRÊNCIA ELETRÔNICA, em substituição ao PREGÃO"), "works_or_concession");

console.log("\n── 机构清单 ──");
ok("默认监控的是基建/能源/通信这几个部委", DOU_WATCHED_ORGANS.includes("Ministério dos Transportes") && DOU_WATCHED_ORGANS.includes("Ministério de Portos e Aeroportos"));
ok("市政公告永远不看（PNCP 已经全量收了）", DOU_NEVER_WATCHED_ORGANS.includes("Prefeituras"));
ok("法院、检察院、审计院也不看", ["Poder Judiciário", "Ministério Público da União", "Tribunal de Contas da União"].every((o) => DOU_NEVER_WATCHED_ORGANS.includes(o)));

console.log("\n── 四条轴，每条都在挡东西 ──");
const all = edition.notices;
const base = watchDouEdition(all);
check("默认规则：216 条里留 1 条", base.kept.length, 1);
ok("留下来的第一条是 DNIT 那个公路复线设计施工总包", base.kept.some((v) => /duplica/i.test(v.notice.snippet) && v.notice.organs[0] === "Ministério dos Transportes"));
ok("每条判定都写得出理由", [...base.kept, ...base.dropped].every((v) => v.why.length > 4));
ok("留下 + 丢掉 = 全部", base.kept.length + base.dropped.length === all.length);

const ALL_STAGES: DouStage[] = ["opening", "amendment", "closing", "contract", "administrative", "unclear"];
const noStage = watchDouEdition(all, { stages: ALL_STAGES });
ok("只去掉阶段这一轴，混进来的明显更多", noStage.kept.length > base.kept.length, `→ ${noStage.kept.length} 条`);
const noOrgan = watchDouEdition(all, { organs: [] });
ok("只去掉机构这一轴，混进来的明显更多", noOrgan.kept.length > base.kept.length, `→ ${noOrgan.kept.length} 条`);
const noForm = watchDouEdition(all, { forms: ["works_or_concession", "commodity", "disposal", "unknown"] });
ok("只去掉采购方式这一轴，桶装水和废旧物资拍卖就回来了", noForm.kept.length > base.kept.length, `→ ${noForm.kept.length} 条`);
ok("放开采购方式后，确实能看到桶装水那条", noForm.kept.some((v) => /água mineral/i.test(v.notice.snippet)));
ok("放开采购方式后，确实能看到部队的废旧物资拍卖", noForm.kept.some((v) => v.form === "disposal"));
const withPrefeituras = watchDouEdition(all, { includePrefeituras: true, organs: [] });
ok("把市政放进来，数量又涨一截", withPrefeituras.kept.length > noOrgan.kept.length, `→ ${withPrefeituras.kept.length} 条`);

console.log("\n── 关键词是收窄，不是放宽 ──");
const keyword = watchDouEdition(all, { keyword: "duplicação" });
ok("加关键词只会更少", keyword.kept.length <= base.kept.length, `→ ${keyword.kept.length} 条`);
const nonsense = watchDouEdition(all, { keyword: "zzzznotaword" });
check("对不上的关键词一条都不留", nonsense.kept.length, 0);

console.log("\n── 空输入不炸 ──");
check("空版面就是空结果", watchDouEdition([]).kept.length, 0);
check("读一个空对象不炸", readDouPayload({}).notices.length, 0);
check("读 null 不炸", readDouPayload(null).notices.length, 0);
const bare: DouNotice = { pubName: "", urlTitle: "x-1", title: "", artType: "", organs: [], organPath: "", snippet: "" };
ok("什么都没有的一条也能判，不会抛", watchDouEdition([bare]).dropped.length === 1);

console.log("\n── 完整一天的校准（2026-09-18 第三节 2139 条里，旧规则放行的那 37 条）──");
// This is the only fixture taken from a WHOLE edition rather than a flattened
// sample, which is why the numbers here are the ones that decide whether the
// rules are usable: 37 hits a day is not a watch anyone reads.
const calibration = JSON.parse(readFileSync(`${DIR}/watch-kept-2026-09-18.json`, "utf8")) as {
  notices: { organPath: string; title: string; snippet: string }[];
};
const realDay: DouNotice[] = calibration.notices.map((row) => ({
  pubName: "DO3",
  urlTitle: "captured-from-run-35536478669",
  title: row.title,
  // Empty on purpose — that run printed the verdict, not the artType. The
  // stage axis falls back to the title, which is what it does for the generic
  // buckets anyway, and the form axis never reads artType at all.
  artType: "",
  organs: row.organPath.split("/"),
  organPath: row.organPath,
  snippet: row.snippet,
}));
check("抄回来的是 37 条", realDay.length, 37);
const recalibrated = watchDouEdition(realDay);
check("收紧后从 37 条收到 5 条", recalibrated.kept.length, 5);
ok("留下的全是工程或特许，没有一条是 unknown 混进来的", recalibrated.kept.every((v) => v.form === "works_or_concession"));
// The five, named. If a rule change quietly drops one of these, the watch has
// stopped doing its job and a count alone would not say so.
ok("DNIT 塞阿拉的公路复线（Concorrência 51/2026）还在", recalibrated.kept.some((v) => /Concorr[êe]ncia 51\/2026/.test(v.notice.snippet)));
ok("DNIT 总部的港口 IP4 工程（Concorrência 307/2026）还在", recalibrated.kept.some((v) => /Concorr[êe]ncia 307\/2026/.test(v.notice.snippet)));
ok("海军圣佩德罗的防雷工程（Concorrência 133/2026）还在", recalibrated.kept.some((v) => /Concorr[êe]ncia 133\/2026/.test(v.notice.snippet)));
ok("海军 IEAPM 的码头改造（Concorrência 151/2025）还在", recalibrated.kept.some((v) => /Concorr[êe]ncia 151\/2025/.test(v.notice.snippet)));
ok("巴西林业局的森林特许经营还在", recalibrated.kept.some((v) => /Concess[ãa]o Florestal/i.test(v.notice.snippet)));
// And the two things that were drowning it.
const droppedForms = new Map<string, number>();
for (const v of recalibrated.dropped) droppedForms.set(v.form, (droppedForms.get(v.form) ?? 0) + 1);
check("28 条被判为普通货物服务采购", droppedForms.get("commodity"), 28);
check("4 条被判为入围登记", droppedForms.get("registration"), 4);
const petrobras = realDay.filter((n) => /Petr[óo]leo Brasileiro|Petrobras/i.test(n.organPath));
check("这 37 条里 Petrobras 系占 27 条", petrobras.length, 27);
ok("Petrobras 那 27 条现在一条都不留", watchDouEdition(petrobras).kept.length === 0);

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
