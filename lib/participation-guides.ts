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

export const participationGuides: ParticipationGuide[] = [
  {
    slug: "mexico-compras-mx",
    country: "墨西哥",
    countryCode: "MX",
    platform: "Compras MX",
    issuer: "墨西哥联邦政府各部门与机构",
    issuerType: "政府采购平台",
    title: "怎么参与 Compras MX 的政府采购项目？",
    summary: "先确认采购单位、项目状态和参与范围，再决定是否注册并准备墨西哥联邦政府采购项目。",
    whatIs: "Compras MX 是墨西哥联邦公共行政体系使用的政府采购数字平台，由原 CompraNet 系统转型而来。联邦政府机构通过该平台发布和管理货物、服务、租赁及公共工程等采购程序，供应商和公众可以查询公告与文件。CFE、Pemex，以及部分州、市和其他公共机构可能使用自己的采购入口，不能默认所有墨西哥政府项目都集中在这里。",
    audience: "希望参与墨西哥联邦政府采购的境内外自然人或企业",
    quickFacts: [
      { label: "官方平台", value: "Compras MX" },
      { label: "常用语言", value: "西班牙语" },
      { label: "参与方式", value: "依项目公告与程序类型而定" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "主要用于核对墨西哥联邦公共行政体系在 Compras MX 发布的采购程序",
          "不替代 CFE Micrositio、Pemex SISCeP、Proyectos Estratégicos MX 或州、市采购平台的核查",
          "公开查询通常不需要先注册；需要加入程序或提交响应时，再按项目要求办理企业账户",
        ],
        note: "先确认采购方和官方入口，再决定是否注册。平台注册成功不代表已经符合具体项目的投标资格。",
      },
      {
        id: "first-check",
        title: "注册前先看这些字段",
        items: [
          "Siglas dependencia o entidad：确认采购单位，不要只看项目标题",
          "Carácter：区分国内、国际条约覆盖或开放国际等参与范围",
          "Estatus：确认项目仍在进行，并留意终止、取消或已结束状态",
          "Tipo de publicación：确认当前页面属于公告、修改、通知或其他发布信息",
          "Fecha de presentación y apertura de proposiciones：核对文件递交及开标时间，并继续检查后续更正",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "搜索并确认项目", detail: "在公开查询入口按采购单位、关键词、程序编号和日期查找项目，先确认采购方、程序类型、参与范围、状态和截止时间。" },
          { title: "阅读完整公告", detail: "下载 convocatoria、bases、anexos 和后续澄清文件，核对企业国籍、货物原产地、时间表、技术规格、担保和提交方式。" },
          { title: "确认值得参与后再注册", detail: "按企业实际情况选择本国或境外注册路径。境外企业通常需要填写原属国税务识别码，并按要求提交经过认证及西班牙语翻译的企业文件。" },
          { title: "准备并提交响应", detail: "按照具体程序指定的格式、签署方式和渠道提交法律、技术及经济文件；不要只依据搜索结果页的摘要准备标书。" },
          { title: "持续跟进更正与结果", detail: "在截止前检查答疑、澄清、延期和更正；提交后继续查看开标、评审、授标和合同通知。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下是企业通常应提前整理的资料框架，不代表每个项目都会要求全部文件：",
        items: [
          "企业基本资料、法定名称、国籍、注册地址与联系人资料",
          "公司设立文件、章程及变更文件、法定代表人或授权委托文件",
          "税务登记、合规声明，以及项目要求的无禁止投标或利益冲突声明",
          "同类项目经验、合同或履约证明，以及技术人员、设备和实施方案",
          "财务报表、经济与财务能力证明，以及报价文件",
          "公告明确要求的电子签名、担保、认证、翻译或文件合法化材料",
        ],
        note: "RUPC（供应商与承包商统一登记册）并非所有企业在首次投标前都必须先完成。官方流程显示，企业通常先注册 Compras MX、与公共机构正式签约，再向采购单位申请加入 RUPC。具体项目另有要求时，以招标文件为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "国内采购通常限定墨西哥主体；国内货物采购现行规则通常要求墨西哥生产并达到至少 65% 的本地含量，例外及证明方式以项目文件和适用规则为准",
          "国际条约覆盖程序只对公告所适用条约的国家和来源开放；中国大陆不在目前列明的政府采购条约伙伴中，不能仅凭“国际”二字判断可以直接参与",
          "开放国际程序可能允许其他外国企业参与，但仍需核对企业国籍、货物原产地和项目文件中的限制",
          "是否需要墨西哥税号、本地代表、送达地址、联合体或当地合作伙伴",
          "中国出具的公司文件是否需要公证、附加证明书（Apostille）或领事认证及西班牙语宣誓翻译",
          "报价币种、税费、进口责任、履约担保及付款条件是否可接受",
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
    summary: "面向墨西哥联邦电力委员会采购与工程项目，梳理供应商注册、电子签名和逐项参与流程。",
    whatIs: "CFE Micrositio de Concursos 是墨西哥联邦电力委员会（CFE）的电子采购和竞赛平台。CFE 通过该平台发布货物、租赁、服务及工程类采购程序，供应商可注册账户、寻找项目、参加答疑并依招标文件提交技术和经济方案。",
    audience: "电力、能源、工程建设、设备与专业服务供应商",
    quickFacts: [
      { label: "采购单位", value: "CFE（墨西哥联邦电力委员会）" },
      { label: "官方系统", value: "Micrositio de Concursos" },
      { label: "关键准备", value: "与 SAT 校验的企业 e.firma" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 CFE 通过 Micrositio de Concursos 开展的货物、租赁、服务及工程采购程序",
          "不代表所有墨西哥电力或能源项目都在该平台进行，仍应先确认采购单位和公告来源",
          "注册路径区分墨西哥境内或境外、自然人或法人，以及一般供应商或工程承包商",
        ],
        note: "先确认项目仍在进行、允许相应主体参与且准备时间可行，再处理账户和电子签名。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先核对具体项目", detail: "确认采购方确为 CFE，阅读项目日历和 Pliego de Requisitos，核对参与范围、提问窗口、提交截止及电子递交要求。" },
          { title: "确认供应商类别", detail: "注册时选择境内或境外、自然人或法人，并确认属于货物／租赁／服务供应商，还是工程承包商。" },
          { title: "创建供应商账户", detail: "在 CFE Micrositio 的新供应商入口录入企业、联系人和税务等资料，并按系统提示完成账户配置。" },
          { title: "配置电子签名（e.firma）", detail: "注册页面要求上传证书（.cer）与私钥（.key）文件并输入密码，系统会与墨西哥税务局（SAT）校验；法人须使用企业本身的 e.firma，而不是个人的。这实际上意味着注册前需要先有墨西哥税号（RFC）。没有 RFC 的境外企业应先向 CFE 服务台确认当前是否存在适用于境外主体的替代安排，不要假设一定有。" },
          { title: "查找并加入具体程序", detail: "检索采购程序，阅读公告和日历，按系统指引表达参与意向或加入程序，并关注提问与答疑窗口。" },
          { title: "提交方案并跟进", detail: "依 Pliego de Requisitos 与附件分别准备法律／行政、技术和经济方案，在指定时间内完成电子提交并保存回执。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        items: [
          "企业注册、法定代表人、授权委托及联系人资料",
          "税务和银行信息，以及公告要求的诚信、利益冲突与合规声明",
          "企业 e.firma 的证书（.cer）、私钥（.key）和密码；注册资料默认有效期一年，到期需更新续期",
          "与标的匹配的技术规格响应、人员履历、设备清单与实施计划",
          "相关合同经验、客户证明、质量或行业认证",
          "经济报价、成本构成、担保和公告要求的其他附件",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "注册页面中的境外法人路径是否与当前企业情况相符",
          "项目是否允许国际参与；没有墨西哥 RFC 时，e.firma 这一关是否存在当前可用的替代方案",
          "技术标准、墨西哥本地含量、现场能力、保修和备件要求",
          "所有关键日期，包括说明会、现场踏勘、问题提交、开标与提交截止时间",
        ],
        note: "CFE 官方教程提供检索、加入程序、提问、联合参与和通知等操作说明。是否允许联合参与及各方责任，仍由每个项目的 Pliego de Requisitos、anexos 与后续澄清决定。",
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
    summary: "先核对 Pemex 采购事件，再了解 HIIP 2.0 登记、SISCeP 联系人开通和逐项响应流程。",
    whatIs: "SISCeP 是 Pemex 用于电子采购活动和供应商互动的系统。企业通常需要先在 HIIP 2.0 完成供应商资料登记，再通过获授权的企业联系人进入系统，对具体采购事件表达参与意向、接收通知并提交相应资料。",
    audience: "油气、石化、工程、设备、运维与专业服务供应商",
    quickFacts: [
      { label: "采购单位", value: "Pemex" },
      { label: "参与系统", value: "SISCeP" },
      { label: "前置动作", value: "完成 HIIP 2.0 供应商登记" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 Pemex 及其相关主体通过电子采购活动开展的供应商参与流程",
          "不替代 Compras MX、CFE 或其他墨西哥公共机构的采购入口",
          "企业需要对每一个采购程序单独表达参与意向，完成供应商登记不等于自动加入所有事件",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先核对采购程序", detail: "确认项目仍在进行、参与意向提交期限尚未截止，并阅读该程序的 bases、附件和联系要求。" },
          { title: "完成供应商登记", detail: "参与 Pemex 电子采购事件前，应在 HIIP 2.0 完成供应商登记，取得六位供应商编号及相应登记证明。公开竞赛通常要求登记保持有效。" },
          { title: "开通 SISCeP 联系人", detail: "使用有效的 HIIP 登记、六位供应商编号，以及 HIIP 中登记的法定代表人邮箱，为企业建立或启用可进入 SISCeP 的公司联系人。" },
          { title: "表达参与意向", detail: "按公告指定方式提交 manifestación de interés（参与意向）。现行流程通常要求发送至 SISCeP 为该程序生成的指定邮箱，并同步公告列明的联系人。" },
          { title: "进入事件并提交响应", detail: "Pemex 通常向指定联系人邮箱发送加入采购事件的链接。企业进入 SISCeP 后，按 bases、附件、答疑与更正提交方案并跟进结果。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "Pemex 登记分层次收集企业资料，具体项目还会提出额外条件：",
        items: [
          "企业身份、设立与法定代表／授权人资料",
          "税务、联系和商业信息，以及六位供应商编号",
          "法律与合规声明、受益所有人或诚信信息（如项目要求）",
          "财务信息、技术能力、人员与设施资料",
          "相关行业经验、合同记录、安全、质量及行业认证",
          "具体事件要求的技术和经济方案、担保及签署文件",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "是否可作为境外供应商直接登记，或需墨西哥本地税务、代表与合同安排",
          "项目是否有本地含量、能源行业、安全、环境或现场准入要求",
          "境外文件的西班牙语翻译、公证、附加证明书或其他认证要求",
          "及时维护 HIIP 2.0 中的企业、联系人、税务、合规和证明资料，确保信息持续有效",
        ],
        note: "Pemex 供应商登记属于免费自助流程。不要向个人或第三方支付注册、维护或更新费用，也不要通过非官方渠道发送敏感资料。",
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
    summary: "从参与条件、供应商注册到文件递交，了解境外企业参与巴西政府采购需要完成的关键步骤。",
    whatIs: "Portal Nacional de Contratações Públicas（PNCP）是巴西《第14.133/2021号法律》第174条设立的全国政府采购官方门户，用于集中、强制公开新采购法要求披露的采购计划、公告、合同及相关文件。PNCP首先是全国信息公开与检索入口，并不意味着所有项目都在PNCP页面直接提交投标；实际递交可能发生在Compras.gov.br、州或市系统、采购机构自有平台或公告指定的其他电子系统。",
    audience: "准备参与巴西联邦、州、市及其他公共机构采购项目的境内外企业",
    quickFacts: [
      { label: "官方入口", value: "PNCP（全国集中发布与检索）" },
      { label: "常用语言", value: "葡萄牙语" },
      { label: "实际投标", value: "以公告指定的电子系统为准" },
    ],
    sections: [
      {
        id: "scope",
        title: "参与前先确认三个入口",
        items: [
          "PNCP是公告和文件入口：先取得完整edital、附件、澄清与更正，确认采购机关、资格条件和截止时间",
          "电子投标系统是实际操作入口：可能是Compras.gov.br，也可能是州、市、采购机构或第三方平台",
          "SICAF是联邦采购常用的供应商登记系统：外国企业应按境外供应商路径准备企业和负责人资料",
          "如果项目属于特许经营、PPP或国有企业采购，还要遵循相应主管机构、项目公司或企业采购门户的规则",
        ],
        note: "PNCP公布项目并不等于在PNCP页面直接递交投标。参与企业必须以edital指定的电子系统、账户要求和递交方式为准。",
      },
      {
        id: "first-check",
        title: "参与前必须核对的项目要求",
        items: [
          "Órgão ou entidade：采购机关或实体，决定后续沟通和资格核验对象",
          "Unidade compradora / UASG：具体采购单位；联邦项目常用UASG识别机构与Compras.gov.br程序",
          "Número de controle PNCP：PNCP唯一控制编号，适合跨页面核对项目、附件和更新",
          "Modalidade：程序类型，例如Pregão、Concorrência、Concurso、Leilão或直接采购",
          "Modo de disputa：公开、封闭或组合方式，影响报价与竞价过程",
          "Situação：当前状态，并继续检查暂停、撤销、更正、结果及合同信息",
          "Data de abertura / encerramento：接收提案的起止时间；以最新公告和更正为准",
          "Local de realização：线上或线下，以及实际使用的电子系统和项目链接",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "确认参与资格与递交入口", detail: "从edital核对项目是否允许外国企业、联合体或分包参与，并确认实际使用Compras.gov.br、地方系统还是其他电子平台。" },
          { title: "确定企业参与身份", detail: "判断以境外企业、巴西子公司、联合体成员、分包商还是设备供应商进入，并确认是否需要CNPJ、本地代表或巴西送达地址。" },
          { title: "完成供应商和操作人员注册", detail: "若项目使用Compras.gov.br，按要求办理SICAF及操作账户；境外供应商应提前确认负责人CPF、采购机关录入及账户启用流程。其他平台需要分别注册。" },
          { title: "准备法律、技术和财务资料", detail: "逐项对应edital整理企业文件、业绩、人员、设备、财务能力、声明、技术方案、价格以及保证文件，并处理葡萄牙语翻译和认证。" },
          { title: "递交方案并保存凭证", detail: "严格按照edital规定的格式、语言、签署、时区、报价币种和电子操作步骤递交；保存系统回执和每次更新记录。" },
          { title: "跟进竞价、资格审查与合同", detail: "监控在线竞价、消息、补件、意向申诉、结果及合同签署。中标前后所需的正式翻译、认证、税务和担保文件可能不同。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "巴西项目的文件要求由edital决定。以下是境外企业通常需要提前建立的资料框架：",
        items: [
          "企业成立、存续、章程、注册地址和税务识别文件",
          "法定代表人、授权代理人、签字权限及负责人身份证明",
          "SICAF或实际电子平台要求的企业和用户资料",
          "税务、劳动、社会保障及诚信合规证明；境外无对应文件时的等效说明",
          "同类合同、客户证明、技术能力、关键人员、设备和质量认证",
          "财务报表、经济财务能力、报价、税费、进口与本地履约安排",
          "投标保证、履约保证、声明书及公告要求的其他附件",
        ],
        note: "Compras.gov.br现行官方说明允许境外企业在SICAF登记时先提交自由翻译的等效文件；签署合同或价格登记文件时，通常需要替换为巴西宣誓翻译并完成海牙认证或领事认证的文件。仍应以现行SICAF规则和具体edital为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "项目是否允许未在巴西设立实体的外国企业参与，还是要求巴西CNPJ、本地授权代表或当地经营资格",
          "SICAF境外供应商流程由谁发起；负责人是否需要有效CPF，以及采购机关需要提前录入哪些资料",
          "中国出具的公司、业绩和授权文件在投标阶段是否可用自由翻译，何时必须宣誓翻译、Apostille或领事认证",
          "技术标准是否引用ABNT、INMETRO、ANVISA、ANEEL、ANATEL或其他巴西认证，认证周期是否赶得上截止日期",
          "是否存在本国产品、可持续采购、中小企业优惠或本地服务要求，以及外国企业如何适用",
          "报价是否包含ICMS、IPI、ISS、PIS/COFINS、进口税和物流成本，付款、汇率及税务处理能否执行",
          "保证金或保险由哪类巴西机构出具，联合体、分包和本地售后是否允许",
        ],
        note: "外国供应商能够登记或进入系统，不代表自动符合某个项目。应在投入前向采购单位提出书面澄清，确认境外文件、税务、担保、技术认证和合同签署要求。",
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
    summary: "从个人用户到供应商账户，了解哥伦比亚电子公共采购系统的注册、资料公开与项目响应逻辑。",
    whatIs: "SECOP II 是哥伦比亚的交易型电子公共采购平台，由 Colombia Compra Eficiente 管理。采购实体和供应商可以在平台内完成项目发布、信息沟通、报价提交、评审与合同管理等采购流程。",
    audience: "希望参与哥伦比亚公共采购的本地或境外供应商",
    quickFacts: [
      { label: "官方系统", value: "SECOP II" },
      { label: "账户结构", value: "个人用户 + 供应商账户" },
      { label: "账户启用", value: "完成流程后自动启用" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于采购实体在 SECOP II 内开展的线上公共采购程序",
          "不代表所有哥伦比亚公共采购都采用完全相同的参与条件，仍要逐项阅读采购实体发布的文件",
          "供应商账户与个人用户是两层结构；企业已有账户时，应申请访问而不是重复创建",
        ],
        note: "先查看公开项目、采购实体、时间表和 pliego de condiciones，再决定是否创建或加入供应商账户。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先核对项目要求", detail: "通过公开查询确认采购实体、项目状态、时间表、参与方式，以及外国供应商和 RUP 是否适用于该程序。" },
          { title: "注册个人用户", detail: "创建个人用户并通过邮件激活。该用户代表本人操作，不应多人共用；时区应按用户所在地设置。" },
          { title: "创建或加入供应商账户", detail: "为企业创建供应商账户；如果企业已存在账户，则申请访问，避免重复创建。" },
          { title: "填写资料并上传文件", detail: "补全供应商基本资料、分类与相关证明文件。完成后账户自动启用，但这不代表 Colombia Compra Eficiente 已审核或认可全部资料。" },
          { title: "寻找并关注采购程序", detail: "按实体、关键词、分类和地区检索项目，订阅或关注感兴趣的程序并查看消息、时间表和文件。" },
          { title: "按项目要求提交报价", detail: "逐项完成问题、文件和价格表，在规定时间前通过 SECOP II 提交；保存提交确认并跟进实体回复。" },
        ],
      },
      {
        id: "documents",
        title: "供应商账户常见资料",
        intro: "官方注册指南针对法人和自然人列出了不同资料。法人企业通常应准备：",
        items: [
          "企业存在及法定代表证明，或境外注册主体的对应证明",
          "组织与财务能力证明、上一年度经审计财务报表及附注；新设企业按官方指南适用相应替代资料",
          "已完成合同或相关经验清单",
          "同意公共机构查询相关数据库的授权文件",
          "企业分类、联系信息及系统要求的其他账户资料",
          "RUP（Registro Único de Proponentes）如适用；它不是创建 SECOP II 供应商账户的一般前置条件，但在公开招标中是另一回事——见下方「中国企业重点核对」",
        ],
        note: "供应商目录中的注册资料可能被其他用户查看。上传身份证件或敏感资料前，应按官方指南考虑水印、保密标注和必要的信息保护。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "具体程序是否允许外国供应商，以及是否要求在哥伦比亚设分支、委任代表或组成联合体",
          "RUP 在本程序中是否适用：哥伦比亚官方口径是，在哥伦比亚有住所的自然人、在哥伦比亚设有分支机构（sucursal）的外国法人须登记 RUP；没有住所的外国自然人和没有分支机构的外国法人属于法定豁免，由采购实体以其他适当方式核验资格条件。注意反向情形——若为投标在当地设立分支机构，通常反而落入 RUP 义务",
          "税务登记、保证金和本地银行安排是否适用于该程序",
          "中国文件的西班牙语官方翻译、公证、附加证明书或领事认证要求",
          "时区、电子签署、报价币种、税费与跨境履约安排",
        ],
        note: "SECOP II 的账户注册文件不能替代具体采购程序要求的资格和投标文件。每个项目的 pliego de condiciones 及采购实体正式答复具有决定性。",
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
    summary: "先确认项目是否属于专项战略基础设施制度，再按公告核对参与条件、文件和提交渠道。",
    whatIs: "Proyectos Estratégicos MX 是墨西哥用于发布和查询特定战略基础设施采购程序的官方入口，服务于依据专项制度认定并推进的项目。它不是普通联邦采购平台 Compras MX 的替代入口，也不覆盖所有墨西哥基础设施项目；参与方式应以每个项目的 convocatoria、bases 和采购单位正式通知为准。",
    audience: "基础设施、工程、设备、能源、交通与大型项目供应商",
    quickFacts: [
      { label: "官方平台", value: "Proyectos Estratégicos MX" },
      { label: "主管领域", value: "战略基础设施投资项目" },
      { label: "制度状态", value: "2026年启用的新机制" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于依据战略基础设施专项制度认定并发布的特定项目",
          "不适用于所有联邦、州、市基础设施采购，也不能替代 CFE、Pemex 或 Compras MX 的核查",
          "外国资本、能源等行业项目还会继续受到外商投资法和相应行业法律约束",
        ],
        note: "先确认项目确实属于该专项制度，并找到采购单位发布的 convocatoria 和 bases；不要只根据平台名称或项目规模判断。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "从官方平台找到具体项目", detail: "按采购实体、项目名称或编号搜索，打开项目详情，确认程序阶段和当前有效版本。" },
          { title: "先核对参与范围", detail: "阅读 convocatoria 和 bases，确认采购方式、外国资本或境外企业是否可以参与，以及项目适用的专项、行业和外商投资规则。" },
          { title: "下载公告、基础文件与附件", detail: "完整阅读 convocatoria、bases、anexos、技术规格、时间表与所有后续澄清，不要只看公开列表中的摘要字段。" },
          { title: "按项目指定渠道登记和提交", detail: "不应默认 Compras MX 账户或提交路径可以直接通用。程序可能采用电子、现场或混合方式，以项目公告列明的平台注册、递交和签署要求为准。" },
          { title: "跟进答疑、更正与里程碑", detail: "检查说明会、现场踏勘、问题截止、澄清会议、方案提交和开标时间；基础设施项目的时间表可能通过正式更正调整。" },
        ],
      },
      {
        id: "documents",
        title: "建议提前准备的资料框架",
        intro: "该平台对应的新制度和项目类型跨度较大，目前不宜使用一份固定清单替代具体 bases。企业可先整理：",
        items: [
          "企业设立、法定代表、授权、税务和联系资料",
          "大型或同类项目经验、业绩合同与履约证明",
          "项目团队、关键人员、设备、施工或供货能力",
          "财务报表、融资能力、保险、担保和风险安排",
          "股权控制结构、最终受益所有人、关联关系及利益冲突声明",
          "技术方案、进度计划、环境与社会影响、安全和质量文件",
          "经济报价、长期融资与风险分配方案，以及项目要求的本地含量或供应链材料",
        ],
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "项目是否允许国际参与，以及国际条约、国籍或原产地条件",
          "是否要求墨西哥本地实体、联合体、项目公司、代表或送达地址",
          "境外文件认证、翻译、技术标准转换和本地专业资质",
          "融资、汇率、税务、进口、用工、环境与长期运维责任",
        ],
        note: "Proyectos Estratégicos MX 与 Compras MX 是不同的官方入口。虽然公开查询界面和部分数据结构相近，也不能据此推定账户、资格或提交方式互通。",
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
    summary: "从 RNP 供应商登记到在 SEACE／PLADICOP 上投标，梳理秘鲁公共采购的参与路径，以及境外企业必须先解决的前提。",
    whatIs: "SEACE（Sistema Electrónico de Contrataciones del Estado）是秘鲁公共采购的电子系统，主管机构为 OECE（Organismo Especializado para las Contrataciones Públicas Eficientes，由原 OSCE 改制）。自《公共采购通用法》Ley N.° 32069 于 2025 年 4 月 22 日生效后，秘鲁正把采购业务迁移到统一的数字平台 PLADICOP，SEACE 仍用于查询与既有流程。本站收录的秘鲁常规预算项目来自 OECE 的开放采购数据。",
    audience: "希望参与秘鲁公共采购的境内外货物供应商、服务商、工程承包商与咨询公司",
    quickFacts: [
      { label: "主管机构", value: "OECE（原 OSCE）" },
      { label: "法定前提", value: "RNP 登记且处于有效状态" },
      { label: "平台状态", value: "SEACE 与 PLADICOP 并行过渡中" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先确认要登记哪一类 RNP", detail: "RNP（Registro Nacional de Proveedores，国家供应商登记册）分为四类：货物供应商、服务供应商、工程咨询和工程执行（ejecutores de obras）。按打算参与的项目对象选择，不是登记一次就通用；类别与项目对象不匹配会直接影响投标资格。" },
          { title: "办理 RNP 登记", detail: "没有在秘鲁设立分支机构的境外主体按「extranjero no domiciliado」办理，通过法定代表人或受权人经 OECE 的 Mesa de Partes Digital 提交；已在 SUNARP 登记分支机构（sucursal）的按「domiciliada」办理。官方说明登记有效期为不定期（vigencia indeterminada），但仍需按规定保持资料更新。" },
          { title: "检索项目并确认所处阶段", detail: "在 SEACE／PLADICOP 的公开检索入口按采购实体、对象、程序编号和日期查找，先确认程序类型（licitación pública、concurso público、adjudicación simplificada 等）和当前阶段，再判断是否还来得及参与。" },
          { title: "下载 bases，并等 bases integradas", detail: "秘鲁流程中有 consultas y observaciones（质询与异议）环节，之后发布的 bases integradas 才是最终有效版本。只看首次公告很容易按已被修改的条款准备材料。" },
          { title: "按公告渠道提交并跟进授标", detail: "依 bases 规定的格式与渠道提交法律、技术和经济资料并保存回执；提交后继续关注 buena pro（授标）公示、异议期（recursos de apelación）与合同签署所需的补充文件。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下是企业通常应提前整理的资料框架，不代表每个项目都会要求全部文件：",
        items: [
          "RNP 登记所需的企业存在证明、法定代表人身份与授权委托文件",
          "公司设立文件、章程及变更、股权结构与实际受益人资料",
          "同类项目经验、已完成合同与验收或履约证明",
          "关键人员资历、设备清单与实施方案（工程与咨询类项目尤其重要）",
          "财务报表、经济与财务能力证明，以及报价和成本明细",
          "bases 要求的担保（garantía de seriedad de oferta、fiel cumplimiento）、各类宣誓书（declaraciones juradas）与签署方式",
        ],
        note: "RNP 登记有效是参与国家采购的法定前提之一（Ley N.° 32069 及其条例要求参与人、投标人、承包商与分包商具备有效登记，且不存在禁止与国家签约的情形），但它不能替代具体项目 bases 规定的资格条件——登记类别与项目对象是否匹配、经验与财务门槛是否达标，都要逐项核对。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "自身属于「无住所境外主体」还是已在秘鲁设分支：两种身份的 RNP 登记路径、代表人安排和后续义务不同；为投标而在当地设立分支，会改变适用规则",
          "该程序是否面向国际参与，或限定本地供应商、适用特定条约或原产地条件",
          "中国出具的公司文件需要西班牙语官方翻译、公证、附加证明书（Apostille）还是领事认证——以 bases 与 OECE 的现行要求为准",
          "担保函（carta fianza）是否必须由秘鲁境内受监管金融机构出具，中资银行出具的保函能否被接受",
          "报价币种（索尔 PEN 或美元）、IGV 等税费、进口关税与清关责任、履约期与付款条件",
          "是否触及 impedimentos para contratar con el Estado（禁止与国家签约的情形）及关联企业申报要求",
        ],
        note: "秘鲁的采购制度正处在 Ley N.° 32069 与 PLADICOP 的过渡期，平台入口、表单和部分流程仍在调整。以 OECE 的现行公告和项目 bases 为准，不要沿用旧版 OSCE 时期的操作说明。",
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
    summary: "了解 OxI 机制的出资与抵税逻辑、遴选流程，以及中国企业在「出资企业」和「执行企业」两种角色之间应该怎么选。",
    whatIs: "Obras por Impuestos（OxI）是秘鲁 Ley N.° 29230 设立的公共投资机制：私营企业先出资建设公共项目，完工或按进度验收后，由经济与财政部（MEF）签发 CIPRL／CIPGN 证书返还投资额，企业以该证书抵缴在秘鲁的第三类所得税（Impuesto a la Renta de Tercera Categoría）。ProInversión 负责推广该机制并协助各级公共实体开展企业遴选，现行条例为 2026 年 3 月批准的 DS N.° 038-2026-EF。",
    audience: "有意在秘鲁承接基础设施与公共服务项目的工程、设备与投资类企业",
    quickFacts: [
      { label: "法律依据", value: "Ley N.° 29230" },
      { label: "现行条例", value: "DS N.° 038-2026-EF（2026年3月）" },
      { label: "回报方式", value: "CIPRL／CIPGN 抵缴秘鲁所得税" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先判断自己要当哪一方", detail: "OxI 里有两个不同角色：出资企业（empresa privada financista，遴选程序的投标人）和执行企业（empresa ejecutora，实际施工或供货方）。遴选的是前者；中国企业若在秘鲁没有应税所得，通常更现实的切入点是作为执行方承接，而不是直接当出资方。" },
          { title: "找到正在遴选的项目", detail: "ProInversión 会公布「正在遴选中的 OxI 项目清单」，本站秘鲁来源之一就是这份清单。清单会列出发起实体、项目金额与关键日期，并链接到 ProInversión 的项目页和 MEF 的投资档案。" },
          { title: "向发起实体索取并研读 bases", detail: "遴选程序由发起项目的公共实体（地方政府、部委、大学、公立医院等）主持，资格条件、担保、时间表和评标方式都由该程序的 bases 规定，不是全国统一模板。" },
          { title: "准备并提交提案", detail: "按 bases 提交法律、技术与经济资料，并提供其要求的担保。实践中常见的安排是分别对应执行金额、监理费用和后续维护义务的 carta fianza，具体数量与比例以 bases 和现行条例为准。" },
          { title: "签订协议、执行并申请证书", detail: "中标后与实体签署公共投资协议（convenio），进入执行阶段，由私营监理机构（entidad privada supervisora）监督；按验收进度申请签发 CIPRL／CIPGN，再按 SUNAT 的规定抵缴税款。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "OxI 的资格条件由每个遴选程序的 bases 规定，并随条例修订变化。以下只是通常需要提前整理的资料框架：",
        items: [
          "企业存在证明、法定代表权与授权文件",
          "财务报表与出资能力证明（出资企业最核心的一项）",
          "同类项目经验、已完成工程业绩与履约记录",
          "拟用执行企业及关键人员的资质，以及设备与施工能力说明",
          "技术方案、进度计划、成本构成与运维安排",
          "bases 要求的各类担保（carta fianza）、宣誓书与合规声明",
        ],
        note: "OxI 的条例近年多次修订，2026 年 3 月的 DS N.° 038-2026-EF 是现行版本。资格、担保与证书使用规则都应以现行条例和该遴选程序的 bases 为准，不要沿用早年的介绍材料。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "抵税逻辑是否成立：CIPRL／CIPGN 的用途是抵缴在秘鲁的第三类所得税，且按规定存在使用比例上限。企业若在秘鲁没有应税所得，当「出资方」的收益逻辑并不自动成立，需要先评估是通过在秘鲁的纳税主体参与、转让证书，还是改以执行企业身份承接",
          "出资企业与执行企业能否分离，由谁承担工期、质量与缺陷责任，以及两者之间的合同如何安排",
          "担保函（carta fianza）的出具机构、币种与有效期要求，中资银行的保函是否被接受",
          "项目前期条件是否已落实：征地、许可、既有设计文件与社会环境因素，是 OxI 项目最常见的延期来源",
          "证书签发与抵扣的时间差带来的资金占用和汇率风险，以及是否计划转让证书变现",
        ],
        note: "本站列出的 OxI 项目来自 ProInversión 公布的遴选清单，用于发现机会；是否适合参与、以什么角色参与，仍需结合企业在秘鲁的税务地位和具体 bases 判断，必要时先取得当地法律与税务意见。",
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
    summary: "从项目筛选、境外供应商登记到核对 bases、提交报价与跟踪授标，梳理智利公共采购的实际参与路径。",
    whatIs: "Mercado Público 是智利政府采购的公开查询与电子交易平台，由 ChileCompra 管理。公众可查询招标、订单和合同；供应商参与交易前，须按现行规则在 Registro de Proveedores 登记并保持 hábil（可参与）状态。它不是所有基础设施投资的唯一入口：特许经营、国有企业或私人矿业与能源项目，应以各项目主管机构指定的采购渠道为准。",
    audience: "希望参与智利公共部门货物、服务及部分工程采购的境内外企业",
    quickFacts: [
      { label: "官方平台", value: "Mercado Público" },
      { label: "注册状态", value: "Registro de Proveedores：hábil" },
      { label: "常用语言", value: "西班牙语" },
    ],
    sections: [
      {
        id: "scope",
        title: "先确认项目属于哪个采购体系",
        items: [
          "Mercado Público 适用于受智利公共采购制度管理的机构；可先公开检索，再查看每项采购的 bases 和交易入口",
          "MOP 特许经营项目应到 Dirección General de Concesiones 核查，不能把规划项目或特许经营项目直接当作 Mercado Público 招标",
          "矿业公司、电力开发商、港口运营商和 EPC 承包商的下游采购，可能通过各自的供应商系统发布",
        ],
        note: "先认清采购主体与程序编号，再判断自己的角色是直接投标人、联合参与方，还是设备及专项工程供应商。",
      },
      {
        id: "first-check",
        title: "打开项目后先核对什么？",
        items: [
          "ID de licitación 与 organismo comprador：核对唯一项目编号和采购机构",
          "Estado 与 cronograma：确认项目状态、提问、答复、提交、开标和预计授标的日期与时区",
          "Bases、anexos 与 aclaraciones：下载完整标书和附件；问答及更正可能改变技术条件与时间表",
          "Requisitos para ofertar：核对供应商登记状态、经验、技术认证、现场踏勘、联合体和文件签署要求",
          "Garantías 与 evaluación：逐项检查投标／履约担保、评分权重、币种、税费及交付地点",
        ],
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "搜索并筛选机会", detail: "在 Mercado Público 按关键词、行业、机构或项目 ID 找到招标，先排除已关闭、不匹配或准备时间不足的项目。" },
          { title: "下载并核对完整 bases", detail: "阅读行政、技术和经济条件、附件、时间表，以及平台上的问答、更正和通知；不能只按公告摘要报价。" },
          { title: "办理供应商登记", detail: "按企业实际身份在 Registro de Proveedores 登记并核实 hábil 状态。境外企业有单独资料要求；如无法使用 ClaveÚnica，应向 ChileCompra 确认当前适用的境外身份与登录路径。" },
          { title: "准备并发送报价", detail: "按项目要求填写价格和税费，上传行政、技术及经济文件，在截止前完成电子发送并保存系统确认编号。修改已发送的报价后，应再次确认成功提交。" },
          { title: "跟进开标与合同", detail: "持续查看澄清、开标、评估、授标和订单／合同通知；中标后按 bases 提供履约担保及签约文件。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下为准备框架，具体文件、有效期和格式由每项 bases 决定：",
        items: [
          "企业身份、国籍、地址、设立文件及存续证明",
          "法定代表人身份证明、授权及授权有效性文件",
          "股东、管理人员、最终受益所有人与诚信声明",
          "同类业绩、人员和设备、质量认证及产品技术资料",
          "报价、税费、运输与交付安排，以及项目要求的担保",
          "境外文件所需的认证、翻译和电子签署材料",
        ],
        note: "ChileCompra 说明，境外主体可登记；但平台注册、税务和履约安排不能混为一谈。境外企业是否需要智利 RUT、当地代表或进口安排，应结合具体项目和交易结构确认。",
      },
      {
        id: "foreign",
        title: "中国企业特别要核对",
        items: [
          "不要把普通用户使用的 ClaveÚnica 步骤直接套用到境外企业；官方帮助中心承认境外供应商使用识别 ID 的登录路径",
          "确认项目是否允许直接境外供货、联合体或本地代理，以及报关、增值税、售后和现场服务由谁承担",
          "提前整理公司设立、存续、授权和最终受益所有人资料，核对西班牙语翻译及证明文件要求",
          "核算担保开立、智利技术标准、币种与汇率、保修及履约周期；公告中的参考金额不等于最终合同金额",
          "大型道路、机场、港口和矿业相关机会还应跟踪特许经营公司、项目业主及 EPC 承包链，不只看政府公开招标",
        ],
        note: "截至2026年9月，智利供应商登记与平台功能仍有更新。正式投标前，请再次核对 ChileCompra 最新指引、项目 bases 与在线系统实际要求。",
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
    summary: "Petrobras 不在 PNCP 发布采购，而是通过自有门户 Petronect。先完成供应商登记，再按每个机会的 Abrangência 判断境外企业能否报价。",
    whatIs: "Petronect 是巴西国家石油公司 Petrobras 的电子采购门户，Petrobras 与子公司 Transpetro 在这里公开「正在接受报价的采购机会」（Oportunidades Abertas）。Petrobras 作为国有企业，按《国有企业法》Lei 13.303/2016 和公司自己的采购规章采购，不适用政府采购法 Lei 14.133，因此它的项目不会出现在 PNCP。本站收录的 Petrobras 项目来自 Petronect 的公开机会列表，以设备、材料和工程为主。",
    audience: "油气设备、管材阀门、电气仪表、海工与炼化工程相关的设备供应商和承包商",
    quickFacts: [
      { label: "采购门户", value: "Petronect" },
      { label: "法律依据", value: "Lei 13.303/2016（国有企业法）" },
      { label: "境外企业", value: "看每个机会的 Abrangência" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 Petrobras 和 Transpetro 在 Petronect 公开的采购机会（Oportunidades Abertas para propostas）",
          "不适用于 PNCP 上的政府采购；Petrobras 的采购在 PNCP 上查不到",
          "巴西官方公报（DOU）上的 Petrobras「AVISO DE LICITAÇÃO」只是简短公告，完整文件和报价都在 Petronect",
          "大量采购是按供应商登记类别邀请的，公开列表只是其中一部分",
        ],
        note: "每个机会都标有 Abrangência（参与范围）：Internacional 表示境外供应商可以报价，Nacional 表示只限巴西供应商。先看这一栏，再决定是否投入准备。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先找到机会并看参与范围", detail: "在 Petronect 的公开机会列表，用「Buscar por」按机会编号、标的或物料关键词搜索，确认 Abrangência、报价期起止时间和发布公司（Petrobras 或 Transpetro）。" },
          { title: "在 Petronect 创建企业档案", detail: "供应商登记（Cadastro de Fornecedores）统一在 Petronect 办理，全年开放。第一步填写国家、企业识别号码、负责人和联系邮箱；企业身份信息确认后不能再修改，填写前要核对清楚。" },
          { title: "选择供货类别并回答评估问卷", detail: "选择要登记的物料或服务类别（família），再回答评估问卷。巴西企业一般涉及经济、法律、技术、健康安全环境（SMS）和诚信五类；境外企业使用区别化的问卷，官方常见问题中提到的是经济、法律和资格认定（Credenciamento）三类。" },
          { title: "等待评估结果和登记证书", detail: "Petrobras 审核后给出结果，通过的类别会签发供应商登记证书 CRC（Certificado de Registro Cadastral，可能是全部或部分类别）。" },
          { title: "下载文件、提问并报价", detail: "在 Petronect 下载该机会的附件和招标文件，在报价期内按文件要求提交报价，并跟进澄清、更正和结果。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "具体要求以登记问卷和每个机会的文件为准。企业通常应提前准备：",
        items: [
          "企业设立与存续证明、注册地址和税务识别号码",
          "法定代表人身份、授权书及签字权限文件",
          "财务报表及不处于破产、清算状态的声明",
          "客户推荐信、同类供货或工程业绩",
          "健康安全环境（SMS）相关记录与培训计划（巴西企业问卷要求）",
          "信息真实性声明与反腐败合规声明",
        ],
        note: "Petrobras 官方说明，登记本身不收费；但 Petronect 平台对参与公开机会收取「Taxa de Acesso」（访问费），对中标企业收取「Taxa de Transação」（交易费），收费模式见 Petronect 的 Modelos de Cobrança。Petrobras 提醒不要向任何自称代表 Petrobras 收费的第三方付款。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "机会的 Abrangência 是否为 Internacional；标为 Nacional 的机会，境外企业不能直接报价，只能通过巴西本地实体或作为分包、供货方参与",
          "登记的 família（物料或服务类别）是否与机会要求一致；登记成功不代表能参加所有采购，官方说明登记本身不保证参与资格",
          "报价条件：INCOTERMS、币种、进口税费、清关与交付地点由谁承担",
          "技术标准：是否引用 Petrobras 自有技术规范（N 标准）、API、ABNT 或 INMETRO 认证，认证周期是否赶得上报价期",
          "本地含量（conteúdo local）、售后和现场服务要求，以及是否允许分包",
          "诚信与合规：登记评估包含诚信（Integridade）一项，关联关系、制裁名单和过往合规事件都应提前梳理",
        ],
        note: "Petronect 的公开机会一般没有预算金额：Lei 13.303 允许国有企业对预算保密。评估是否参与时，应以技术规格、数量和交付范围估算规模，不要等待金额信息。",
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
    summary: "Cemig 在自有采购门户上采购输配电设备、材料和工程。只有登记在对应物料或服务类别的供应商才能报价，境外企业还必须通过巴西代表沟通。",
    whatIs: "Cemig（Companhia Energética de Minas Gerais）是巴西米纳斯吉拉斯州控股的综合电力公司，业务覆盖发电、输电和配电。它作为国有企业，按 Lei 13.303/2016 和公司内部采购规章（Regulamento Interno de Licitações e Contratos）采购，在自有的 Portal de Compras（e-Compras）上发布项目，不在 PNCP 发布。本站收录的 Cemig 项目来自该门户上处于「已发布、接受报价」阶段的流程，以铁塔、绝缘子、变压器等电网设备和材料为主。",
    audience: "输变电设备、电力材料、电网工程相关的设备供应商和承包商",
    quickFacts: [
      { label: "采购门户", value: "Cemig Portal de Compras（e-Compras）" },
      { label: "法律依据", value: "Lei 13.303/2016 与 Cemig 内部采购规章" },
      { label: "报价前提", value: "已登记在对应物料或服务类别" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 Cemig 及其发电、输电、配电子公司在 Portal de Compras 发布的采购流程",
          "公开检索不需要登录；报价需要供应商账户，账户在登记资料全部提交后才会开通",
          "报价的前提是在招标文件（Edital）为该标段指定的物料组或服务组（Grupo de Materiais / Serviços）完成登记",
        ],
        note: "Cemig 的招标文件通常是一个完整的压缩包，里面有技术规格、图纸和合同条件，下载后要逐项核对，不要只看门户上的摘要。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先核对项目和标段", detail: "在 Portal de Compras 打开流程，下载 Edital，确认标段划分、所需的物料组或服务组、报价期和竞价（disputa）开始时间。" },
          { title: "选择登记路径", detail: "Cemig 分别提供巴西企业（Empresa Nacional）和境外企业（Empresa Internacional）的登记路径，也有通过 SAP Ariba 的登记渠道。按企业身份选择，不要混用。" },
          { title: "提交登记资料", detail: "在 Portal de Compras 在线提交资料并跟踪审核状态。境外企业的全部企业文件都要经过领事认证或海牙认证（Apostille），并体现企业在本国的税务识别号。" },
          { title: "按需完成技术预审", detail: "对运营关键物料和设备，Cemig 要求技术预审（Pré-qualificação Técnica），包括供应商技术评估、物料认可和设备资格认定。没有通过预审的物料可能无法中标。" },
          { title: "在门户报价并参加竞价", detail: "账户开通后，在报价期内上传报价和文件，按 Edital 参加线上竞价，并跟进资格审查、结果和合同。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下是登记和报价时通常需要的资料框架，具体以 Cemig 登记要求和 Edital 为准：",
        items: [
          "企业设立与存续证明、章程和本国税务识别号（需认证）",
          "法定代表人身份与授权文件，以及巴西代表的授权",
          "税务、劳动和社会保障合规证明，或境外的等效文件",
          "财务报表和经济财务能力证明",
          "同类供货业绩、产品技术资料、型式试验报告和质量体系认证",
          "合规、可持续和诚信方面的声明",
        ],
        note: "Cemig 的登记问题可以写信到 cadastrocemig@cemig.com.br 咨询。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "巴西代表：Cemig 明确规定，与境外企业的所有联系只通过其在巴西的代表进行，需要提前确定代表人选和授权范围",
          "文件认证：中国是海牙认证公约成员国，企业文件办理 Apostille 即可；葡萄牙语翻译要求以登记说明和 Edital 为准",
          "技术认证：电网设备是否需要 INMETRO、ABNT 标准或 Cemig 自有技术规范的认可，试验能否在巴西认可的实验室完成",
          "报价条件：币种、进口税费（II、IPI、ICMS、PIS/COFINS）、清关和交付到 Cemig 仓库的责任",
          "是否允许联合体和分包，售后、备件和质保期要求",
        ],
        note: "Cemig 的门户对已发布流程不显示预算金额。评估规模时，可以从 Edital 的数量清单和技术规格估算。",
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
    summary: "UPME 招的不是设备供应商，而是出资建设并运营输电线路和变电站的投资人。先判断自己是当投资人，还是给投资人做工程和供货。",
    whatIs: "UPME（Unidad de Planeación Minero Energética）是哥伦比亚矿业能源部下属的规划机构。它按输电扩展规划，为每一个新的输电项目公开遴选投资人（Convocatoria Pública）：投资人负责设计、采购、建设、运营和维护国家输电网（STN，230/500 kV）或区域输电网（STR，110/115 kV）的线路和变电站，建成后按能源和天然气监管委员会（CREG）核定的年度收入获得长期回报。这些项目不在 SECOP II 发布。同一个招商中，UPME 还会另行遴选对项目进行监理的 Interventor（监理机构）。",
    audience: "输变电工程总包、电网投资与运营企业、电力设备供应商，以及工程监理和咨询公司",
    quickFacts: [
      { label: "遴选对象", value: "项目投资人（以及监理机构）" },
      { label: "评标方式", value: "25 年预期年收入现值最低者中标" },
      { label: "中标后", value: "须在哥伦比亚设立公共服务企业 E.S.P." },
    ],
    sections: [
      {
        id: "scope",
        title: "先弄清楚这是什么项目",
        items: [
          "UPME 招的是投资人：中标者自己出资建设并运营项目，不是 UPME 付款采购工程",
          "回报是 CREG 核定的预期年收入（Ingreso Anual Esperado），按投标时报出的 25 年收入流计算",
          "不少项目在正式公告（Publicación oficial）前有预公告（Prepublicación）阶段，可以提前研究文件",
          "项目文件、各次听证会纪要和补遗都发布在 UPME 该项目的页面上，纪要本身就反映项目所处阶段",
        ],
        note: "对多数设备商和工程公司，更现实的切入点是给投资人做 EPC 总包、分包或供货，而不是自己当投资人。关注 UPME 的项目，可以提前知道哪些投资人会在什么时候采购。",
      },
      {
        id: "process",
        title: "投资人参与流程",
        steps: [
          { title: "阅读项目遴选文件（DSI）", detail: "每个项目都发布《投资人遴选文件》（Documentos de Selección del Inversionista，DSI）及附件，写明技术要求、投运日期、日程表、保函和评标规则。" },
          { title: "在 UPME 平台注册", detail: "投标人（Proponente）可以是一家国内外自然人或法人，也可以是联合体（Consorcio）。提交方案前必须在 UPME 的电子平台（Plataforma Tecnológica）注册，并指定授权代表向 UPME 申请账户。" },
          { title: "准备 1 号信封（技术方案）", detail: "包括资格文件、股权结构证明、投标保函（Garantía de Seriedad）、质量证书、授权文件等；如果投标人还不是 E.S.P.，要附上拟设立 E.S.P. 的章程草案。" },
          { title: "准备 2 号信封（经济方案）", detail: "按美元不变价报出项目投运后前 25 年每一年的预期年收入。UPME 用 CREG 规定的折现率计算现值，在公开听证会上开启 2 号信封，现值最低的有效方案中标。" },
          { title: "中标后设立 E.S.P. 并提交履约保函", detail: "中标人如尚未设立，须在哥伦比亚设立以输电为经营范围的公共服务企业（E.S.P.），在 CREG 等机构登记，提交经市场管理方（ASIC，由 XM 担任）审批的履约保函，并签署聘请监理的信托合同。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下资料框架来自 UPME 的 DSI 样本，每个项目的具体要求以该项目的 DSI 为准：",
        items: [
          "企业存在和法定代表证明；没有哥伦比亚分支机构的境外企业，可以用本国主管机关出具的同等文件",
          "股权结构证明（由审计师或法定代表签署），联合体须提交每个成员的股权结构",
          "联合体协议：成员、持股比例、代表人和最短存续期限",
          "投标保函：由一流金融机构出具；境外银行须在哥伦比亚央行（Banco de la República）认可的境外金融机构名单内，并具有标普或穆迪投资级长期评级",
          "质量体系证书、授权委托书和项目共存承诺函等 DSI 规定的格式文件",
        ],
        note: "DSI 要求境外文件附哥伦比亚认可的官方译员出具的西班牙语译文，并办理海牙认证（Apostille）或领事认证，签发日期一般不超过 90 天。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "角色选择：当投资人意味着长期持有和运营哥伦比亚电网资产，并在当地设立 E.S.P.；只想做工程或供货的企业，应跟踪中标投资人的采购",
          "投标保函的有效期至少为提交方案后 4 个月，如果届时 CREG 还没有正式确认收入，要一直延长到确认之日",
          "收入以美元不变价计价，要评估汇率、融资成本和 25 年运营风险",
          "环境许可、土地通行权（servidumbres）和社区协商是输电项目常见的延期原因；按 DSI，投运延期期间 ASIC 会按月向投资人开具费用",
          "监理机构（Interventor）是另一项单独遴选，工程咨询和监理公司可以单独关注这一部分",
        ],
        note: "UPME 项目的数据标签会滞后，本站只收录尚未召开投资人开标听证会的项目。准备投标前，务必在 UPME 项目页面核对最新纪要和补遗。",
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
    summary: "Petroperú 按公司自己的采购规章采购，国际竞争性采购（PCI）面向境外供应商。报价前必须在其合格供应商库（BDPC）完成登记。",
    whatIs: "Petroperú（Petróleos del Perú）是秘鲁国有石油公司，经营塔拉拉炼厂（Refinería Talara）和北秘鲁输油管道等资产。它按公司自己的《采购与合同规章》（Reglamento de Contrataciones）采购，而不是走 SEACE 的常规政府采购程序。当国内没有供应商满足技术要求，或向境外供应商采购更有利时，Petroperú 会进行国际采购，并在官网「Competencia internacional」栏目公布。本站只收录其中编号以 PCI 开头的正式国际竞争性采购（Proceso por Competencia Internacional）。",
    audience: "炼化设备、催化剂与化学品、管材阀门及油气工程服务的境外供应商",
    quickFacts: [
      { label: "发布位置", value: "Petroperú 官网 Competencia internacional" },
      { label: "报价前提", value: "BDPC 登记状态为 REGISTRADO" },
      { label: "截止日期", value: "见招标文件，会随日程修改调整" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 Petroperú 官网「Competencia internacional」栏目中编号为 PCI 的国际竞争性采购",
          "同一栏目里编号为 CAI 的条目是采购完成后的公示（技术报告、订单等），不是招标，无法报价",
          "列表不写投标截止日期；截止日期写在招标文件（Bases）里，并会随「Modificación de cronograma」（日程修改）调整",
        ],
        note: "一个 PCI 项目可能多次修改日程，也可能在授标后被宣告无效、重新进行。看这个项目最新上传的文件，才能知道它现在处于哪个阶段。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "先在 BDPC 登记", detail: "Petroperú 规章规定，提交报价、获得授标和签约的前提，是在合格供应商库（Base de Datos de Proveedores Calificados，BDPC）有有效登记；联合体的每个成员都要登记。登记由第三方机构 Achilles 验证，按其现行说明在提交资料后最多 2 个工作日内完成审核，状态为 REGISTRADO 后获得证书。" },
          { title: "找到 PCI 项目并下载 Bases", detail: "在官网「Competencia internacional」列表中找到项目，下载 Bases、技术条件、邀请函、合同范本和提问格式等文件。" },
          { title: "在提问期内提交问题", detail: "按 Bases 规定的格式（通常有专门的提问表）在提问期内提交问题，关注答复和 Bases 修改。" },
          { title: "跟进日程修改并提交报价", detail: "以最新的日程修改为准，在截止前按 Bases 规定的方式提交报价，并提供 Bases 要求的保函。" },
          { title: "跟进授标结果", detail: "关注授标（Buena Pro）结果、宣告流标或取消的通知；授标也可能被宣告无效后重新进行。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "BDPC 登记和报价时通常需要：",
        items: [
          "BDPC 登记问卷（适用规章的采购用完整版问卷）",
          "每个登记的产品或服务类别至少一份合同作为业绩证明，文件不超过 5 年",
          "企业设立、存续与法定代表证明，授权文件",
          "财务报表与经济能力证明",
          "Bases 要求的技术文件、保函和各类声明",
        ],
        note: "BDPC 登记按企业年营业额分档收费（2023 年 9 月 3 日起：年营业额不超过 10 万美元免费，10 万至 15 万美元为 354 索尔，超过 15 万美元为 1,534 索尔，均含税），证书有效期最长一年。收费和流程以 Petroperú 与 Achilles 的现行说明为准。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "BDPC 登记要在报价前完成，并留出审核和补件的时间；Achilles 秘鲁的联系方式见 Petroperú 登记页面",
          "国际采购适用秘鲁签署的国际条约和国际商事惯例，货物通常按国际贸易术语（INCOTERMS）报价",
          "禁止与国家签约的情形（impedimentos）适用于 Petroperú 的所有采购，关联企业和过往合同纠纷要提前核对",
          "保函的出具银行、币种和有效期要求，中资银行保函能否被接受",
          "技术文件的西班牙语翻译，以及境外文件的海牙认证要求",
        ],
        note: "Petroperú 现行采购规章 2021 年 6 月 28 日生效，此后多次修改（最近一次为 2024 年 7 月 18 日）。以官网公布的现行版本和项目 Bases 为准。",
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
    summary: "Codelco 不在 Mercado Público 采购，绝大多数采购通过 SAP Ariba 按邀请进行。先在 Red Negocios 完成登记和类别认证，再在截止前表达参与意向。",
    whatIs: "Codelco（Corporación Nacional del Cobre de Chile）是智利国有铜业公司，旗下有多个矿山分部（División）。智利国有企业不适用政府采购法 Ley 19.886，因此 Codelco 的采购不在 Mercado Público 发布。它的大部分采购在 SAP Ariba 上邀请已登记的供应商参加；官网「Licitaciones en proceso」栏目公开其中一部分，多为总部（Casa Matriz）为各分部统一采购的化学品、电缆、泵、钢材和管材等类别合同。",
    audience: "矿山设备、电气材料、化学品、管材与工程服务供应商",
    quickFacts: [
      { label: "登记平台", value: "Red Negocios（rednegocios.cl）" },
      { label: "招标平台", value: "SAP Ariba（按邀请）" },
      { label: "关键日期", value: "Fecha de entrega：表达意向的截止日" },
    ],
    sections: [
      {
        id: "scope",
        title: "这份指南适用于什么？",
        items: [
          "适用于 Codelco 官网「Licitaciones en proceso」公开的招标，以及按类别向已登记供应商发出的邀请",
          "官网列表的「Fecha de entrega」通常是表达参与意向的截止日，不是交标截止日；之后招标文件只发给已登记的投标人",
          "招标文件、提问和报价都在 SAP Ariba 上进行，需要收到邀请后才能进入",
        ],
        note: "官网表格不会自动删除过期条目，里面有多年前的记录。先看「Fecha de entrega」是否已过，再决定是否跟进。",
      },
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "在 Red Negocios 登记", detail: "Codelco 的供应商登记通过 Red Negocios（rednegocios.cl）进行：填写联系人、企业和银行资料，选择与经营范围相关的类别，并选择登记计划类型。" },
          { title: "验证登记类别的经验", detail: "上传发票、订单、合同或 Codelco 合同管理人出具的履约评价，证明在所登记类别的经验。官方说明验证结果有效 3 年，可以随时增加新类别。" },
          { title: "上传 Codelco 要求的文件", detail: "按企业类型（法人、自然人、成立不满一年的企业、境外企业）上传所需文件，并填写年度更新的合规宣誓书（Declaración Jurada）。" },
          { title: "完成分级、风险评分与合规审查", detail: "Codelco 规定，任何采购的授标都以完成这一步为前提。按官方流程图，文件验证后约 10 个工作日出结果，可在 Red Negocios 的看板查看。" },
          { title: "表达参与意向并在 SAP Ariba 报价", detail: "Codelco 会按已验证类别通过邮件邀请供应商；也可以根据官网公布的招标，在「Fecha de entrega」前按公告要求申请邀请。收到邀请后，通过链接创建 SAP Ariba 标准账户，在 Ariba 中下载文件、提问并提交报价。" },
        ],
      },
      {
        id: "documents",
        title: "常见资料清单",
        intro: "以下为 Codelco 登记流程中列出的资料类型，具体清单以 Red Negocios 的「Documentos requeridos」为准：",
        items: [
          "企业资料、联系人和银行资料（银行资料表）",
          "证明类别经验的发票、订单或合同",
          "境外企业适用的设立与代表文件",
          "员工人数声明、涉诉情况宣誓书",
          "智利 NCh 2770 标准的对齐问卷",
          "年度更新的合规宣誓书",
        ],
        note: "Red Negocios 的登记咨询邮箱是 contacto@rednegocios.cl；SAP Ariba 访问和使用问题可联系 Codelco 采购门户 portalcompras@codelco.cl。",
      },
      {
        id: "foreign",
        title: "中国企业重点核对",
        items: [
          "Red Negocios 有专门的境外企业文件清单，登记前先下载核对",
          "登记计划类型和费用以 Red Negocios 现行报价为准",
          "类别经验要能用发票、订单或合同证明，最好准备同类矿山客户的业绩",
          "类别合同往往覆盖多个分部、周期较长，要评估长期供货、仓储、售后和价格调整机制",
          "报价币种、INCOTERMS、智利进口税费和本地技术标准",
        ],
        note: "官网公开的招标只是 Codelco 采购的一小部分。提前完成登记和类别认证，才会收到按类别发出的邀请。",
      },
    ],
    sources: [
      { label: "Codelco 公开招标列表（Licitaciones en proceso）", href: "https://www.codelco.com/licitaciones-en-proceso" },
      { label: "Codelco 供应商登记流程图（PDF）", href: "https://www.codelco.com/prontus_codelco/site/docs/20230628/20230628153213/procesoinscripcionproveedores_esp2__1_.pdf" },
      { label: "Codelco 采购流程与 SAP Ariba 说明", href: "https://www.codelco.com/proceso-de-contratacion-de-bienes-y-servicios" },
      { label: "Red Negocios 供应商登记", href: "https://www.rednegocios.cl/" },
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
    description: "联邦采购、电力、油气与战略基础设施项目",
  },
  {
    name: "巴西",
    code: "BR",
    description: "PNCP全国公开入口，以及 Petrobras（石油）和 Cemig（电力）的自有采购门户",
  },
  {
    name: "哥伦比亚",
    code: "CO",
    description: "SECOP II 电子公共采购，以及 UPME 输电项目投资人遴选",
  },
  {
    name: "秘鲁",
    code: "PE",
    description: "SEACE 常规预算采购、Obras por Impuestos 以工程抵税项目，以及 Petroperú（石油）国际采购",
  },
  {
    name: "智利",
    code: "CL",
    description: "Mercado Público 公开采购，以及 Codelco（铜矿）供应商登记与招标",
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
