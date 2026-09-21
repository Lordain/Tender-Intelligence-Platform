# ANTAQ SisapInternet —— 问过了，进不去

这个目录是空的，**不是因为还没试，是因为两台机器试了六次都没进去**。这条路算
关了，跟 `leilao.antaq.gov.br` 一样。

`sisapinternet.antaq.gov.br` 上有 ANTAQ「进行中」列表里的 11 场听证 —— 20 场里
最大的一块。它是另一套系统（ASP.NET WebForms，
`audienciapublicaconsultar.aspx?Audiencia=NNN`），跟 `www.gov.br` 的 Plone 没有
关系，所以 `antaq-audiencia-parser.ts` 读不了它。

## 2026-09-20，两台机器，6 次尝试，0 场拿到

按「招标中就保留，以逾期就不要」只取了场次号 2025 年及以后的三场：

| 场次 | id | GitHub 跑批机 | 笔记本 |
|---|---|---|---|
| AP 05/2026 | 640 | **403 验证页** | **403 验证页** |
| AP 01/2026 | 639 | **502 Bad Gateway** | **403 验证页** |
| AP 06/2025 | 638 | **502 Bad Gateway** | **403 验证页** |

跑批机那两个 502 一度让人以为「是他们服务器挂了，等等就好」。**笔记本把这件事问死
了**：三条全是验证页，而且笔记本开 gov.br 毫无障碍。所以那两个 502 是同一个边缘
一时抽风，真实答案是**挡**。`classifyAntaqHost` 已经从 `other-system` 改成
`refuses-us` —— 改的依据是量出来的，不是猜的。

**这两种「不行」不是一回事**，`scripts/capture-antaq-sisap.ts` 专门把它们分开：

- **验证页** = 主机活着，它在挡我们。换 header 没用 —— 这个仓库在 ANEEL 和
  leilao.antaq 上各量过一次。
- **502** = Cloudflare 的边缘连上了 ANTAQ 自己的服务器，对方没应答。**没人在挡
  我们，是他们那套应用没起来。**

第一版脚本每条只试一次就下结论，这不足以区分「源站长期挂着」和「刚好抽了一下」，
而这两件事的下一步完全相反。现在网关类错误重试三次（退避 2s / 5s），验证页一次
都不重试 —— 一个决定问三遍只会让日志看起来像偶发故障。

## 脚本为什么还留着

因为哪天 ANTAQ 换了 WAF，重新问一遍只要一条命令：

```
npm run capture:antaq-sisap
```

而且一个查过、查完关掉的来源，应该**写着它被关掉了**，而不是看起来像被忘了。

真抓到了就照真实页面写解析器 —— 规矩：解析器照真实抓取写，不照着对它的描述写，
这条学费付过三次（Compras MX、Ecopetrol、Proyectos México）。`--years 0` 可以把
11 场全抓，另外 8 场是 2024 和 2022 的。
