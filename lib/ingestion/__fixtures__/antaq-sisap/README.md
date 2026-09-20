# ANTAQ SisapInternet —— 还没抓到的样本

这个目录是空的，等 `Actions → Probe Brazil doors → what=capture-sisap` 跑完
把页面提交回来。

`sisapinternet.antaq.gov.br` 上有 ANTAQ「进行中」列表里的 11 场听证 —— 20 场里
最大的一块。它是另一套系统（ASP.NET WebForms，
`audienciapublicaconsultar.aspx?Audiencia=NNN`），跟 `www.gov.br` 的 Plone 没有
关系，所以 `antaq-audiencia-parser.ts` 读不了它。

**这个目录空着，本身就是一句话**：这套页面**任何一台机器都还没取过**。笔记本、
Vercel、GitHub 跑批机，三边都没试过，所以没人知道它是开着、要验证，还是根本不理
人。`scripts/capture-antaq-sisap.ts` 的第一件事不是抓页面，是回答这个问题，并且
把「不行」分成验证页 / 网络不通 / HTTP 状态码三种说清楚 —— 这三种的下一步完全
不一样。

抓到之后再照着真实页面写解析器。这个仓库的规矩，付过三次学费（Compras MX、
Ecopetrol、Proyectos México）：**解析器照真实抓取写，不照着对它的描述写。**

默认只抓场次号 2025 年及以后的 3 场（05/2026、01/2026、06/2025），按用户定的
「招标中就保留，以逾期就不要」；另外 8 场是 2024 和 2022 的。要全抓就传
`--years 0`。
