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
    title: "怎么参与 Compras MX 的政府采购项目？",
    summary: "从平台注册、寻找项目到提交响应，了解墨西哥联邦政府采购平台的基本参与路径。",
    whatIs: "Compras MX 是墨西哥联邦政府公共采购数字平台，由墨西哥反腐与良政部主管，并由原 CompraNet 系统转型而来。政府机构通过该平台发布和管理货物、服务、租赁及公共工程等采购程序，供应商可以查找公告、获取文件并依具体程序参与。",
    audience: "希望参与墨西哥联邦政府采购的境内外自然人或企业",
    quickFacts: [
      { label: "官方平台", value: "Compras MX" },
      { label: "常用语言", value: "西班牙语" },
      { label: "参与方式", value: "依项目公告与程序类型而定" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "创建平台账户", detail: "进入 Compras MX，按平台注册页面填写必填的基本资料并完成账户启用。境外企业应按页面实际提供的身份类型和字段填写。" },
          { title: "搜索并筛选项目", detail: "在公开查询入口按采购单位、关键词、程序编号和日期查找项目，先确认项目仍在有效期内。" },
          { title: "阅读完整公告", detail: "下载 convocatoria、bases、anexos 和后续澄清文件，核对参与范围、时间表、技术规格、担保和提交方式。" },
          { title: "准备并提交响应", detail: "按照具体程序指定的格式、签署方式和渠道提交法律、技术及经济文件；不要只依据平台摘要准备标书。" },
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
          "程序的参与范围是否允许外国企业，或是否限定墨西哥企业、条约国供应商或本地制造比例",
          "是否需要墨西哥税号、本地代表、送达地址、联合体或当地合作伙伴",
          "中国出具的公司文件是否需要公证、附加证明书（Apostille）或领事认证及西班牙语宣誓翻译",
          "报价币种、税费、进口责任、履约担保及付款条件是否可接受",
        ],
      },
    ],
    sources: [
      { label: "Compras MX 官方平台", href: "https://comprasmx.buengobierno.gob.mx/" },
      { label: "Compras MX 公开项目查询", href: "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/" },
      { label: "RUPC 官方说明与办理流程", href: "https://comprasmx.buengobierno.gob.mx/rupc" },
    ],
  },
  {
    slug: "mexico-cfe-micrositio",
    country: "墨西哥",
    countryCode: "MX",
    platform: "CFE Micrositio",
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
        id: "process",
        title: "参与流程",
        steps: [
          { title: "确认供应商类别", detail: "注册时选择境内或境外、自然人或法人，并确认属于货物／租赁／服务供应商，还是工程承包商。" },
          { title: "创建供应商账户", detail: "在 CFE Micrositio 的新供应商入口录入企业、联系人和税务等资料，并按系统提示完成账户配置。" },
          { title: "配置电子签名（e.firma）", detail: "注册页面要求上传证书（.cer）与私钥（.key）文件并输入密码，系统会与墨西哥税务局（SAT）校验；法人须使用企业本身的 e.firma，而不是个人的。这实际上意味着注册前需要先有墨西哥税号（RFC）。没有 RFC 的境外企业应先向 CFE 服务台确认当前是否存在适用于境外主体的替代安排，不要假设一定有。" },
          { title: "查找并加入具体程序", detail: "检索采购程序，阅读公告和日历，按系统指引表达参与意向或加入程序，并关注提问与答疑窗口。" },
          { title: "提交方案并跟进", detail: "依 bases 与附件分别准备法律／行政、技术和经济方案，在指定时间内完成电子提交并保存回执。" },
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
        note: "CFE 官方教程提供检索、加入程序、提问、联合参与和通知等操作说明。实际文件清单仍由每个项目的 bases、anexos 与后续澄清决定。",
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
    platform: "Pemex SISCEP",
    title: "怎么参与 Pemex 的采购项目？",
    summary: "了解 Pemex 供应商登记、SISCEP 联系人开通、表达参与意向及逐项响应的主要步骤。",
    whatIs: "SISCEP 是 Pemex 用于电子采购活动和供应商互动的系统。企业通常需要先完成 Pemex 供应商资料登记，再通过获授权的企业联系人进入系统，对具体采购事件表达参与意向、接收通知并提交相应资料。",
    audience: "油气、石化、工程、设备、运维与专业服务供应商",
    quickFacts: [
      { label: "采购单位", value: "Pemex" },
      { label: "参与系统", value: "SISCEP" },
      { label: "前置动作", value: "完成 HIIP 供应商登记" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "完成供应商登记", detail: "先在 Pemex 的供应商信息整合工具（HIIP，Herramienta de Información Integral de Proveedores）登记，取得六位供应商编号及相应登记证明。公开竞赛通常要求完成该登记。" },
          { title: "开通 SISCEP 联系人", detail: "为企业建立或启用可进入 SISCEP 的公司联系人账户，确保邮箱与授权关系有效。" },
          { title: "查找项目并表达意向", detail: "阅读公开采购程序；对希望参加的项目按公告指定方式提交 manifestación de interés（参与意向）——Pemex 现行流程通常要求以邮件提交，且提交时 HIIP 登记须处于有效状态。" },
          { title: "通过邀请链接进入事件", detail: "Pemex 通常向已表达意向且符合系统流程的联系人发送加入采购事件的链接，企业再在 SISCEP 内继续操作。" },
          { title: "提交响应并跟进结果", detail: "按项目 bases、附件、答疑与更正准备和提交方案，持续查看事件通知与评审结果。" },
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
          "供应商资料需保持更新；Pemex 官方说明建议至少每年复核更新一次",
        ],
      },
    ],
    sources: [
      { label: "Pemex 采购程序与参与步骤", href: "https://www.pemex.com/procura/procedimientos-de-contratacion/contratacion/Paginas/procedimiento.aspx" },
      { label: "Pemex SISCEP 采购程序入口", href: "https://www.pemex.com/procura/procedimientos-de-contratacion/contratacion/Paginas/default.aspx" },
      { label: "Pemex 供应商常见问题", href: "https://www.pemex.com/ayuda/preguntas_frecuentes/Paginas/proveedores-contratistas.aspx" },
    ],
  },
  {
    slug: "colombia-secop-ii",
    country: "哥伦比亚",
    countryCode: "CO",
    platform: "SECOP II",
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
        id: "process",
        title: "参与流程",
        steps: [
          { title: "注册个人用户", detail: "先创建个人用户并通过邮件激活。该用户代表本人操作，不应多人共用。" },
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
    title: "怎么参与 Proyectos Estratégicos MX 的项目？",
    summary: "面向墨西哥战略基础设施新机制，说明如何识别项目适用规则、获取文件并按公告指定渠道参与。",
    whatIs: "Proyectos Estratégicos MX 是墨西哥财政与公共信贷部面向战略基础设施投资项目设立的官方公开平台，用于展示和管理新制度下的相关采购与项目程序。它与 Compras MX 是不同入口，参与方式应以每个项目发布的公告和基础文件为准。",
    audience: "基础设施、工程、设备、能源、交通与大型项目供应商",
    quickFacts: [
      { label: "官方平台", value: "Proyectos Estratégicos MX" },
      { label: "主管领域", value: "战略基础设施投资项目" },
      { label: "制度状态", value: "2026年启用的新机制" },
    ],
    sections: [
      {
        id: "process",
        title: "参与流程",
        steps: [
          { title: "从官方平台找到具体项目", detail: "按采购实体、项目名称或编号搜索，打开项目详情，确认程序阶段和当前有效版本。" },
          { title: "先核对参与范围", detail: "查看项目的 Carácter 等字段，确认属于国内、国际或适用国际条约的程序，并判断中国企业能否直接参与。" },
          { title: "下载公告、基础文件与附件", detail: "完整阅读 convocatoria、bases、anexos、技术规格、时间表与所有后续澄清，不要只看公开列表中的摘要字段。" },
          { title: "按该项目指定渠道登记和提交", detail: "新机制下，不应默认 Compras MX 账户或提交路径可以直接通用。以该项目公告列明的平台、邮箱、现场或电子提交渠道为准。" },
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
          "技术方案、进度计划、环境与社会影响、安全和质量文件",
          "经济报价、成本模型及项目公告要求的本地含量或供应链材料",
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
];

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
    name: "哥伦比亚",
    code: "CO",
    description: "SECOP II 电子公共采购项目",
  },
] as const;
