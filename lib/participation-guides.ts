import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";

export type GuideStep = {
  title: string;
  detail: string;
};

export type GuideSection = {
  id: string;
  title: string;
  intro?: string;
  items?: string[];
  steps?: GuideStep[];
  note?: string;
};

export type GuideSource = {
  label: string;
  href: string;
};

export type ParticipationGuide = {
  slug: string;
  country: string;
  countryCode: string;
  platform: string;
  /**
   * Who is buying, in Chinese — a reader meeting "Cemig" or "Codelco" for the
   * first time cannot tell a power company from a mining company from the
   * name (user, 2026-09-25: 参标指南帮忙增加对应的中文 <- 说明是电力公司、
   * 石油公司、矿业公司？, and 包括当前的也检查增加).
   */
  issuer: string;
  /** The short label for the chip: 电力公司 / 石油公司 / 矿业公司 / 政府采购平台 … */
  issuerType: string;
  title: string;
  summary: string;
  whatIs: string;
  audience: string;
  quickFacts: Array<{ label: string; value: string }>;
  sections: GuideSection[];
  sources: GuideSource[];
};

/**
 * Written short on purpose (user, 2026-10-05: 字太多、太厚重了，访客如果不专心
 * 不会全部阅读，优化成简单的语言): whatIs in two or three sentences, steps
 * with a title of a few characters and one line of detail, and every list
 * line as 「短标题：说明」 — the guide page (app/guides/[slug]) leads each card
 * with the part before the colon. Facts and official sources are unchanged
 * from the long versions; only the wording got shorter.
 */
export const participationGuides: ParticipationGuide[] = [
  {
    slug: "mexico-compras-mx",
    country: "墨西哥",
    countryCode: "MX",
    platform: "Compras MX",
    issuer: "墨西哥联邦政府各部门与机构",
    issuerType: "政府采购平台",
    title: "怎么参与 Compras MX 的政府采购项目？",
    summary: "墨西哥联邦政府的采购平台。先看项目和参与范围，值得投再注册。",
    whatIs: "墨西哥联邦政府各部门发布采购的官方平台，前身是 CompraNet。货物、服务、租赁和公共工程都在这里发布，公开查询不用注册。CFE、Pemex 和州、市政府常用自己的入口，不一定在这里。",
    audience: "想投墨西哥联邦政府采购的境内外企业",
    quickFacts: [
      { label: "官方平台", value: "Compras MX" },
      { label: "常用语言", value: "西班牙语" },
      { label: "参与方式", value: "看每个项目的公告" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "联邦政府采购：查墨西哥联邦政府在 Compras MX 发布的项目",
          "不含其他入口：CFE、Pemex、Proyectos Estratégicos MX 和州、市采购要去各自平台查",
          "先看再注册：公开查询不用注册，要投标时再按项目要求开企业账户",
        ],
        note: "平台注册成功，不代表你符合某个项目的投标资格。",
      },
      {
        id: "first-check",
        title: "注册前先看这 5 个字段",
        items: [
          "Siglas dependencia o entidad：采购单位，别只看项目标题",
          "Carácter：国内、国际条约覆盖，还是开放国际",
          "Estatus：项目还在进行，还是已终止、取消或结束",
          "Tipo de publicación：这是公告、修改还是通知",
          "Fecha de presentación y apertura de proposiciones：递交和开标时间，留意后续更正",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "搜索项目", detail: "按采购单位、关键词、编号查找，确认状态和截止时间。" },
          { title: "读完整公告", detail: "下载 convocatoria、bases、anexos 和澄清，看国籍、原产地、担保要求。" },
          { title: "值得投再注册", detail: "境外企业填本国税号，上传经认证、译成西语的公司文件。" },
          { title: "准备并递交", detail: "法律、技术、经济文件按指定格式和渠道递交。" },
          { title: "跟进结果", detail: "截止前看答疑和更正，递交后看开标、授标和合同。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "多数项目会要的，具体以招标文件为准。",
        items: [
          "企业基本信息：法定名称、国籍、地址、联系人",
          "公司文件：章程及变更、法定代表人授权书",
          "税务与声明：税务登记、合规声明、无利益冲突声明",
          "业绩与能力：同类合同、技术人员、设备、实施方案",
          "财务与报价：财务报表、财务能力证明、报价文件",
          "签名与认证：电子签名、担保、认证和翻译（按公告要求）",
        ],
        note: "RUPC（供应商登记册）通常不是首次投标的前提：一般先注册 Compras MX，签约后再申请加入。项目另有要求的，以招标文件为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "国内采购只限本国：通常只限墨西哥主体，货物一般要墨西哥生产、本地含量至少 65%",
          "“国际”不等于能投：条约覆盖的程序只对条约国开放，中国大陆目前不在列",
          "开放国际程序：其他外国企业可能可以参加，仍要看国籍和原产地限制",
          "本地安排：要不要墨西哥税号、本地代表、送达地址或联合体",
          "文件认证：中国文件要不要公证、海牙认证（Apostille）和西语宣誓翻译",
          "钱的问题：币种、税费、进口责任、履约担保和付款条件",
        ],
      },
    ],
    sources: [
      { label: "Compras MX 官方平台", href: "https://comprasmx.buengobierno.gob.mx/" },
      { label: "Compras MX 公开项目查询", href: "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/" },
      { label: "Compras MX 企业注册官方指南", href: "https://upcp-compranet.buengobierno.gob.mx/publicas/guias/Guia_de_registro_de_empresas_0125.pdf" },
      { label: "墨西哥现行联邦采购法", href: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LAASSP.pdf" },
      { label: "RUPC 官方说明与办理流程", href: "https://canvas-compranet.buengobierno.gob.mx/modulos_compranet/RUPC.html" },
    ],
  },
  {
    slug: "mexico-cfe-micrositio",
    country: "墨西哥",
    countryCode: "MX",
    platform: "CFE Micrositio",
    issuer: "墨西哥联邦电力委员会（CFE），墨西哥国家电力公司",
    issuerType: "电力公司",
    title: "怎么参与 CFE Micrositio 的项目？",
    summary: "墨西哥国家电力公司的采购平台。最大的门槛是企业 e.firma 电子签名。",
    whatIs: "CFE（墨西哥联邦电力委员会）自己的电子采购平台，发布货物、租赁、服务和工程项目。供应商在这里注册、找项目、提问并递交方案。",
    audience: "电力、能源、工程、设备与专业服务供应商",
    quickFacts: [
      { label: "采购单位", value: "CFE（墨西哥国家电力公司）" },
      { label: "官方系统", value: "Micrositio de Concursos" },
      { label: "关键准备", value: "企业 e.firma（SAT 校验）" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "CFE 项目：CFE 在 Micrositio 发布的货物、租赁、服务和工程采购",
          "不是全部电力项目：其他墨西哥能源项目可能在别的入口，先确认采购单位",
          "注册分类型：境内或境外、自然人或法人、供应商或工程承包商",
        ],
        note: "先确认项目还在进行、允许你这类主体参加、时间来得及，再办账户和电子签名。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "核对项目", detail: "确认是 CFE 采购，读日历和 Pliego de Requisitos，看截止和递交方式。" },
          { title: "选供应商类别", detail: "境内或境外、自然人或法人，货物服务供应商还是工程承包商。" },
          { title: "创建账户", detail: "在新供应商入口填写企业、联系人和税务资料。" },
          { title: "配置 e.firma", detail: "上传企业（不是个人）的 .cer、.key 和密码，由墨西哥税务局 SAT 校验。这实际需要墨西哥税号 RFC；没有的先问 CFE 服务台。" },
          { title: "加入程序", detail: "找到项目，表达参与意向，留意提问和答疑窗口。" },
          { title: "递交方案", detail: "法律、技术、经济方案按时电子递交，保存回执。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        items: [
          "企业资料：注册信息、法定代表人、授权委托、联系人",
          "税务与银行：税务和银行信息，诚信、利益冲突与合规声明",
          "e.firma 文件：证书 .cer、私钥 .key 和密码；注册资料有效一年，到期续",
          "技术响应：规格响应、人员履历、设备清单、实施计划",
          "业绩：同类合同、客户证明、质量或行业认证",
          "报价与担保：经济报价、成本构成、担保和其他附件",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "境外注册路径：注册页的境外法人路径是否适合你的企业",
          "没有 RFC 怎么办：项目是否允许国际参与，没有 RFC 时 e.firma 有无替代办法",
          "技术与本地要求：技术标准、本地含量、现场能力、保修和备件",
          "关键日期：说明会、现场踏勘、提问、开标和递交截止",
        ],
        note: "CFE 官方教程有检索、加入程序、提问和联合参与的操作说明。能否联合参与，以每个项目的 Pliego 和澄清为准。",
      },
    ],
    sources: [
      { label: "CFE Micrositio de Concursos", href: "https://msc.cfe.mx/Aplicaciones/NCFE/Concursos/" },
      { label: "CFE 新供应商注册", href: "https://msc.cfe.mx/Aplicaciones/NCFE/Concursos/Proveedor/NuevoProveedor" },
      { label: "CFE 供应商操作教程", href: "https://msc.cfe.mx/Aplicaciones/NCFE/Concursos/Home/AppProveedor" },
    ],
  },
  {
    slug: "mexico-pemex-siscep",
    country: "墨西哥",
    countryCode: "MX",
    platform: "Pemex SISCeP",
    issuer: "墨西哥国家石油公司（Pemex）",
    issuerType: "石油公司",
    title: "怎么参与 Pemex 的采购项目？",
    summary: "墨西哥国家石油公司的采购。先在 HIIP 2.0 登记，再逐个项目表达参与意向。",
    whatIs: "SISCeP 是 Pemex 的电子采购系统。企业先在 HIIP 2.0 登记供应商资料，再由授权联系人进入 SISCeP，对每个项目单独表达意向并递交资料。",
    audience: "油气、石化、工程、设备、运维与专业服务供应商",
    quickFacts: [
      { label: "采购单位", value: "Pemex（墨西哥国家石油公司）" },
      { label: "参与系统", value: "SISCeP" },
      { label: "前置动作", value: "HIIP 2.0 供应商登记" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "Pemex 项目：Pemex 及相关公司的电子采购活动",
          "不含其他入口：Compras MX、CFE 等其他机构的项目不在这里",
          "每个项目单独报名：登记完不会自动加入所有项目，每次都要表达参与意向",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "核对项目", detail: "确认还在进行、意向截止未过，读 bases 和附件。" },
          { title: "HIIP 2.0 登记", detail: "完成供应商登记，拿到六位供应商编号和登记证明。" },
          { title: "开通联系人", detail: "用 HIIP 登记、供应商编号和法定代表人邮箱，开通可进 SISCeP 的企业联系人。" },
          { title: "表达参与意向", detail: "按公告把 manifestación de interés 发到 SISCeP 指定邮箱，并抄送公告联系人。" },
          { title: "进入项目并递交", detail: "收到邀请链接后进入 SISCeP，按 bases 和澄清递交方案。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "Pemex 分层收集资料，具体项目可能另有要求。",
        items: [
          "企业身份：设立文件、法定代表人或授权人",
          "税务与商业：税务、联系和商业信息，六位供应商编号",
          "合规：法律合规声明、受益所有人或诚信信息（如要求）",
          "能力：财务信息、技术能力、人员与设施",
          "业绩与认证：行业经验、合同记录、安全和质量认证",
          "投标文件：技术和经济方案、担保、签署文件",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "能否直接登记：能否以境外供应商登记，还是要墨西哥税务、代表和合同安排",
          "行业要求：本地含量、能源行业、安全、环境或现场准入",
          "文件认证：西语翻译、公证、海牙认证（Apostille）",
          "资料保持有效：及时更新 HIIP 2.0 里的企业、联系人、税务和合规资料",
        ],
        note: "Pemex 供应商登记免费。不要向个人或第三方付注册费，也不要通过非官方渠道发敏感资料。",
      },
    ],
    sources: [
      { label: "Pemex 采购程序与参与步骤", href: "https://www.pemex.com/procura/procedimientos-de-contratacion/contratacion/Paginas/procedimiento.aspx" },
      { label: "Pemex SISCeP 采购程序入口", href: "https://www.pemex.com/procura/procedimientos-de-contratacion/contratacion/Paginas/default.aspx" },
      { label: "Pemex HIIP 2.0 供应商登记", href: "https://www.pemex.com/procura/relacion-con-proveedores/registro-de-proveedores/Paginas/proceso-registro.aspx" },
      { label: "Pemex 供应商安全提醒", href: "https://www.pemex.com/procura/Paginas/aviso-proveedores.aspx" },
    ],
  },
  {
    slug: "brazil-pncp",
    country: "巴西",
    countryCode: "BR",
    platform: "Portal Nacional de Contratações Públicas (PNCP)",
    issuer: "巴西联邦、州、市各级政府机构",
    issuerType: "政府采购平台",
    title: "怎么参与 PNCP 发布的巴西政府采购项目？",
    summary: "巴西全国政府采购公告平台。在这里看公告，到公告指定的系统去投标。",
    whatIs: "PNCP 是巴西新采购法（第 14.133/2021 号法律）设立的全国采购公告门户，联邦、州、市的项目都要在这里公开。它主要用来查公告和文件；真正投标多在 Compras.gov.br、州市系统或公告指定的平台。",
    audience: "准备参与巴西各级政府采购的境内外企业",
    quickFacts: [
      { label: "官方入口", value: "PNCP（全国公告与检索）" },
      { label: "常用语言", value: "葡萄牙语" },
      { label: "实际投标", value: "公告指定的电子系统" },
    ],
    sections: [
      {
        id: "scope",
        title: "先分清三个入口",
        items: [
          "PNCP 看公告：下载完整 edital、附件、澄清和更正，确认资格和截止时间",
          "电子系统去投标：可能是 Compras.gov.br，也可能是州、市或采购机构自己的平台",
          "SICAF 做登记：联邦采购常用的供应商登记，外国企业走境外供应商路径",
          "特殊项目另看规则：特许经营、PPP 和国企采购，按主管机构或企业门户的规则",
        ],
        note: "PNCP 上能看到项目，不代表在 PNCP 上投标。以 edital 指定的系统和递交方式为准。",
      },
      {
        id: "first-check",
        title: "先看这些字段",
        items: [
          "Órgão ou entidade：采购机关，后续沟通和资格核验找它",
          "Unidade compradora / UASG：具体采购单位，联邦项目用 UASG 识别",
          "Número de controle PNCP：PNCP 唯一编号，用来核对附件和更新",
          "Modalidade：采购方式，如 Pregão、Concorrência、Leilão",
          "Modo de disputa：公开、封闭或组合竞价",
          "Situação：当前状态，留意暂停、撤销和更正",
          "Data de abertura / encerramento：接收报价的起止时间",
          "Local de realização：线上还是线下，用哪个电子系统",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "确认资格和入口", detail: "从 edital 看外国企业、联合体能否参加，用哪个电子系统。" },
          { title: "确定参与身份", detail: "境外企业、巴西子公司、联合体成员还是分包？要不要 CNPJ。" },
          { title: "注册账户", detail: "用 Compras.gov.br 的办 SICAF；境外企业负责人可能要 CPF。其他平台分别注册。" },
          { title: "准备文件", detail: "企业、业绩、财务、技术方案、报价、保证文件，加葡语翻译和认证。" },
          { title: "递交并留凭证", detail: "按 edital 的格式、时区和币种递交，保存系统回执。" },
          { title: "跟进竞价和合同", detail: "关注在线竞价、补件、申诉、结果和签约。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "以 edital 为准，境外企业可以先准备这些。",
        items: [
          "企业文件：成立、存续、章程、地址、税号",
          "授权：法定代表人、授权代理人、签字权限",
          "平台资料：SICAF 或投标系统要的企业和用户资料",
          "合规证明：税务、劳动、社保、诚信；境外没有的写等效说明",
          "业绩与能力：同类合同、客户证明、人员、设备、质量认证",
          "财务与报价：财务报表、报价、税费、进口和本地履约安排",
          "保证与声明：投标保证、履约保证、声明书",
        ],
        note: "SICAF 登记时，境外企业可先交自由翻译的等效文件；签合同时通常要换成巴西宣誓翻译加海牙认证或领事认证的版本。以现行规则和 edital 为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "要不要巴西主体：能否不设巴西实体参加，还是要 CNPJ、本地代表",
          "SICAF 谁来发起：负责人要不要 CPF，采购机关要提前录入什么",
          "翻译认证的时间点：投标时能否用自由翻译，何时要宣誓翻译和 Apostille",
          "巴西认证：要不要 ABNT、INMETRO、ANVISA、ANEEL、ANATEL 等认证，来得及吗",
          "本地优惠：本国产品、中小企业优惠或本地服务要求",
          "税费成本：ICMS、IPI、ISS、PIS/COFINS、进口税、物流、汇率",
          "担保与分包：保证金由谁出具，能否联合体、分包和本地售后",
        ],
        note: "能登记进系统，不代表符合某个项目。投入前向采购单位书面提问，确认文件、税务、担保和认证要求。",
      },
    ],
    sources: [
      { label: "PNCP官方平台", href: "https://pncp.gov.br/" },
      { label: "PNCP官方说明", href: "https://www.gov.br/pncp/pt-br/pncp/sobre-o-pncp/sobre-o-pncp" },
      { label: "PNCP手册与开放数据说明", href: "https://www.gov.br/pncp/pt-br/pncp/manuais" },
      { label: "Compras.gov.br供应商入口", href: "https://www.gov.br/compras/pt-br/fornecedor" },
      { label: "Compras.gov.br现行操作手册", href: "https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais" },
      { label: "SICAF境外供应商常见问题", href: "https://www.gov.br/compras/pt-br/acesso-a-informacao/perguntas-frequentes/sicaf-normativo" },
      { label: "巴西《第14.133/2021号采购法》", href: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" },
      { label: "巴西联邦官方公报（DOU）", href: "https://www.gov.br/pt-br/servicos/acessar-o-diario-oficial-da-uniao" },
    ],
  },
  {
    slug: "colombia-secop-ii",
    country: "哥伦比亚",
    countryCode: "CO",
    platform: "SECOP II",
    issuer: "哥伦比亚各级公共采购实体",
    issuerType: "政府采购平台",
    title: "怎么参与 SECOP II 的政府采购项目？",
    summary: "哥伦比亚政府采购交易平台。先建个人用户，再建或加入企业账户。",
    whatIs: "SECOP II 是哥伦比亚的电子公共采购平台，由 Colombia Compra Eficiente 管理。发布、沟通、报价、评审和合同管理都在平台里完成。",
    audience: "想参与哥伦比亚公共采购的本地或境外供应商",
    quickFacts: [
      { label: "官方系统", value: "SECOP II" },
      { label: "账户结构", value: "个人用户 + 供应商账户" },
      { label: "账户启用", value: "完成流程后自动启用" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "SECOP II 项目：采购实体在 SECOP II 上开展的线上采购",
          "条件各不相同：每个项目的参与条件要看采购实体的文件",
          "两层账户：个人用户 + 企业供应商账户；企业已有账户就申请加入，不要重建",
        ],
        note: "先看项目、采购实体、时间表和 pliego de condiciones，再决定是否开账户。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "核对项目", detail: "看采购实体、状态、时间表，外国供应商和 RUP 是否适用。" },
          { title: "注册个人用户", detail: "邮件激活，一人一个账户不共用，时区按所在地设。" },
          { title: "建企业账户", detail: "为企业创建供应商账户；企业已有的，申请加入。" },
          { title: "填资料传文件", detail: "补全资料和证明，账户自动启用（不代表官方已审核）。" },
          { title: "关注项目", detail: "按实体、关键词、分类、地区检索并关注。" },
          { title: "提交报价", detail: "按要求填问题、文件和价格表，截止前提交并保存确认。" },
        ],
      },
      {
        id: "documents",
        title: "企业账户常用资料",
        intro: "法人企业通常准备这些。",
        items: [
          "存在与代表证明：企业存在和法定代表证明，境外企业用本国对应文件",
          "财务能力：组织和财务能力证明、上年度审计报表及附注；新设企业按官方指南替代",
          "业绩：已完成合同或经验清单",
          "查询授权：同意公共机构查询相关数据库的授权书",
          "账户资料：企业分类、联系信息等",
          "RUP（如适用）：开账户一般不需要，公开招标另说，见下方核对",
        ],
        note: "供应商目录里的资料别人可能看到。上传证件等敏感资料前，按官方指南加水印或保密标注。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "能否参加：是否允许外国供应商，要不要设分支、委任代表或联合体",
          "RUP 要不要登记：在哥伦比亚有住所的自然人、设了分支（sucursal）的外国法人要登记；没有住所、没有分支的外国企业豁免，由采购实体另行核验资格。注意：为投标去设分支，反而要登记 RUP",
          "税务与担保：税务登记、保证金、本地银行安排",
          "文件认证：西语官方翻译、公证、海牙认证或领事认证",
          "操作细节：时区、电子签署、报价币种、税费、跨境履约",
        ],
        note: "账户注册文件不能代替项目要求的投标文件。以 pliego de condiciones 和采购实体的正式答复为准。",
      },
    ],
    sources: [
      // The guide's landing page rather than a direct PDF path: Colombia Compra
      // Eficiente migrated www off /sites/cce_public/ (that tree now answers on
      // the operaciones. subdomain), so a PDF URL is the part that rots.
      { label: "SECOP II 供应商注册官方指南", href: "https://www.colombiacompra.gov.co/archivos/manual/guia-de-procedimiento-de-registro-de-proveedores-del-sistema-electronico-para-la-contratacion-publica-secop-ii" },
      { label: "SECOP II 注册所需文件说明", href: "https://operaciones.colombiacompra.gov.co/secop-ii/3247/23693/Documentos%20requeridos%20para%20el%20registro" },
      { label: "Colombia Compra Eficiente 官方门户", href: "https://www.colombiacompra.gov.co/secop/secop-ii" },
      { label: "RUP 官方说明（谁需要登记、谁豁免）", href: "https://www.colombiacompra.gov.co/archivos/infografia/registro-unico-de-proponentes" },
    ],
  },
  {
    slug: "mexico-proyectos-estrategicos",
    country: "墨西哥",
    countryCode: "MX",
    platform: "Proyectos Estratégicos MX",
    issuer: "墨西哥联邦政府认定的战略基础设施项目",
    issuerType: "政府基础设施项目",
    title: "怎么参与 Proyectos Estratégicos MX 的项目？",
    summary: "墨西哥战略基础设施专项项目的入口。先确认项目属于这个制度，再看公告。",
    whatIs: "墨西哥发布战略基础设施项目采购的官方入口，2026 年随新法启用。它不替代 Compras MX，也不包括所有基础设施项目；怎么参加，看每个项目的 convocatoria 和 bases。",
    audience: "基础设施、工程、设备、能源、交通与大型项目供应商",
    quickFacts: [
      { label: "官方平台", value: "Proyectos Estratégicos MX" },
      { label: "主管领域", value: "战略基础设施项目" },
      { label: "制度状态", value: "2026 年启用的新机制" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "专项项目：按战略基础设施专项制度认定的项目",
          "不是全部基建：一般基建和 CFE、Pemex、Compras MX 的项目要另查",
          "外资规则仍适用：外国资本、能源等行业还受外商投资法和行业法律约束",
        ],
        note: "先确认项目属于这个制度，找到 convocatoria 和 bases；别只凭平台名称或项目规模判断。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "找到项目", detail: "按采购实体、名称或编号搜索，确认阶段和最新版本。" },
          { title: "核对参与范围", detail: "读 convocatoria 和 bases，看外国企业能否参加、适用哪些规则。" },
          { title: "下载全套文件", detail: "convocatoria、bases、anexos、技术规格、时间表和全部澄清。" },
          { title: "按指定渠道递交", detail: "Compras MX 账户不一定通用，按项目公告的平台和方式登记递交。" },
          { title: "跟进里程碑", detail: "说明会、踏勘、提问、递交和开标，时间表可能被更正。" },
        ],
      },
      {
        id: "documents",
        title: "可以先准备的资料",
        intro: "新制度项目差异大，没有固定清单。可以先整理这些。",
        items: [
          "企业资料：设立、法定代表、授权、税务、联系方式",
          "大项目业绩：同类大型项目合同和履约证明",
          "团队与能力：关键人员、设备、施工或供货能力",
          "财务与融资：财务报表、融资能力、保险、担保",
          "股权透明：控股结构、最终受益人、关联关系、利益冲突声明",
          "技术方案：进度计划、环境社会影响、安全和质量",
          "报价与风险：经济报价、长期融资和风险分配、本地含量材料",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "能否国际参与：国际条约、国籍或原产地条件",
          "本地主体：要不要墨西哥本地实体、联合体、项目公司或代表",
          "资质转换：境外文件认证、翻译、技术标准和本地专业资质",
          "长期风险：融资、汇率、税务、进口、用工、环境和运维责任",
        ],
        note: "它和 Compras MX 是两个入口。界面相似，但账户、资格和递交方式不能默认互通。",
      },
    ],
    sources: [
      { label: "Proyectos Estratégicos MX 官方平台", href: "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/" },
      // Per-document permalinks, not abrirPDF.php whole-edition PDFs: the DOF
      // evening edition of 2026-04-09 also carries an unrelated LFPRH reform, so
      // the edition PDF makes a reader hunt for the law inside it.
      { label: "战略基础设施投资促进法 LFIIEDB（DOF，2026-04-09 晚版）", href: "https://www.dof.gob.mx/nota_detalle.php?codigo=5784517&fecha=09/04/2026" },
      { label: "配套条例 Reglamento（DOF，2026-05-08 晚版）", href: "https://www.dof.gob.mx/nota_detalle.php?codigo=5786977&fecha=08/05/2026" },
    ],
  },
  {
    slug: "peru-seace-oece",
    country: "秘鲁",
    countryCode: "PE",
    platform: "SEACE / OECE",
    issuer: "秘鲁各级政府机构",
    issuerType: "政府采购平台",
    title: "怎么参与秘鲁 SEACE 的政府采购项目？",
    summary: "秘鲁政府采购系统。必须先有有效的 RNP 供应商登记，再按 bases 投标。",
    whatIs: "SEACE 是秘鲁政府采购的电子系统，主管机构是 OECE（原 OSCE）。新采购法 Ley N.° 32069 在 2025 年 4 月 22 日生效后，业务正在迁到新平台 PLADICOP，SEACE 仍可查询。本站的秘鲁常规项目来自 OECE 的开放数据。",
    audience: "想参与秘鲁公共采购的境内外货物、服务、工程和咨询企业",
    quickFacts: [
      { label: "主管机构", value: "OECE（原 OSCE）" },
      { label: "法定前提", value: "有效的 RNP 登记" },
      { label: "平台状态", value: "SEACE 与 PLADICOP 过渡中" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "选 RNP 类别", detail: "RNP 分货物、服务、工程咨询、工程执行四类，要和项目对象对上，不是登记一次就通用。" },
          { title: "办 RNP 登记", detail: "没在秘鲁设分支的按 extranjero no domiciliado，经 OECE 线上窗口提交；登记长期有效，资料要及时更新。" },
          { title: "找项目看阶段", detail: "在 SEACE／PLADICOP 查找，确认程序类型和当前阶段，判断还来不来得及。" },
          { title: "等最终版 bases", detail: "质询和异议之后发布的 bases integradas 才是最终版本，别按首次公告准备。" },
          { title: "递交并跟进授标", detail: "按 bases 递交并保存回执，关注 buena pro（授标）、异议期和签约。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "多数项目会要的，具体以 bases 为准。",
        items: [
          "RNP 登记文件：企业存在证明、法定代表人身份、授权书",
          "公司文件：章程及变更、股权结构、实际受益人",
          "业绩：同类项目合同、验收或履约证明",
          "人员与设备：关键人员、设备清单、实施方案（工程和咨询类尤其重要）",
          "财务与报价：财务报表、财务能力证明、报价和成本明细",
          "担保与声明：投标和履约担保、宣誓书（declaraciones juradas）",
        ],
        note: "有效的 RNP 登记是法定前提，但不能代替 bases 的资格条件。类别是否匹配、经验和财务门槛是否达标，都要逐项核对。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "你是哪种身份：无住所境外主体还是已设分支，登记路径和义务不同；为投标去设分支会改变适用规则",
          "是否开放国际：有没有限定本地供应商、特定条约或原产地",
          "文件认证：西语官方翻译、公证、Apostille 还是领事认证，以 bases 和 OECE 为准",
          "保函：carta fianza 是否必须由秘鲁境内金融机构出具，中资银行保函是否接受",
          "钱的问题：索尔或美元报价、IGV 等税费、关税清关、付款条件",
          "禁止签约情形：是否触及 impedimentos para contratar con el Estado，关联企业要申报",
        ],
        note: "秘鲁正处在新法和 PLADICOP 的过渡期，入口和表单还在变。以 OECE 现行公告和 bases 为准，别用旧 OSCE 时期的说明。",
      },
    ],
    sources: [
      { label: "OECE 官方机构页", href: "https://www.gob.pe/oece" },
      { label: "RNP 登记（境外无住所主体）官方指引", href: "https://www.gob.pe/22020-inscribirme-en-el-registro-nacional-de-proveedores-rnp-como-extranjero-no-domiciliado" },
      { label: "Ley N.° 32069 及其条例合集（OECE）", href: "https://www.gob.pe/institucion/oece/colecciones/45029-ley-n-32069-ley-general-de-contrataciones-publicas-y-su-reglamento" },
      { label: "SEACE 公开项目检索", href: SEACE_PUBLIC_SEARCH_URL },
    ],
  },
  {
    slug: "peru-obras-por-impuestos",
    country: "秘鲁",
    countryCode: "PE",
    platform: "ProInversión · Obras por Impuestos",
    issuer: "秘鲁各级公共实体，ProInversión 负责推广",
    issuerType: "以工程抵税机制",
    title: "怎么参与秘鲁 Obras por Impuestos（以工程抵税）项目？",
    summary: "企业先出资建公共项目，再用证书抵秘鲁所得税。先想清楚自己当出资方还是执行方。",
    whatIs: "Obras por Impuestos（OxI，以工程抵税）是秘鲁 Ley N.° 29230 设立的机制：企业先出钱建公共项目，验收后由经济财政部（MEF）发 CIPRL／CIPGN 证书，用来抵缴在秘鲁的企业所得税。ProInversión 负责推广，现行条例是 2026 年 3 月的 DS N.° 038-2026-EF。",
    audience: "想在秘鲁承接基础设施和公共服务项目的工程、设备与投资企业",
    quickFacts: [
      { label: "法律依据", value: "Ley N.° 29230" },
      { label: "现行条例", value: "DS N.° 038-2026-EF（2026 年 3 月）" },
      { label: "回报方式", value: "CIPRL／CIPGN 抵秘鲁所得税" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先选角色", detail: "出资企业（financista）参加遴选，执行企业（ejecutora）负责施工供货。在秘鲁没有应税所得的，当执行方更现实。" },
          { title: "找遴选中项目", detail: "看 ProInversión 的遴选清单（本站也收录），有发起实体、金额和日期。" },
          { title: "读 bases", detail: "遴选由发起项目的公共实体主持，资格、担保、时间表各项目不同。" },
          { title: "准备提案", detail: "法律、技术、经济资料加担保；常见是执行、监理、维护各一份 carta fianza。" },
          { title: "执行并拿证书", detail: "签公共投资协议，由监理机构监督，按验收进度申请证书抵税。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "资格以每个遴选的 bases 和现行条例为准。",
        items: [
          "企业文件：存在证明、法定代表权、授权",
          "出资能力：财务报表和出资能力证明（出资方最关键的一项）",
          "业绩：同类工程业绩和履约记录",
          "执行方资质：执行企业和关键人员资质、设备和施工能力",
          "技术方案：进度计划、成本构成、运维安排",
          "担保与声明：carta fianza、宣誓书、合规声明",
        ],
        note: "OxI 条例近年多次修订，以 2026 年 3 月的 DS N.° 038-2026-EF 和项目 bases 为准，别用早年的介绍材料。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "抵税算不算得过来：证书只能抵秘鲁企业所得税，且有比例上限；在秘鲁没有应税所得，当出资方就不划算，可考虑转让证书或改当执行方",
          "出资与执行分开：两方谁担工期、质量和缺陷责任，合同怎么签",
          "保函：carta fianza 的出具机构、币种、有效期，中资银行是否接受",
          "前期条件：征地、许可、设计文件和社会环境问题，是最常见的延期原因",
          "资金占用：证书签发到抵扣有时间差，有资金和汇率风险",
        ],
        note: "本站列出的 OxI 项目用于发现机会。适不适合、以什么角色参加，要结合在秘鲁的税务情况判断，必要时先问当地法律和税务顾问。",
      },
    ],
    sources: [
      { label: "ProInversión 正在遴选的 OxI 项目清单", href: "https://www.investinperu.pe/inversiones-seleccion-oxi/" },
      { label: "ProInversión OxI 常见问题", href: "https://www.investinperu.pe/bloque-oxi/preguntas-frecuentes-preguntas-generales/" },
      { label: "DS N.° 038-2026-EF 现行条例（ProInversión 法规页）", href: "https://www.gob.pe/institucion/proinversion/normas-legales/7867843-038-2026-ef" },
      { label: "SUNAT：CIPRL 与 CIPGN 的使用", href: "https://orientacion.sunat.gob.pe/03-utilizacion-de-los-ciprl-y-cipgn" },
      { label: "MEF：Obras por Impuestos 数据与统计", href: "https://www.mef.gob.pe/es/inversion-privada-sp-21801/612-obras-por-impuestos/3981-estadisticas" },
    ],
  },
  {
    slug: "chile-mercado-publico",
    country: "智利",
    countryCode: "CL",
    platform: "Mercado Público / ChileCompra",
    issuer: "智利公共部门机构，ChileCompra 管理",
    issuerType: "政府采购平台",
    title: "怎么参与智利 Mercado Público 的政府采购项目？",
    summary: "智利政府采购平台。登记为 hábil（可参与）状态的供应商，才能在线报价。",
    whatIs: "Mercado Público 是智利政府采购的查询和交易平台，由 ChileCompra 管理。供应商要在 Registro de Proveedores 登记并保持 hábil（可参与）状态。特许经营、国企和矿业能源项目一般走各自的渠道。",
    audience: "想参与智利公共部门货物、服务和部分工程采购的境内外企业",
    quickFacts: [
      { label: "官方平台", value: "Mercado Público" },
      { label: "注册状态", value: "Registro de Proveedores：hábil" },
      { label: "常用语言", value: "西班牙语" },
    ],
    sections: [
      {
        id: "scope",
        title: "先分清采购体系",
        items: [
          "政府机构采购：受智利公共采购制度管理的机构，在这里公开招标",
          "特许经营另查：MOP 特许经营项目去 Dirección General de Concesiones 核查",
          "企业采购另查：矿业、电力、港口公司和 EPC 承包商用自己的供应商系统",
        ],
        note: "先认清采购主体和项目编号，再判断你是直接投标、联合参与，还是做设备或专项供应商。",
      },
      {
        id: "first-check",
        title: "打开项目先看这些",
        items: [
          "ID de licitación / organismo comprador：项目编号和采购机构",
          "Estado / cronograma：状态，以及提问、递交、开标、授标的日期和时区",
          "Bases / anexos / aclaraciones：完整标书、附件、问答和更正",
          "Requisitos para ofertar：登记状态、经验、认证、踏勘、联合体、签署",
          "Garantías / evaluación：担保、评分权重、币种、税费、交付地点",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "搜索筛选", detail: "按关键词、行业、机构或 ID 找项目，排除已关闭或来不及的。" },
          { title: "读完整 bases", detail: "看行政、技术、经济条件和问答更正，别只按摘要报价。" },
          { title: "供应商登记", detail: "在 Registro de Proveedores 登记并确认 hábil；用不了 ClaveÚnica 的境外企业先问 ChileCompra。" },
          { title: "发送报价", detail: "填价格和税费，上传文件，截止前发送并保存确认编号；改过报价要再确认一次。" },
          { title: "跟进授标合同", detail: "看澄清、开标、评估、授标和订单；中标后交履约担保。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "具体文件、有效期和格式由每个项目的 bases 决定。",
        items: [
          "企业身份：国籍、地址、设立和存续证明",
          "授权：法定代表人身份和授权文件",
          "股东与诚信：股东、管理人员、最终受益人、诚信声明",
          "业绩与技术：同类业绩、人员设备、质量认证、产品资料",
          "报价与担保：价格、税费、运输交付、担保",
          "认证翻译：境外文件认证、西语翻译、电子签署",
        ],
        note: "境外企业可以登记，但平台注册、税务和履约是三件事。要不要智利 RUT、本地代表或进口安排，看具体项目和交易结构。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "登录方式不同：别套用 ClaveÚnica 的步骤，境外供应商有用识别 ID 登录的路径",
          "供货方式：能否直接境外供货、联合体或本地代理，报关、增值税、售后谁负责",
          "文件准备：设立、存续、授权、受益人资料和西语翻译",
          "成本核算：担保、智利标准、汇率、保修；参考金额不等于合同金额",
          "大项目看承包链：道路、机场、港口、矿业还要跟特许经营公司、业主和 EPC",
        ],
        note: "截至 2026 年 9 月，智利供应商登记和平台功能仍在更新。投标前再核对 ChileCompra 最新指引和 bases。",
      },
    ],
    sources: [
      { label: "ChileCompra：Mercado Público 平台与公开／交易功能", href: "https://www.chilecompra.cl/mercado-publico/" },
      { label: "ChileCompra：供应商登记与境外企业资料要求", href: "https://www.chilecompra.cl/registro-proveedores-del-estado/" },
      { label: "ChileCompra：如何向政府销售", href: "https://www.chilecompra.cl/como-vender-al-estado/" },
      { label: "Mercado Público：2026年简易招标供应商操作说明", href: "https://ayuda.mercadopublico.cl/preguntasfrecuentes/articulo/?id=KA-02086" },
      { label: "Mercado Público：境外供应商登录帮助", href: "https://ayuda.mercadopublico.cl/preguntasfrecuentes/articulo/?id=KA-01966" },
      { label: "ChileCompra：现行担保规则", href: "https://www.chilecompra.cl/garantias/" },
    ],
  },
  {
    slug: "brazil-petrobras-petronect",
    country: "巴西",
    countryCode: "BR",
    platform: "Petrobras · Petronect",
    issuer: "巴西国家石油公司（Petrobras）及其物流子公司 Transpetro",
    issuerType: "石油公司",
    title: "怎么参与巴西国家石油公司 Petrobras 的采购项目？",
    summary: "巴西国家石油公司在自有门户 Petronect 采购，不在 PNCP。先登记，再看每个机会是否对境外开放。",
    whatIs: "Petronect 是 Petrobras 的电子采购门户，Petrobras 和子公司 Transpetro 在这里公开接受报价的机会。Petrobras 按国企法 Lei 13.303/2016 采购，所以项目不上 PNCP。本站的 Petrobras 项目来自这份公开列表，以设备、材料和工程为主。",
    audience: "油气设备、管材阀门、电气仪表、海工与炼化工程的供应商和承包商",
    quickFacts: [
      { label: "采购门户", value: "Petronect" },
      { label: "法律依据", value: "Lei 13.303/2016（国企法）" },
      { label: "境外企业", value: "看每个机会的 Abrangência" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "Petronect 公开机会：Petrobras 和 Transpetro 公开接受报价的机会",
          "不在 PNCP：Petrobras 的采购在 PNCP 查不到",
          "DOU 只是简讯：官方公报上的 AVISO DE LICITAÇÃO 很简短，完整文件和报价在 Petronect",
          "很多是邀请制：大量采购按登记类别邀请，公开列表只是一部分",
        ],
        note: "先看每个机会的 Abrangência（参与范围）：Internacional 境外企业可以报价，Nacional 只限巴西供应商。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "找机会看范围", detail: "用 Buscar por 按编号或关键词搜索，确认 Abrangência、报价期和发布公司。" },
          { title: "创建企业档案", detail: "在 Petronect 做供应商登记，全年开放；企业身份信息确认后不能改，填前核对清楚。" },
          { title: "选类别答问卷", detail: "选物料或服务类别（família），回答评估问卷；境外企业用专门的问卷。" },
          { title: "等登记证书", detail: "审核通过的类别发 CRC 登记证书（可能只通过部分类别）。" },
          { title: "下载文件并报价", detail: "下载附件和招标文件，在报价期内提交，跟进澄清和结果。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "以登记问卷和每个机会的文件为准。",
        items: [
          "企业文件：设立和存续证明、地址、税号",
          "授权：法定代表人身份、授权书、签字权限",
          "财务：财务报表、未破产清算声明",
          "业绩：客户推荐信、同类供货或工程业绩",
          "SMS 记录：健康安全环境记录和培训计划（巴西企业问卷要求）",
          "声明：信息真实性声明、反腐败合规声明",
        ],
        note: "登记本身免费；但 Petronect 对参与公开机会收访问费（Taxa de Acesso），对中标企业收交易费（Taxa de Transação）。别向自称代表 Petrobras 收费的第三方付款。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "Abrangência：Nacional 的机会境外企业不能直接报价，只能通过巴西实体或做分包、供货",
          "类别要对上：登记的 família 要和机会一致；登记成功不保证能参加",
          "报价条件：INCOTERMS、币种、进口税费、清关、交付地点",
          "技术标准：Petrobras N 标准、API、ABNT、INMETRO 认证来不来得及",
          "本地含量：conteúdo local、售后和现场服务、能否分包",
          "诚信合规：评估含诚信一项，提前梳理关联关系、制裁名单和过往合规事件",
        ],
        note: "公开机会一般不写预算（国企法允许保密）。用技术规格、数量和交付范围估算规模。",
      },
    ],
    sources: [
      { label: "Petronect 公开机会列表（Oportunidades Abertas）", href: "https://www.petronect.com.br/irj/go/km/docs/pccshrcontent/Site%20Content%20(Legacy)/Portal2018/pt/lista_licitacoes_publicadas_ft.html" },
      { label: "Petrobras 供应商登记说明（Canal Fornecedor）", href: "https://canalfornecedor.petrobras.com.br/cadastro-de-fornecedores/sobre-o-cadastro-de-fornecedores" },
      { label: "Petrobras 供应商登记步骤", href: "https://canalfornecedor.petrobras.com.br/cadastro-de-fornecedores/etapas-do-processo-de-cadastramento" },
      { label: "Petronect 登记常见问题", href: "https://www.petronect.com.br/irj/go/km/docs/pccshrcontent/Site%20Content%20(Legacy)/Publico_2_/Site%20Content/PT/cadastro_faq.html" },
      { label: "巴西《国有企业法》Lei 13.303/2016", href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13303.htm" },
    ],
  },
  {
    slug: "brazil-cemig",
    country: "巴西",
    countryCode: "BR",
    platform: "Cemig · Portal de Compras",
    issuer: "米纳斯吉拉斯州能源公司（Cemig），巴西大型州属电力公司",
    issuerType: "电力公司",
    title: "怎么参与巴西电力公司 Cemig 的采购项目？",
    summary: "巴西州属电力公司在自有门户采购电网设备。要登记在对应物料类别，境外企业须通过巴西代表沟通。",
    whatIs: "Cemig 是巴西米纳斯吉拉斯州控股的电力公司，做发电、输电和配电。它按国企法 Lei 13.303/2016 和内部规章，在自有的 Portal de Compras 发布采购，不上 PNCP。本站收录的以铁塔、绝缘子、变压器等电网设备和材料为主。",
    audience: "输变电设备、电力材料、电网工程的供应商和承包商",
    quickFacts: [
      { label: "采购门户", value: "Cemig Portal de Compras" },
      { label: "法律依据", value: "Lei 13.303/2016 与内部规章" },
      { label: "报价前提", value: "登记在对应物料或服务类别" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "Cemig 采购：Cemig 及其发电、输电、配电子公司在门户发布的项目",
          "查看免登录：公开检索不用登录；报价要账户，资料交齐后才开通",
          "类别要对上：必须登记在 Edital 为该标段指定的物料组或服务组",
        ],
        note: "招标文件通常是一个压缩包（规格、图纸、合同条件），下载后逐项看，别只看门户摘要。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "核对项目标段", detail: "下载 Edital，看标段、所需类别、报价期和竞价（disputa）时间。" },
          { title: "选登记路径", detail: "巴西企业、境外企业（Empresa Internacional）或 SAP Ariba 渠道，按身份选，别混用。" },
          { title: "提交登记资料", detail: "在线提交并跟踪审核；境外企业的文件都要海牙认证或领事认证，写明本国税号。" },
          { title: "技术预审", detail: "关键物料和设备要做技术预审，没通过的可能无法中标。" },
          { title: "报价和竞价", detail: "账户开通后上传报价，参加线上竞价，跟进资格审查和合同。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "以 Cemig 登记要求和 Edital 为准。",
        items: [
          "企业文件：设立存续证明、章程、本国税号（需认证）",
          "授权：法定代表人授权、巴西代表的授权",
          "合规证明：税务、劳动、社保合规，或境外的等效文件",
          "财务：财务报表、经济财务能力",
          "技术资料：同类业绩、产品资料、型式试验报告、质量认证",
          "声明：合规、可持续和诚信声明",
        ],
        note: "登记问题可写信到 cadastrocemig@cemig.com.br。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "巴西代表：Cemig 只通过境外企业在巴西的代表联系，要提前定人和授权范围",
          "文件认证：中国是海牙公约成员，办 Apostille 即可；葡语翻译看登记说明和 Edital",
          "技术认证：要不要 INMETRO、ABNT 或 Cemig 规范认可，试验能否在巴西认可的实验室做",
          "报价条件：币种、进口税费（II、IPI、ICMS、PIS/COFINS）、清关、送到 Cemig 仓库",
          "联合体与售后：能否联合体和分包，备件和质保期",
        ],
        note: "已发布的流程不显示预算。用 Edital 的数量清单和技术规格估算规模。",
      },
    ],
    sources: [
      { label: "Cemig Portal de Compras（项目检索）", href: "https://app2-compras.cemig.com.br/pesquisa" },
      { label: "Cemig 供应商登记说明", href: "https://www.cemig.com.br/fornecedores/cadastro-de-fornecedores/" },
      { label: "Cemig 境外企业登记（Empresa Internacional）", href: "https://www.cemig.com.br/fornecedores/cadastro-de-fornecedores/cadastro-de-empresa-internacional/" },
      { label: "Cemig 技术预审（Pré-qualificação Técnica）", href: "https://www.cemig.com.br/fornecedores/pre-qualificacao-tecnica/" },
      { label: "巴西《国有企业法》Lei 13.303/2016", href: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13303.htm" },
    ],
  },
  {
    slug: "colombia-upme",
    country: "哥伦比亚",
    countryCode: "CO",
    platform: "UPME · 输电项目公开招商",
    issuer: "哥伦比亚矿业能源规划署（UPME），隶属矿业能源部的政府规划机构",
    issuerType: "电力输电项目",
    title: "怎么参与哥伦比亚 UPME 的输电项目招商？",
    summary: "UPME 招的是投资人，不是设备供应商。先想清楚：自己当投资人，还是给投资人做工程和供货。",
    whatIs: "UPME 是哥伦比亚矿业能源部下属的规划机构。它为每个新输电项目公开遴选投资人：投资人自己出钱设计、建设并运营线路和变电站，建成后按监管委员会 CREG 核定的年收入长期回本。这些项目不在 SECOP II。UPME 还会另外遴选项目监理（Interventor）。",
    audience: "输变电总包、电网投资运营企业、电力设备商，以及监理和咨询公司",
    quickFacts: [
      { label: "遴选对象", value: "项目投资人（及监理机构）" },
      { label: "评标方式", value: "25 年预期年收入现值最低者中标" },
      { label: "中标后", value: "在哥伦比亚设立公共服务企业 E.S.P." },
    ],
    sections: [
      {
        id: "scope",
        title: "先弄清楚这是什么项目",
        items: [
          "招的是投资人：中标者自己出资建设运营，不是 UPME 花钱买工程",
          "回报是年收入：CREG 核定的预期年收入，按投标时报出的 25 年收入流计算",
          "可以提前研究：很多项目在正式公告前有预公告（Prepublicación）",
          "文件都在项目页：项目文件、听证会纪要和补遗都在 UPME 项目页面",
        ],
        note: "对多数设备商和工程公司，更现实的是给投资人做 EPC、分包或供货。跟踪 UPME 项目，能提前知道谁会在什么时候采购。",
      },
      {
        id: "process",
        title: "投资人参与流程",
        steps: [
          { title: "读 DSI 文件", detail: "每个项目发布投资人遴选文件（DSI），写明技术要求、投运日期、保函和评标规则。" },
          { title: "平台注册", detail: "可单独或以联合体投标；递交前在 UPME 电子平台注册，并指定授权代表。" },
          { title: "1 号信封：技术", detail: "资格文件、股权结构、投标保函、质量证书；还不是 E.S.P. 的附上拟设公司章程。" },
          { title: "2 号信封：经济", detail: "按美元不变价报 25 年每年的预期收入，现值最低的有效方案中标。" },
          { title: "设 E.S.P. 交保函", detail: "中标后在哥伦比亚设立输电公共服务企业，交 ASIC（XM）审批的履约保函，签监理信托合同。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "来自 UPME 的 DSI 样本，以每个项目的 DSI 为准。",
        items: [
          "存在与代表证明：没有哥伦比亚分支的境外企业，可用本国主管机关的同等文件",
          "股权结构证明：审计师或法定代表签署，联合体每个成员都要",
          "联合体协议：成员、持股比例、代表人、最短存续期",
          "投标保函：一流金融机构出具；境外银行须在哥伦比亚央行认可名单内，并有投资级评级",
          "格式文件：质量体系证书、授权委托书、项目共存承诺函",
        ],
        note: "境外文件要附哥伦比亚认可的官方译员出具的西语译文，并办海牙认证或领事认证，签发日期一般不超过 90 天。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "选角色：当投资人要长期持有运营电网资产并设 E.S.P.；只做工程供货的，跟踪中标投资人的采购",
          "保函期限：至少覆盖递交后 4 个月，CREG 还没确认收入的，要一直延到确认",
          "长期风险：收入按美元不变价计，评估汇率、融资成本和 25 年运营风险",
          "延期风险：环境许可、通行权和社区协商常导致延期，延期期间按月计费",
          "监理是单独机会：Interventor 另行遴选，监理和咨询公司可以单独关注",
        ],
        note: "UPME 的数据标签会滞后，本站只收录还没开投资人开标听证会的项目。投标前去项目页核对最新纪要和补遗。",
      },
    ],
    sources: [
      { label: "UPME 输电项目招商列表（Convocatorias de Transmisión）", href: "https://www.upme.gov.co/home/convocatorias/convocatorias-de-transmision/" },
      { label: "UPME 投资人遴选文件样本（UPME 01-2025 DSI）", href: "https://docs.upme.gov.co/PromocionSector/ConvocatoriasSTN/UPME_01_2025/DSI_UPME_01-2025.pdf" },
      { label: "CREG 能源和天然气监管委员会", href: "https://www.creg.gov.co/" },
    ],
  },
  {
    slug: "peru-petroperu",
    country: "秘鲁",
    countryCode: "PE",
    platform: "Petroperú · Competencia internacional",
    issuer: "秘鲁国家石油公司（Petroperú）",
    issuerType: "石油公司",
    title: "怎么参与秘鲁国家石油公司 Petroperú 的国际采购？",
    summary: "秘鲁国家石油公司按自己的规章做国际采购（PCI）。报价前必须先在 BDPC 供应商库登记。",
    whatIs: "Petroperú 是秘鲁国有石油公司，经营塔拉拉炼厂和北秘鲁输油管道。它按公司自己的采购规章采购，不走 SEACE。国内找不到合适供应商时，会在官网 Competencia internacional 发布国际采购；本站只收录编号以 PCI 开头的正式国际竞争性采购。",
    audience: "炼化设备、催化剂与化学品、管材阀门和油气工程服务的境外供应商",
    quickFacts: [
      { label: "发布位置", value: "官网 Competencia internacional" },
      { label: "报价前提", value: "BDPC 登记为 REGISTRADO" },
      { label: "截止日期", value: "看招标文件，可能被修改" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "只看 PCI：编号 PCI 的才是国际竞争性采购",
          "CAI 不是招标：同一栏目的 CAI 是采购完成后的公示，不能报价",
          "截止看 Bases：列表不写截止日，截止写在 Bases 里，并会随日程修改调整",
        ],
        note: "PCI 项目可能多次改日程，也可能授标后被宣告无效重来。看最新上传的文件判断它处在哪个阶段。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "BDPC 登记", detail: "报价、授标、签约都要先在合格供应商库 BDPC 登记，联合体每个成员都要；由 Achilles 审核，最快 2 个工作日。" },
          { title: "下载 Bases", detail: "在 Competencia internacional 找到项目，下载 Bases、技术条件、合同范本和提问格式。" },
          { title: "提问", detail: "用 Bases 规定的提问表在提问期内提问，关注答复和修改。" },
          { title: "提交报价", detail: "以最新日程为准，截止前按要求提交报价和保函。" },
          { title: "跟进授标", detail: "关注授标（Buena Pro）、流标或取消通知；授标也可能被宣告无效。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        items: [
          "BDPC 问卷：适用规章的完整版登记问卷",
          "类别业绩：每个登记类别至少一份合同，不超过 5 年",
          "企业文件：设立、存续、法定代表证明、授权",
          "财务：财务报表、经济能力证明",
          "投标文件：技术文件、保函、各类声明",
        ],
        note: "BDPC 登记按年营业额收费：10 万美元以下免费，10–15 万美元 354 索尔，15 万美元以上 1,534 索尔（含税，2023 年 9 月 3 日起）；证书最长有效一年。以 Petroperú 和 Achilles 现行说明为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "提前登记：BDPC 要在报价前完成，留出审核和补件时间",
          "国际惯例：适用秘鲁签署的国际条约和商事惯例，货物通常按 INCOTERMS 报价",
          "禁止签约情形：impedimentos 适用于所有采购，提前核对关联企业和合同纠纷",
          "保函：出具银行、币种、有效期，中资银行保函是否接受",
          "翻译认证：技术文件西语翻译、境外文件海牙认证",
        ],
        note: "现行采购规章 2021 年 6 月 28 日生效，最近一次修改是 2024 年 7 月 18 日。以官网现行版本和项目 Bases 为准。",
      },
    ],
    sources: [
      { label: "Petroperú 国际采购公告（Competencia internacional）", href: "https://www.petroperu.com.pe/proveedores/avisos-y-convocatorias/competencia-internacional/" },
      { label: "Petroperú 供应商信息与现行规章", href: "https://www.petroperu.com.pe/proveedores/informacion-general/" },
      { label: "Petroperú 合格供应商库（BDPC）登记", href: "https://www.petroperu.com.pe/proveedores/registro-proveedor-calificado/" },
    ],
  },
  {
    slug: "chile-codelco",
    country: "智利",
    countryCode: "CL",
    platform: "Codelco · Licitaciones en proceso",
    issuer: "智利国家铜业公司（Codelco），智利国有铜矿企业",
    issuerType: "矿业公司",
    title: "怎么参与智利国家铜业公司 Codelco 的采购项目？",
    summary: "智利国家铜业公司不在 Mercado Público 采购，多数按邀请在 SAP Ariba 进行。先在 Red Negocios 登记并认证类别。",
    whatIs: "Codelco 是智利国有铜业公司，旗下有多个矿山分部（División）。国企不适用政府采购法 Ley 19.886，所以不在 Mercado Público 发布。大部分采购在 SAP Ariba 上邀请已登记的供应商；官网 Licitaciones en proceso 只公开一部分，多是总部统一采购的化学品、电缆、泵、钢材和管材。",
    audience: "矿山设备、电气材料、化学品、管材与工程服务供应商",
    quickFacts: [
      { label: "登记平台", value: "Red Negocios（rednegocios.cl）" },
      { label: "招标平台", value: "SAP Ariba（按邀请）" },
      { label: "关键日期", value: "Fecha de entrega：意向截止日" },
    ],
    sections: [
      {
        id: "scope",
        title: "适用范围",
        items: [
          "两种来源：官网公开的招标，加上按类别发给已登记供应商的邀请",
          "Fecha de entrega 是意向截止：不是交标截止；之后招标文件只发给已登记的投标人",
          "全程在 Ariba：文件、提问、报价都在 SAP Ariba，收到邀请才能进入",
        ],
        note: "官网表格不删过期条目，有多年前的记录。先看 Fecha de entrega 过没过，再决定跟不跟。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "Red Negocios 登记", detail: "填联系人、企业和银行资料，选经营相关的类别和登记计划。" },
          { title: "验证类别经验", detail: "上传发票、订单、合同或履约评价证明经验，验证有效 3 年，可随时加类别。" },
          { title: "上传文件", detail: "按企业类型（含境外企业）上传文件，填写每年更新的合规宣誓书。" },
          { title: "分级与合规审查", detail: "授标的前提；文件验证后约 10 个工作日出结果，在 Red Negocios 看板查看。" },
          { title: "Ariba 报价", detail: "收到邀请（或在 Fecha de entrega 前申请邀请）后建 Ariba 账户，下载文件、提问、报价。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "以 Red Negocios 的 Documentos requeridos 为准。",
        items: [
          "企业与银行：企业资料、联系人、银行资料表",
          "类别经验：发票、订单或合同",
          "境外企业文件：设立与代表文件",
          "声明：员工人数声明、涉诉情况宣誓书",
          "NCh 2770 问卷：智利标准对齐问卷",
          "合规宣誓书：每年更新",
        ],
        note: "登记咨询：contacto@rednegocios.cl；SAP Ariba 使用问题：portalcompras@codelco.cl。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "境外文件清单：Red Negocios 有专门的境外企业清单，登记前先下载核对",
          "登记费用：计划类型和费用看 Red Negocios 现行报价",
          "业绩证明：用发票、订单或合同证明，最好有同类矿山客户",
          "长期合同：类别合同常覆盖多个分部、周期长，评估供货、仓储、售后和调价",
          "报价条件：币种、INCOTERMS、智利进口税费、本地技术标准",
        ],
        note: "官网公开的只是 Codelco 采购的一小部分。提前登记和认证类别，才会收到按类别发出的邀请。",
      },
    ],
    sources: [
      { label: "Codelco 公开招标列表（Licitaciones en proceso）", href: "https://www.codelco.com/licitaciones-en-proceso" },
      { label: "Codelco 供应商登记流程图（PDF）", href: "https://www.codelco.com/prontus_codelco/site/docs/20230628/20230628153213/procesoinscripcionproveedores_esp2__1_.pdf" },
      { label: "Codelco 采购流程与 SAP Ariba 说明", href: "https://www.codelco.com/proceso-de-contratacion-de-bienes-y-servicios" },
      { label: "Red Negocios 供应商登记", href: "https://www.rednegocios.cl/" },
    ],
  },
  {
    slug: "argentina-comprar",
    country: "阿根廷",
    countryCode: "AR",
    platform: "COMPR.AR",
    issuer: "阿根廷国家公共行政部门及所属采购单位",
    issuerType: "政府货物与服务采购平台",
    title: "怎么参与阿根廷 COMPR.AR 的货物与服务采购？",
    summary: "阿根廷国家机关的货物和服务采购平台。标书免登录下载，登记和递交按每个项目的要求办。",
    whatIs: "COMPR.AR 是阿根廷国家机关采购货物和服务的电子平台。项目、附件、专用条款和澄清（Circulares）都能公开查看；国内供应商一般在 SIPRO（国家供应商信息系统）登记。工程和特许经营走 CONTRAT.AR，铁路公司 ADIF 有自己的门户。",
    audience: "想向阿根廷国家机关供应货物、一般服务或咨询服务的境内外企业",
    quickFacts: [
      { label: "官方平台", value: "COMPR.AR" },
      { label: "供应商登记", value: "SIPRO（境外投标人有例外）" },
      { label: "常用语言", value: "西班牙语" },
    ],
    sections: [
      {
        id: "scope",
        title: "先确认入口",
        items: [
          "货物和服务：COMPR.AR 主要管国家机关的货物服务采购；工程和特许经营看 CONTRAT.AR",
          "公报只是摘要：Boletín Oficial 第三部分发摘要，完整文件和操作在指定平台",
          "免登录下载：Anexos、Cláusulas particulares、Circulares 栏的下载图标就是标书",
        ],
        note: "从中国大陆访问常超时。可切到阿根廷或其他南美节点的网络（VPN）再访问；这不影响项目资格或截止时间。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "检索锁定程序", detail: "按编号、采购单位、关键词查找，下载条款、规格、附件和全部 Circulares。" },
          { title: "确认登记路径", detail: "境内供应商登记 SIPRO；外国投标人有登记例外，怎么开账户、报价和签约看 pliego 和采购单位答复。" },
          { title: "整理文件", detail: "企业、授权、受益人、税务、业绩、技术方案、报价；认证和翻译按专用条款。" },
          { title: "担保和报价", detail: "核对投标维持、履约、预付款担保，截止前电子报价并保存回执。" },
          { title: "跟进澄清授标", detail: "Circulares 可能改规格和日程，提交后看开标、评审、授标和合同。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "不同程序要求不同，以下用来建立准备清单。",
        items: [
          "企业文件：设立、存续、章程、授权代表、最终受益人",
          "登记与声明：SIPRO 或境外投标人资格文件，无禁止投标、利益冲突声明",
          "业绩与技术：同类合同、客户证明、人员设备、实施计划",
          "报价：财务报表、报价表、币种、税费、交付、质保和售后",
          "担保：投标、履约、预付款担保及有效期",
          "认证翻译：海牙认证或领事认证、西语翻译和译文认证",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "别照搬 SIPRO：先向采购单位确认境外企业的账户、电子签署、送达地址和签约资料",
          "本地主体不是必须：当地代表、阿根廷公司或联合体，标书或法规要求时才办",
          "比索报价：ARS 计价要算调价公式、付款周期、进口成本、税费和资金汇出",
          "担保文本：境外银行能否开、要不要阿根廷银行确认、文本能否逐字符合标书",
          "最新 Circulares：截止前再下载一遍，页面摘要和早期附件不算数",
        ],
        note: "阿根廷的采购规则和平台会调整。以最新文件、采购单位书面答复和适用法规为准。",
      },
    ],
    sources: [
      { label: "COMPR.AR 官方平台", href: "https://comprar.gob.ar/" },
      { label: "阿根廷政府：SIPRO供应商登记服务", href: "https://www.argentina.gob.ar/servicio/inscripcion-en-el-sistema-de-proveedores-del-estado" },
      { label: "COMPR.AR：供应商登记常见问题", href: "https://www.argentina.gob.ar/comprar/soy-proveedor/compras-electronicas/preguntas-frecuentes/registro-de-proveedores" },
      { label: "Disposición 62/2016（更新文本）：SIPRO与外国投标人规则", href: "https://www.argentina.gob.ar/normativa/nacional/265967/actualizacion" },
      { label: "Disposición 63/2016（更新文本）：COMPR.AR统一一般条款", href: "https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-63-2016-265968/actualizacion" },
      { label: "阿根廷《公共翻译员法》Ley 20.305", href: "https://www.argentina.gob.ar/normativa/nacional/ley-20305-194196/texto" },
      { label: "Boletín Oficial 第三部分", href: "https://www.boletinoficial.gob.ar/seccion/tercera" },
    ],
  },
  {
    slug: "argentina-contratar",
    country: "阿根廷",
    countryCode: "AR",
    platform: "CONTRAT.AR",
    issuer: "阿根廷国家公共工程、特许经营与私有化主管机关",
    issuerType: "公共工程与特许经营平台",
    title: "怎么参与阿根廷 CONTRAT.AR 的工程与特许经营项目？",
    summary: "阿根廷公共工程和特许经营的平台。门槛高，可以直接投，也可以进中标方的供应链。",
    whatIs: "CONTRAT.AR 是阿根廷国家层面的公共工程、基础设施特许经营和部分私有化程序的电子入口。项目可能是国内或国际招标，也可能有资格预审或多信封评审；AMBA I 输电、国家公路等大型特许经营，资格和递交方式都看各自文件。",
    audience: "想参与阿根廷公共工程、特许经营、投资人遴选及相关设备工程合同的企业",
    quickFacts: [
      { label: "官方平台", value: "CONTRAT.AR" },
      { label: "项目类型", value: "工程、特许经营、私有化" },
      { label: "提交方式", value: "看每个 pliego 和平台日程" },
    ],
    sections: [
      {
        id: "scope",
        title: "先判断参与哪一层",
        items: [
          "直接投或进供应链：直接投标人要过法律、财务、技术和担保门槛；设备商和专项承包商也可进联合体或中标人供应链",
          "免登录下载：Anexos、Cláusulas particulares、Circulares 栏的下载图标就是标书",
          "以平台文件为准：公报可能只刊摘要，条件看 CONTRAT.AR 最新文件",
        ],
        note: "从中国大陆访问常超时。可切到阿根廷或其他南美节点的网络（VPN），提前下载文件，别拖到截止前。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "下载全套文件", detail: "一般条款、专用条款、技术附件、合同草案和全部 Circulares，记下踏勘、提问、开标节点。" },
          { title: "外部用户登记", detail: "按工程、特许经营、私有化模块分别登记。例如国际特许经营：没有阿根廷分支的外国公司交 CDI，或其阿根廷代表的 CUIT 和授权书。" },
          { title: "设计参与结构", detail: "能否独立投标，要不要本地代表、联合体或项目公司，业绩和连带责任怎么算。" },
          { title: "多包文件和担保", detail: "法律、技术、经济常分开评审；按原文核对各阶段担保和可接受的银行。" },
          { title: "提交并跟进", detail: "按日期和时区提交，跟踪 Circulares、资格评审、经济开标和授标。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "大型工程要求更高，以项目文件为准。",
        items: [
          "企业与合规：设立、存续、授权、受益人、合规声明",
          "认证翻译：海牙认证或领事认证、西语翻译和译文认证",
          "大项目业绩：同等规模业绩、完工或运营证明、关键人员和设备",
          "财务与融资：审计报表、净资产、融资承诺和项目融资安排",
          "担保保险：投标、履约、建设、运营担保和保险",
          "结构安排：本地代表、联合体协议、项目公司、税务（如标书要求）",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "国际≠能独立投：逐条核对国籍、业绩归属、当地代表和项目公司条件",
          "资格和履约分开：总包门槛高时，可做设备、输电、机电、信号或运维分包",
          "比索风险：ARS 计价、调价、付款来源、税费、资本管制和汇率",
          "长期风险：征地、许可、环评、既有设施接口和不可抗力",
          "疑问正式提：在提问期提出，以 Circulares 答复为准",
        ],
        note: "大型项目通常有专用规则。本文不替代法律、税务、融资或工程尽调。",
      },
    ],
    sources: [
      { label: "CONTRAT.AR 官方平台", href: "https://contratar.gob.ar/" },
      { label: "CONTRAT.AR 用户预登记", href: "https://contratar.gob.ar/Inscripcion.aspx" },
      { label: "Disposición 84/2024：特许经营外部用户登记与验证", href: "https://www.argentina.gob.ar/normativa/nacional/406334/actualizacion" },
      { label: "Disposición 29/2025：私有化模块外部用户登记", href: "https://www.argentina.gob.ar/normativa/nacional/416239/texto" },
      { label: "Resolución 202/2026：AMBA I输电特许经营招标", href: "https://www.argentina.gob.ar/normativa/nacional/norma-428810" },
      { label: "阿根廷政府：AMBA I与输电扩建计划", href: "https://www.argentina.gob.ar/node/510027" },
      { label: "Boletín Oficial 第三部分", href: "https://www.boletinoficial.gob.ar/seccion/tercera" },
    ],
  },
  {
    slug: "argentina-adif",
    country: "阿根廷",
    countryCode: "AR",
    platform: "Trenes Argentinos Infraestructura · Portal de Licitaciones",
    issuer: "阿根廷铁路基础设施公司（ADIF / Trenes Argentinos Infraestructura）",
    issuerType: "国家铁路基础设施公司",
    title: "怎么参与阿根廷 ADIF 的铁路基础设施采购？",
    summary: "阿根廷铁路基础设施公司的招标门户。看清登记、铁路业绩、担保和现场要求，再决定直接投还是进承包链。",
    whatIs: "ADIF（品牌名 Trenes Argentinos Infraestructura）是阿根廷国家铁路基础设施公司。它的招标门户发布线路更新、车站、信号通信、电气化、变电站等项目，文件、Circulares 和开标信息都在各项目页面。",
    audience: "铁路工程、轨道材料、信号通信、电气化、车辆设施与专业服务供应商",
    quickFacts: [
      { label: "采购门户", value: "ADIF Portal de Licitaciones" },
      { label: "采购方", value: "国家铁路基础设施公司" },
      { label: "关键文件", value: "PCG、PCP、PET、Anexos、Circulares" },
    ],
    sections: [
      {
        id: "scope",
        title: "项目页先看什么",
        items: [
          "关键日期：状态、编号、文件获取方式、提问、踏勘、递交和开标",
          "全套文件：PCG（一般条款）、PCP（专用条款）、PET（技术规格）、图纸、清单和 Circulares",
          "独立门户：ADIF 与 COMPR.AR、CONTRAT.AR 分开，报价不在通用平台",
        ],
        note: "能下载不等于有资格。铁路许可、施工组织、既有线安全和业绩要求，以 PCP 和 PET 为准。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "筛选机会", detail: "看公开和进行中的项目，核对截止和准备时间，下载全部文件。" },
          { title: "确认登记要求", detail: "要不要注册、购买 pliego、指定联系邮箱；境外企业路径看 PCP。" },
          { title: "踏勘和提问", detail: "现场踏勘常是强制或计分项；按渠道提问，Circulares 计入报价。" },
          { title: "技术价格担保", detail: "铁路业绩、人员、施工窗口、安全方案；按 PCG/PCP 准备担保。" },
          { title: "提交跟踪开标", detail: "纸质、电子或混合提交；关注开标和授标，中标后按时补交合同资料。" },
        ],
      },
      {
        id: "documents",
        title: "常用资料",
        intro: "ADIF 各程序差异大，可以先整理这些。",
        items: [
          "企业与合规：设立、存续、授权代表、税务、合规声明",
          "认证翻译与代表：境外文件认证、西语翻译、当地送达或代表（如要求）",
          "铁路业绩：同类复杂工程业绩、验收证明、关键人员履历",
          "技术资料：轨道、信号、供电或车辆设施资料和标准证明",
          "施工方案：施工计划、运营线接口、安全环保、质量和风险管理",
          "担保：投标、履约、预付款担保，形式和文本看 PCP",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "中国业绩算不算：证明由谁签发，要不要业主联系人或阿根廷本地经验",
          "本地要求看项目：联合体、当地注册或专业签字，只在 PCP 要求时办",
          "铁路技术：标准、认证、备件年限、接口责任、运营线施工窗口",
          "比索风险：ARS 报价、调价公式、税费、付款周期、担保成本、汇率",
          "看最新文件：Circulares 可能改工程量、图纸和日程",
        ],
        note: "正式条件以当次 PCG、PCP、PET、Circulares 和合同草案的最新版本为准。",
      },
    ],
    sources: [
      { label: "ADIF / Trenes Argentinos Infraestructura 招标门户", href: "https://plataforma.adifsa.com.ar/portal_licitaciones" },
      { label: "ADIF一般招标条件样本（PCG）", href: "https://plataforma.adifsa.com.ar/uploads/archivo_adjunto/licitacion/20250312_084256-67d173407c13e.pdf?v=2.1.111" },
      { label: "ADIF专用条件样本（含境外投标文件要求）", href: "https://plataforma.adifsa.com.ar/uploads/archivo_adjunto/licitacion/20250515_111744-6825f788137a0.pdf?v=2.1.111" },
      { label: "Trenes Argentinos Infraestructura 官方机构页", href: "https://www.argentina.gob.ar/transporte/trenes-argentinos-infraestructura" },
    ],
  },
  {
    slug: "argentina-boletin-oficial",
    country: "阿根廷",
    countryCode: "AR",
    platform: "Boletín Oficial · Tercera Sección",
    issuer: "阿根廷国家官方公报及在第三部分刊登采购通知的机构",
    issuerType: "官方采购公告与检索入口",
    title: "怎么通过阿根廷 Boletín Oficial 查找并参与采购？",
    summary: "阿根廷官方公报第三部分刊登采购公告。用它发现项目，再去公告指定的平台投标。",
    whatIs: "阿根廷官方公报（Boletín Oficial）第三部分集中刊登采购公告，包括供应、服务、工程、租赁、特许经营和授标。它是公告和检索入口，不是投标平台；每条公告会写明去哪里拿标书、怎么提问和递交。",
    audience: "想覆盖 COMPR.AR、CONTRAT.AR 和 ADIF 以外公告的企业",
    quickFacts: [
      { label: "官方栏目", value: "Tercera Sección · Contrataciones" },
      { label: "主要用途", value: "发现公告、找到正式入口" },
      { label: "提交方式", value: "按每条公告和标书办理" },
    ],
    sections: [
      {
        id: "scope",
        title: "先弄清公报能做什么",
        items: [
          "检索公告：按日期浏览，或用 Búsqueda avanzada 按采购单位、编号、关键词搜",
          "只是摘要：资格、技术、担保和合同条件，要去公告指定的平台核对",
          "会连续刊登：延期、澄清、预授标、授标可能分开发布，别只存第一次的页面",
        ],
        note: "公报不替代 COMPR.AR、CONTRAT.AR、ADIF 或采购单位的标书页面，也不能在公报上投标。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "识别采购主体", detail: "记下采购单位、编号、日期；公告引用了哪个平台，就立刻转过去。" },
          { title: "下载完整标书", detail: "按 Lugar de consulta de los pliegos 下载条款、附件、图纸和澄清。" },
          { title: "确认登记路径", detail: "供应商登记、外国企业资格、代表或联合体、认证翻译，各单位不同，以标书为准。" },
          { title: "核对担保截止", detail: "保证金、递交地址和开标时间，与最新标书和更正交叉核对。" },
          { title: "追踪后续刊登", detail: "用编号复查第三部分，同时看采购方网站。" },
        ],
      },
      {
        id: "documents",
        title: "项目核验清单",
        intro: "防止只凭公告摘要做判断。",
        items: [
          "完整标书：标书、技术附件、合同草案、全部澄清和更正",
          "采购主体：适用制度、官方项目页、正式咨询渠道",
          "参与资格：外国企业资格、供应商登记、授权代表、联合体、送达",
          "证明文件：认证、西语翻译、业绩和财务证明",
          "钱的条款：担保、币种、税费、付款条件、调价机制",
          "递交安排：地点或电子入口、截止时区、开标和评审",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "看得到≠能投：先确认程序是否开放、走哪条登记路径",
          "提前测试入口：公告可能指向采购方自己的页面，下载和递交方式不同",
          "纸质递交要留时间：纸质递交、踏勘或当地送达，要预留授权、认证、翻译和物流时间",
          "比索风险：ARS 项目看调价、付款期限、税费和汇率",
          "以官方原文为准：第三方转载不算数",
        ],
        note: "第三部分的价值是帮你发现分散的入口，各机构的资格和流程并不统一。",
      },
    ],
    sources: [
      { label: "Boletín Oficial 第三部分：Contrataciones", href: "https://www.boletinoficial.gob.ar/seccion/tercera" },
      { label: "Boletín Oficial 高级搜索", href: "https://www.boletinoficial.gob.ar/busquedaAvanzada/tercera" },
      { label: "阿根廷政府：国家采购制度程序手册（Disposición 62/2016，更新文本）", href: "https://www.argentina.gob.ar/normativa/nacional/265967/actualizacion" },
    ],
  },
  {
    slug: "dominican-republic-dgcp",
    country: "多米尼加",
    countryCode: "DO",
    platform: "Portal Transaccional（DGCP）",
    issuer: "多米尼加中央政府、分权与自治机构、地方政府及其他公共采购单位",
    issuerType: "政府采购平台",
    title: "怎么参与多米尼加 DGCP 政府采购项目？",
    summary: "多米尼加政府采购交易平台。外国企业投标时可获临时登记，技术和经济分信封递交。",
    whatIs: "Portal Transaccional 是多米尼加政府采购总局（DGCP）管理的电子采购平台，覆盖中央、地方政府和其他公共机构。公众可查采购计划、项目、问答、开标和授标；供应商通过国家供应商登记册（RPE）和平台账户参与。",
    audience: "想向多米尼加公共机构供应货物、服务、工程或咨询的境内外企业",
    quickFacts: [
      { label: "官方平台", value: "Portal Transaccional（DGCP）" },
      { label: "供应商登记", value: "RPE；外国企业可获临时登记" },
      { label: "常用语言", value: "西班牙语" },
    ],
    sections: [
      {
        id: "scope",
        title: "先确认适用法律",
        items: [
          "新法：第 47-25 号《公共采购法》2026 年 1 月 28 日生效，实施条例为第 52-26 号法令",
          "旧项目用旧法：新法生效前启动的程序和合同，继续适用第 340-06 号旧法",
          "公开招标门槛：2026 年 4 月起，货物服务 RD$6,436,757.51、工程 RD$406,713,345.70 以上要公开招标；其他区间看 PNP-03-2026 号决议",
        ],
        note: "别只看程序名称。先看发布日期、适用法律、采购方式和最新 pliego de condiciones（招标文件）。",
      },
      {
        id: "first-check",
        title: "注册前先看这些字段",
        items: [
          "Referencia del procedimiento：程序编号，用来找问答、更正和授标",
          "Unidad de compras：采购单位和正式咨询渠道",
          "Modalidad：公开招标、简化采购、电子反向拍卖等",
          "Cronograma：提问、截止、技术开标、经济开标、授标日期",
          "Documentos del procedimiento：规格、条件、表格、合同草案和 enmiendas（更正）",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "检索下载文件", detail: "下载招标文件、规格、表格和合同草案，看是否开放境外企业、币种和税费。" },
          { title: "确认登记路径", detail: "本国企业登记 RPE；外国企业无需预先正式登记，系统分配临时登记用于电子报价。" },
          { title: "准备资格和技术", detail: "公司文件、授权、税务、受益人、业绩、财务、技术方案；非西语文件要合格翻译。" },
          { title: "分信封递交", detail: "技术材料放 Sobre A（技术信封），报价和投标担保放 Sobre B（经济信封），放错会影响评审。" },
          { title: "跟进评审合同", detail: "保存回执，关注技术评审、经济开标、纠正期、授标、复议和合同。" },
        ],
      },
      {
        id: "documents",
        title: "境外企业常用资料",
        intro: "临时登记不免除资格审查。以招标文件为准。",
        items: [
          "公司文件：注册、章程、存续、经营范围的本国证明",
          "授权与声明：法定代表人、授权委托、受益人、无利益冲突声明",
          "税务财务：税号、财务报表、银行资信、偿付能力",
          "业绩与技术：类似合同、验收证明、人员设备、实施方案",
          "翻译认证：非西语文件的合格翻译，公证、Apostille 或领事认证",
          "签约收款：银行账户、税务和本地代表资料（如适用）",
        ],
        note: "当地代表、联合体或本地公司不是统一前提，只有法律、行业许可或项目文件要求时才办。",
      },
      {
        id: "guarantees",
        title: "担保、开标与异议",
        items: [
          "担保形式：银行担保、银行保证金或保险公司保函，按法律和招标文件",
          "投标担保期限：从技术开标覆盖到签约；材料或币种错误的纠正期通常 1–5 个工作日",
          "履约担保：合同超过等值 1 万美元的，中标后通常 5 个工作日内提交",
          "先技术后经济：通过技术评审的报价才进入经济开标；电子反向拍卖另有程序",
          "异议途径：先提 recurso de reconsideración（复议），再向 DGCP 提 recurso jerárquico impropio；期限按最新通知",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "是否真开放：程序是否允许境外企业，中国业绩和联合体业绩怎么算",
          "本地要求：送达地址、授权代表、行业执照、税务登记或中标后设本地公司",
          "比索报价：DOP 计价要算汇率、税费、关税、付款周期和调价",
          "担保文本：境外银行担保是否接受、要不要本地银行确认、文本能否逐字符合",
          "别只看摘要：问答、enmiendas 和 cronograma 可能改资格、文件和截止",
        ],
        note: "投标前以最新招标文件、采购单位书面答复、DGCP 现行规则和专业法律税务意见为准。",
      },
    ],
    sources: [
      { label: "DGCP：Portal Transaccional政府采购交易平台", href: "https://comunidad.comprasdominicana.gob.do/" },
      { label: "DGCP：第47-25号《公共采购法》与第52-26号实施条例", href: "https://www.dgcp.gob.do/transparencia/documentos/base_legal_institucional/Ley%2047-25%20y%20reglamento%2052-26.pdf" },
      { label: "DGCP：新法实施初期规则与旧程序过渡安排", href: "https://www.dgcp.gob.do/noticias/dgcp-establece-pautas-para-el-inicio-de-la-implementacion-de-la-nueva-ley-num-47-25-de-contrataciones-publicas/" },
      { label: "DGCP：2026年采购门槛（PNP-03-2026）", href: "https://www.dgcp.gob.do/wp-content/uploads/page/PNP-03-2026_UMBRALES.pdf" },
      { label: "DGCP：国家供应商登记册（RPE）及外国企业说明", href: "https://www.dgcp.gob.do/servicios/registro-de-proveedores/" },
      { label: "DGCP：供应商使用电子采购平台手册", href: "https://www.dgcp.gob.do/wp-content/uploads/page/Manual-PT_Proveedores-del-Estado.pdf" },
      { label: "DGCP：供应商培训、指南与操作材料", href: "https://www.dgcp.gob.do/materiales-didacticos/proveedores/" },
    ],
  },
];

/**
 * The four guides the homepage strip shows, in this order (updated 2026-09-21:
 * one guide each for Mexico, Brazil, Colombia and Peru).
 *
 * A teaser, not an index — /guides carries all of them. Keeping one guide per
 * country gives the homepage a balanced four-market overview and prevents the
 * row from wrapping unpredictably as the full guide library grows.
 *
 * Peru is represented by SEACE rather than Obras por Impuestos because SEACE
 * is where nearly every Peruvian tender on this site comes from; OxI is a
 * separate financing mechanism most readers meet later.
 */
const HOMEPAGE_GUIDE_SLUGS = ["mexico-compras-mx", "brazil-pncp", "colombia-secop-ii", "peru-seace-oece"] as const;

/** Resolved in HOMEPAGE_GUIDE_SLUGS order, skipping any slug that no longer exists rather than rendering a hole. */
export function homepageGuides(): ParticipationGuide[] {
  return HOMEPAGE_GUIDE_SLUGS.map((slug) => participationGuides.find((guide) => guide.slug === slug)).filter(
    (guide): guide is ParticipationGuide => guide !== undefined,
  );
}

export function getParticipationGuide(slug: string) {
  return participationGuides.find((guide) => guide.slug === slug);
}

export const guideCountries = [
  {
    name: "墨西哥",
    code: "MX",
    description: "联邦采购、电力、油气与战略基础设施",
  },
  {
    name: "巴西",
    code: "BR",
    description: "PNCP 全国采购，Petrobras 与 Cemig 自有门户",
  },
  {
    name: "哥伦比亚",
    code: "CO",
    description: "SECOP II 公共采购，UPME 输电项目招商",
  },
  {
    name: "秘鲁",
    code: "PE",
    description: "SEACE 公共采购、以工程抵税与 Petroperú",
  },
  {
    name: "智利",
    code: "CL",
    description: "Mercado Público 公共采购与 Codelco 招标",
  },
  {
    name: "阿根廷",
    code: "AR",
    description: "COMPR.AR、CONTRAT.AR、ADIF 与 Boletín Oficial",
  },
  {
    name: "多米尼加",
    code: "DO",
    description: "DGCP 交易平台，中央与地方政府采购",
  },
] as const;

/**
 * The guide for the platform a tender is actually bid on, for the 官方正式投标
 * 入口 panel on its detail page — a reader who has just found a Cemig or
 * Codelco tender is exactly the one who needs to know how that buyer
 * registers suppliers.
 *
 * Matched on buyer + source name, the same way lib/tender-search-guide.ts
 * does: the source names are the ones the mappers write, and nothing on a
 * public projection needs to carry them. Order matters where names overlap —
 * the company portals come before the government platforms, and a CFE
 * tender read from the DOF goes to the CFE guide, not the DOF's.
 */
const GUIDE_BY_ORIGIN: Array<[RegExp, string]> = [
  [/\bdgcp\b|portal transaccional|rep[uú]blica dominicana/i, "dominican-republic-dgcp"],
  [/trenes argentinos infraestructura|administraci[oó]n de infraestructuras ferroviarias|\badif\b/i, "argentina-adif"],
  [/contrat\.?ar|obra p[uú]blica, concesiones y privatizaciones/i, "argentina-contratar"],
  [/compr\.?ar|portal de compras p[uú]blicas \(argentina\)/i, "argentina-comprar"],
  [/bolet[ií]n oficial de la rep[uú]blica argentina|tercera secci[oó]n/i, "argentina-boletin-oficial"],
  [/obras por impuestos/i, "peru-obras-por-impuestos"],
  [/petronect|petrobras|transpetro/i, "brazil-petrobras-petronect"],
  [/\bcemig\b/i, "brazil-cemig"],
  [/\bupme\b/i, "colombia-upme"],
  [/petroper[uú]/i, "peru-petroperu"],
  [/codelco/i, "chile-codelco"],
  [/pemex|petr[oó]leos mexicanos/i, "mexico-pemex-siscep"],
  [/comisi[oó]n federal de electricidad|\bcfe\b/i, "mexico-cfe-micrositio"],
  [/proyectos estrat[eé]gicos/i, "mexico-proyectos-estrategicos"],
  [/compras\s?mx|compranet/i, "mexico-compras-mx"],
  [/\boece\b|\bseace\b/i, "peru-seace-oece"],
  [/\bpncp\b/i, "brazil-pncp"],
  [/secop/i, "colombia-secop-ii"],
  [/mercado p[uú]blico|chilecompra/i, "chile-mercado-publico"],
];

/** What the detail page's 官方入口 panel needs to link a guide — not the guide's text, which would otherwise ride along into the client bundle. */
export type ParticipationGuideLink = Pick<ParticipationGuide, "slug" | "platform" | "issuerType">;

export function participationGuideLinkForTender(tender: { buyer?: string | null; sourceName?: string | null }): ParticipationGuideLink | undefined {
  const guide = participationGuideForTender(tender);
  return guide && { slug: guide.slug, platform: guide.platform, issuerType: guide.issuerType };
}

export function participationGuideForTender(tender: { buyer?: string | null; sourceName?: string | null }): ParticipationGuide | undefined {
  // Source name first: a PNCP row whose buyer happens to mention "Petrobras"
  // in its name is still a PNCP tender.
  for (const text of [tender.sourceName ?? "", tender.buyer ?? ""]) {
    for (const [pattern, slug] of GUIDE_BY_ORIGIN) {
      if (pattern.test(text)) return getParticipationGuide(slug);
    }
  }
  return undefined;
}
