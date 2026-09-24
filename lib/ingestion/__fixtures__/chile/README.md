# 智利 fixture

这个目录里有两批东西，**它们来自两轮完全不同的测量，不要混着读。**

## 第二轮（2026-09-24，网络放开之后）：真的智利数据

`npm run capture:chile-ocds` 抓的。六份里有四份的 HTTP 状态码**不是它的意思**——这正是它们值得存下来的原因。

| 文件                             | HTTP | 大小    | 它到底是什么                                                       |
| -------------------------------- | ---- | ------- | ------------------------------------------------------------------ |
| `ocds-index-2026-07.json`        | 200  | 2.0KB   | 月度索引的一页。正常路径                                           |
| `ocds-tender-priced.json`        | 200  | 56KB    | 一条完整 OCDS 1.1 记录，**有** `tender.value`                      |
| `ocds-tender-unpriced.json`      | 200  | 3.5KB   | 一条完整记录，**没有** `tender.value`（样本里占 48%，不是边角情况）|
| `ocds-index-2026-08-empty.json`  | 200  | 67B     | ★ HTTP 200，正文里写的却是 `status: 404`                           |
| `servicios-ticket-required.json` | 203  | 44B     | ★ HTTP **203**（一个 2xx！）＝「Ticket no válido.」                |
| `ficha-qs-plain-code.html`       | 200  | 121KB   | ★ 一整页真实 HTML，**每个字段都是空的**                            |

后三条是陷阱，按踩上去的代价从小到大：

- **`status` 404 vs `statusCode` 404。** 前者（正文里，HTTP 200）意思是「这个月没有记录」——关于智利的事实。
  后者意思是「这个路由不存在」——关于**我们**拼错了 URL 的事实。两个判断要走相反的下一步，而它们只差一个键名。
- **HTTP 203。** `response.ok` 是 `true`。任何按 `.ok` 判断成败的连接器，都会把一句拒绝当成数据写进库。
- **`?qs=<编号>` 那个 ficha 页。** 200、121KB、正文里**有**招标编号（因为编号被回显在 query string 里）。
  一个「页面回来了吗、里面提到这个标了吗」的校验会放行它。而 `lblNombreLicitacion` 是个空 span。
  能用的是 `?idlicitacion=<编号>`，对方自己会 302 到加密的 `?qs=` 去。两个编号各抓一次，121,624B 和 121,625B
  ——只差编号本身那一个字符。

`scripts/test-chile-ocds-mapper.ts` 53 项按这六份真实字节钉住。

## 第一轮（2026-09-24，网络放开之前）：一条智利数据都没有

`c*-egress_denied.txt` 三份，是跑探针的那个容器**它自己的出口网关**回的 403。请求没有发到智利，
也没有发到巴西和秘鲁。

| 文件                        | 被拦的域名                             | 这条证明什么                                             |
| --------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `c1-egress_denied.txt`      | `api.mercadopublico.cl`                | 智利的主假设入口，没问成                                 |
| `c3-egress_denied.txt`      | `datos.gob.cl`                         | 智利国家开放数据门户，也没问成                           |
| `c0c-egress_denied.txt`     | `contratacionesabiertas.oece.gob.pe`   | **关键的一条**：生产环境天天在跑的秘鲁源，从这台机器也够不着 |

留着 `c0c` 是有意的。没有它，前两条会被读成「智利拒绝了我们」；有了它，结论只能是「这台机器谁都够不着」——
这两个判断要走完全相反的下一步，而状态码（403）长得一模一样。

`scripts/test-chile-doors.ts` 按这三份字节钉住，包括一条反向断言：秘鲁 2026-09-11 那次**真的**被对方
边缘代理拒绝时的 403 正文，不能被误判成本机出口问题。

**这批不要删。** 网络放开之后它们看着像废料，但它们钉住的那个判别器
（`lib/ingestion/egress-denial.ts`）解决的是一个会反复出现的问题：本机 403 和对方 403 长得一模一样，
而下一步完全相反。换一台机器、换一次网络策略，这个坑就在那儿等着。

## 其余几份（第二轮探针 `--save` 落下的）

`c1-refused.json`、`c1b-refused.json`、`c2*-refused.*`、`c3*-answered.json`、`c4*.html` 是第二轮
`npm run probe:chile-doors -- --save` 存的真实响应。它们记录的是**探门那一刻**的状态（C1 当时回了 500、
C1b 回了 429 的并发限流），跟上面第二轮那六份不矛盾——同一个接口在不同时刻回了不同的东西，
而这本身就是「一次响应不等于一个结论」的证据。凭证那一问的确定答案在 `servicios-ticket-required.json`。

## 第三轮：公开搜索门（`busca-*`，2026-09-24）

`npm run capture:chile-busca` 抓的，`scripts/test-chile-busca.ts` 按这些字节钉住。
来源是 `www.mercadopublico.cl/BuscarLicitacion/` —— 不要凭证的公开搜索页。

**四份是陷阱，全部是 HTTP 200。**

| 文件 | 是什么 | 为什么留着 |
| ---- | ------ | ---------- |
| `busca-export-small.csv` | 真 CSV，9 行，金额已公布 | 正常路径。UTF-8 带 BOM、`;` 分隔、CRLF、11 列 |
| `busca-export-unpriced.csv` | 真 CSV，21 行，金额**未**公布 | `MontoLicitacion` 这一列在这里**不是数字**，是「Igual o superior a 5.000 UTM」这种档位文字 |
| `busca-export-empty.csv` | 200，只有一行表头（131 字节） | 真的「翻过头了」。**也是** `idTipoFecha:"-1"` 的应答——同样的字节，两个相反的含义 |
| `busca-generar-archivo.json` | 200 `{"estado":true,…}` | 导出的句柄，不是文件本身。两步式 |
| `busca-generar-refused.json` | 200 `{"estado":false}` | **拒绝**——而且**照样带一个 FileGuid**。「拿到 GUID 了吗」这种校验会放行它 |
| `busca-descargar-empty.bin` | 200，**0 字节** | 下载没带会话 cookie。**这一份是故意用一个全新会话去要另一个会话的 GUID 抓的** |
| `busca-search-page.html` | 结果片段，10 张卡，39KB | **交标截止日只有这里有**，CSV 里没有这一列。另有两个采购方信誉计数 |

`busca-descargar-empty.bin` 那一份值得单说：它是 0 字节，而 `busca-export-empty.csv` 是 131 字节。
**「下载失败了」和「这一页没有结果」在这扇门上是两种不同的字节**，混为一谈的后果是导入器永远报告
「成功导入 0 条」。两份都留着，就是为了让这条区分有据可依。

`busca-search-page.html` 里的日期会随抓取时间变化。测试断言的是**结构和陷阱**（10 张卡、
每张都有截止日、实体解码、类名 `monto-dis` 和标签文字的不一致），**不是**某一条具体标的内容。

这批 fixture 比其他任何一组都更需要定期重抓：它们来自 ChileCompra 的**前台页面**，
不是一个发布出来的数据接口，一次发版就可能让解析器失效且不会有人通知。
脚本包版本号 `?v=202502171638` 记在 `CHILE_BUSCA_SCRIPT_VERSION` 里，它一变就该重抓。
