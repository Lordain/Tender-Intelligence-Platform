/**
 * The link reader, checked against anchor shapes instead of a live page.
 *
 * It exists because of how this probe fails: `collectLinks` returning nothing
 * prints "0 links" on the runner, and "0 links" reads exactly like "this page
 * has no editais" — a broken regex would quietly become a product decision to
 * abandon a source. Every case below is a shape gov.br actually serves:
 * relative hrefs, single quotes, an anchor wrapping a <span>, entity-encoded
 * query strings, and the `/@@download/` path Plone puts its PDFs behind.
 */
import { collectLinks, isInteresting } from "@/lib/ingestion/brazil-behind-doors";

const BASE = "https://www.gov.br/aneel/pt-br/empreendedores/leiloes";

const HTML = `
<html><body>
  <a href="/aneel/pt-br/assuntos/noticias">Notícias</a>
  <a href='leilao-de-transmissao-no-001-2026'>Leilão de Transmissão nº 001/2026 — em andamento</a>
  <a href="https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_transmissao.xlsx">Planilha em Excel</a>
  <a href="https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm?idEdital=12">Edital de Transmissão</a>
  <a href="/aneel/pt-br/centrais-de-conteudos/editais/edital-lt-4-2026.pdf/@@download/file"><span>Edital</span> LT 4/2026</a>
  <a href="https://leilao.aneel.gov.br/listaLeiloesFinalizados">Leilões finalizados</a>
  <a href="/aneel/pt-br/busca?q=leil%C3%A3o&amp;b=1">Buscar leilões</a>
  <a href="/aneel/pt-br/empreendedores/leiloes/consulta-publica-01-2027">Consulta Pública nº 01/2027 — prevista</a>
  <a href="#topo">Topo</a>
  <a href="javascript:void(0)">Menu</a>
  <a href="mailto:ouvidoria@aneel.gov.br">Fale conosco</a>
  <a href="/aneel/pt-br/assuntos/noticias">Notícias</a>
</body></html>
`;

const links = collectLinks(HTML, BASE);
const by = (fragment: string) => links.find((l) => l.href.includes(fragment));

let failures = 0;
let ran = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ran += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    期望 ${JSON.stringify(expected)}\n    实际 ${JSON.stringify(actual)}`}`);
}

check("锚点数量（#、javascript:、mailto: 不算，重复的只算一次）", links.length, 8);
check("相对路径补成绝对", by("/assuntos/noticias")?.href, "https://www.gov.br/aneel/pt-br/assuntos/noticias");
check("单引号 href 也读得到", by("leilao-de-transmissao-no-001-2026")?.text, "Leilão de Transmissão nº 001/2026 — em andamento");
check("同级相对路径按当前目录解析", by("leilao-de-transmissao-no-001-2026")?.href, "https://www.gov.br/aneel/pt-br/empreendedores/leilao-de-transmissao-no-001-2026");
check("锚文字里的 <span> 被剥掉", by("edital-lt-4-2026")?.text, "Edital LT 4/2026");
check("&amp; 解码后不破坏 URL", by("busca")?.href, "https://www.gov.br/aneel/pt-br/busca?q=leil%C3%A3o&b=1");

check("xlsx 认成 xlsx", by("Resultado_leiloes_transmissao")?.ext, "xlsx");
check("Plone 的 /@@download/file 认成 pdf 而不是 file", by("edital-lt-4-2026")?.ext, "pdf");
check("没有扩展名的算页面", by("/assuntos/noticias")?.ext, "（页面）");
check("深层路径里没有文件名时不乱猜扩展名", by("consulta-publica-01-2027")?.ext, "（页面）");

check("git.aneel 判为取不到", by("Resultado_leiloes_transmissao")?.reach, "closed");
check("www2.aneel 判为取不到", by("edital_transmissao.cfm")?.reach, "closed");
check("leilao.aneel 判为取不到", by("listaLeiloesFinalizados")?.reach, "closed");
check("www.gov.br 判为能取", by("edital-lt-4-2026")?.reach, "open");

check("edital 的 xlsx 算值得跟", isInteresting(by("Resultado_leiloes_transmissao")!), true);
check("标题里有 Leilão 的页面算值得跟", isInteresting(by("leilao-de-transmissao-no-001-2026")!), true);
check("普通新闻链接不算值得跟", isInteresting(by("/assuntos/noticias")!), false);

console.log(failures === 0 ? `\n全部 ${ran} 项通过` : `\n${ran} 项里 ${failures} 项没过`);
process.exitCode = failures === 0 ? 0 : 1;
