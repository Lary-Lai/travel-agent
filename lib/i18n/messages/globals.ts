/**
 * Footer, error/not-found pages, theme toggle, misc shared UI.
 *
 * Keys are flat and namespaced with this file's group name, e.g. `globals.title`.
 * Every locale must define exactly the same key set — `scripts/verify-i18n.ts`
 * asserts that, and a missing key renders as the key itself so it is visible.
 *
 * Scope note: this is the catch-all group. Anything that already has a home in
 * the main dictionary is reused from there instead of being repeated here — the
 * footer's "关于" column is `footer.about`, its wishlist/trips/login/sign-up
 * links are `nav.wishlist` / `nav.trips` / `common.login` / `common.register`,
 * its search link is `nav.search`, and the home page's personalised-destination
 * copy is `home.personalised*`. Only genuinely new copy lives in this module.
 *
 * The product name in `globals.brand` is a brand: it is deliberately identical
 * in all six locales (the header renders the same string as a literal for the
 * same reason). It is a key rather than a literal so the title, the footer brand
 * and the copyright line cannot drift apart.
 */
export const globals = {
  "zh-CN": {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "AI 旅游住宿平台",
    "globals.metaDescription":
      "AI 驱动的旅游住宿平台：搜索真实房源、收藏心愿单、完成预订，并用自然语言让 AI Agent 帮你找房、比较与下单。",

    "globals.themeLight": "浅色",
    "globals.themeDark": "深色",
    "globals.themeSystem": "跟随系统",
    "globals.themeToggle": "切换主题",

    "globals.footerExplore": "探索",
    "globals.footerMySpace": "我的空间",
    "globals.footerGuide": "AI Agent 用法",
    "globals.footerCityTokyo": "东京房源",
    "globals.footerCityParis": "巴黎房源",
    "globals.footerCityLondon": "伦敦房源",
    "globals.footerCityNewYork": "纽约房源",
    "globals.footerBlurb":
      "AI 驱动的旅游住宿平台。真实数据库驱动的房源搜索，加上一个真正参与业务流程的 AI Travel Agent。",
    "globals.footerDisclaimer": "课程演示项目，不接入真实支付",

    "globals.errorTitle": "出了点问题",
    "globals.errorBody": "数据加载失败，请稍后重试。",
    "globals.reload": "重新加载",
    "globals.retry": "重试",
    "globals.backHome": "返回首页",

    "globals.notFoundTitle": "找不到这个页面",
    "globals.notFoundMetaTitle": "页面不存在",
    "globals.notFoundBody": "你要查看的房源可能已经下架，或者链接不正确。",
    "globals.goSearch": "去搜索房源",

    "globals.errorPageTitle": "页面出错了",
    "globals.errorPageBodyLead":
      "渲染这个页面时发生了错误。如果是数据库相关的错误，请确认 PostgreSQL 已启动（",
    "globals.errorPageBodyTail": "）。",

    "globals.chipRemove": "移除 {value}",
    "globals.chipLimit": "已达上限 {max} 项",
    "globals.chipAdd": "添加{label}",
  },

  "zh-TW": {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "AI 旅遊住宿平台",
    "globals.metaDescription":
      "AI 驅動的旅遊住宿平台：搜尋真實房源、收藏心願單、完成預訂，並用自然語言讓 AI Agent 幫你找房、比較與下單。",

    "globals.themeLight": "淺色",
    "globals.themeDark": "深色",
    "globals.themeSystem": "跟隨系統",
    "globals.themeToggle": "切換主題",

    "globals.footerExplore": "探索",
    "globals.footerMySpace": "我的空間",
    "globals.footerGuide": "AI Agent 用法",
    "globals.footerCityTokyo": "東京房源",
    "globals.footerCityParis": "巴黎房源",
    "globals.footerCityLondon": "倫敦房源",
    "globals.footerCityNewYork": "紐約房源",
    "globals.footerBlurb":
      "AI 驅動的旅遊住宿平台。真實資料庫驅動的房源搜尋，加上一個真正參與業務流程的 AI Travel Agent。",
    "globals.footerDisclaimer": "課程示範專案，不接入真實支付",

    "globals.errorTitle": "出了點問題",
    "globals.errorBody": "資料載入失敗，請稍後重試。",
    "globals.reload": "重新載入",
    "globals.retry": "重試",
    "globals.backHome": "返回首頁",

    "globals.notFoundTitle": "找不到這個頁面",
    "globals.notFoundMetaTitle": "頁面不存在",
    "globals.notFoundBody": "你要查看的房源可能已經下架，或者連結不正確。",
    "globals.goSearch": "去搜尋房源",

    "globals.errorPageTitle": "頁面出錯了",
    "globals.errorPageBodyLead":
      "渲染這個頁面時發生了錯誤。如果是資料庫相關的錯誤，請確認 PostgreSQL 已啟動（",
    "globals.errorPageBodyTail": "）。",

    "globals.chipRemove": "移除 {value}",
    "globals.chipLimit": "已達上限 {max} 項",
    "globals.chipAdd": "新增{label}",
  },

  en: {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "AI stay booking platform",
    "globals.metaDescription":
      "An AI-powered travel stay platform: search real listings, save a wishlist, complete a booking, and let the AI agent find, compare and book for you in plain language.",

    "globals.themeLight": "Light",
    "globals.themeDark": "Dark",
    "globals.themeSystem": "System",
    "globals.themeToggle": "Toggle theme",

    "globals.footerExplore": "Explore",
    "globals.footerMySpace": "My space",
    "globals.footerGuide": "How to use the AI agent",
    "globals.footerCityTokyo": "Stays in Tokyo",
    "globals.footerCityParis": "Stays in Paris",
    "globals.footerCityLondon": "Stays in London",
    "globals.footerCityNewYork": "Stays in New York",
    "globals.footerBlurb":
      "An AI-powered travel stay platform. Listing search backed by a real database, plus an AI Travel Agent that genuinely takes part in the booking flow.",
    "globals.footerDisclaimer": "Course demo project, no real payments",

    "globals.errorTitle": "Something went wrong",
    "globals.errorBody": "We couldn't load the data. Please try again in a moment.",
    "globals.reload": "Reload",
    "globals.retry": "Try again",
    "globals.backHome": "Back to home",

    "globals.notFoundTitle": "We can't find this page",
    "globals.notFoundMetaTitle": "Page not found",
    "globals.notFoundBody":
      "The stay you were looking for may no longer be listed, or the link may be incorrect.",
    "globals.goSearch": "Search stays",

    "globals.errorPageTitle": "This page ran into an error",
    "globals.errorPageBodyLead":
      "Something went wrong while rendering this page. If it is a database error, check that PostgreSQL is running (",
    "globals.errorPageBodyTail": ").",

    "globals.chipRemove": "Remove {value}",
    "globals.chipLimit": "Limit of {max} reached",
    "globals.chipAdd": "Add {label}",
  },

  ja: {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "AI 宿泊予約プラットフォーム",
    "globals.metaDescription":
      "AI が支える宿泊予約プラットフォーム。実際の宿泊先を検索し、お気に入りに保存し、予約まで完了。自然な言葉で AI エージェントに検索・比較・予約を任せられます。",

    "globals.themeLight": "ライト",
    "globals.themeDark": "ダーク",
    "globals.themeSystem": "システム",
    "globals.themeToggle": "テーマを切り替え",

    "globals.footerExplore": "探す",
    "globals.footerMySpace": "マイスペース",
    "globals.footerGuide": "AI エージェントの使い方",
    "globals.footerCityTokyo": "東京の宿",
    "globals.footerCityParis": "パリの宿",
    "globals.footerCityLondon": "ロンドンの宿",
    "globals.footerCityNewYork": "ニューヨークの宿",
    "globals.footerBlurb":
      "AI が支える旅行・宿泊プラットフォーム。実際のデータベースから宿を検索でき、業務の流れに本当に参加する AI Travel Agent も備えています。",
    "globals.footerDisclaimer": "講座用のデモプロジェクトで、実際の支払いは発生しません",

    "globals.errorTitle": "問題が発生しました",
    "globals.errorBody": "データを読み込めませんでした。しばらくしてからもう一度お試しください。",
    "globals.reload": "再読み込み",
    "globals.retry": "再試行",
    "globals.backHome": "ホームに戻る",

    "globals.notFoundTitle": "ページが見つかりません",
    "globals.notFoundMetaTitle": "ページが存在しません",
    "globals.notFoundBody":
      "ご覧になろうとした宿泊先は掲載が終了したか、リンクが正しくない可能性があります。",
    "globals.goSearch": "宿を探す",

    "globals.errorPageTitle": "ページでエラーが発生しました",
    "globals.errorPageBodyLead":
      "このページの描画中にエラーが発生しました。データベース関連のエラーであれば、PostgreSQL が起動しているか確認してください（",
    "globals.errorPageBodyTail": "）。",

    "globals.chipRemove": "{value} を削除",
    "globals.chipLimit": "上限 {max} 件に達しました",
    "globals.chipAdd": "{label} を追加",
  },

  ko: {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "AI 숙소 예약 플랫폼",
    "globals.metaDescription":
      "AI 기반 여행 숙소 플랫폼입니다. 실제 숙소를 검색하고, 위시리스트에 저장하고, 예약까지 완료하세요. 자연어로 AI 에이전트에게 검색, 비교, 예약을 맡길 수 있습니다.",

    "globals.themeLight": "라이트",
    "globals.themeDark": "다크",
    "globals.themeSystem": "시스템",
    "globals.themeToggle": "테마 전환",

    "globals.footerExplore": "둘러보기",
    "globals.footerMySpace": "내 공간",
    "globals.footerGuide": "AI 에이전트 사용법",
    "globals.footerCityTokyo": "도쿄 숙소",
    "globals.footerCityParis": "파리 숙소",
    "globals.footerCityLondon": "런던 숙소",
    "globals.footerCityNewYork": "뉴욕 숙소",
    "globals.footerBlurb":
      "AI 기반 여행 숙소 플랫폼입니다. 실제 데이터베이스로 숙소를 검색하고, 예약 흐름에 실제로 참여하는 AI Travel Agent가 함께합니다.",
    "globals.footerDisclaimer": "강의 시연 프로젝트이며 실제 결제는 없습니다",

    "globals.errorTitle": "문제가 발생했습니다",
    "globals.errorBody": "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    "globals.reload": "다시 불러오기",
    "globals.retry": "다시 시도",
    "globals.backHome": "홈으로 돌아가기",

    "globals.notFoundTitle": "페이지를 찾을 수 없습니다",
    "globals.notFoundMetaTitle": "페이지가 존재하지 않습니다",
    "globals.notFoundBody": "보려는 숙소가 내려갔거나 링크가 올바르지 않을 수 있습니다.",
    "globals.goSearch": "숙소 검색하기",

    "globals.errorPageTitle": "페이지에 오류가 발생했습니다",
    "globals.errorPageBodyLead":
      "이 페이지를 렌더링하는 중 오류가 발생했습니다. 데이터베이스 관련 오류라면 PostgreSQL이 실행 중인지 확인하세요 (",
    "globals.errorPageBodyTail": ").",

    "globals.chipRemove": "{value} 삭제",
    "globals.chipLimit": "최대 {max}개에 도달했습니다",
    "globals.chipAdd": "{label} 추가",
  },

  es: {
    "globals.brand": "旅居 Agent",

    "globals.metaTitle": "Plataforma de reservas con IA",
    "globals.metaDescription":
      "Una plataforma de alojamiento impulsada por IA: busca alojamientos reales, guarda favoritos, completa una reserva y deja que el agente de IA busque, compare y reserve por ti en lenguaje natural.",

    "globals.themeLight": "Claro",
    "globals.themeDark": "Oscuro",
    "globals.themeSystem": "Sistema",
    "globals.themeToggle": "Cambiar tema",

    "globals.footerExplore": "Explorar",
    "globals.footerMySpace": "Mi espacio",
    "globals.footerGuide": "Cómo usar el agente de IA",
    "globals.footerCityTokyo": "Alojamientos en Tokio",
    "globals.footerCityParis": "Alojamientos en París",
    "globals.footerCityLondon": "Alojamientos en Londres",
    "globals.footerCityNewYork": "Alojamientos en Nueva York",
    "globals.footerBlurb":
      "Una plataforma de alojamiento impulsada por IA. Búsqueda de alojamientos sobre una base de datos real, más un AI Travel Agent que participa de verdad en el proceso de reserva.",
    "globals.footerDisclaimer": "Proyecto de demostración del curso, sin pagos reales",

    "globals.errorTitle": "Algo ha salido mal",
    "globals.errorBody": "No se pudieron cargar los datos. Vuelve a intentarlo en un momento.",
    "globals.reload": "Volver a cargar",
    "globals.retry": "Reintentar",
    "globals.backHome": "Volver al inicio",

    "globals.notFoundTitle": "No encontramos esta página",
    "globals.notFoundMetaTitle": "Página no encontrada",
    "globals.notFoundBody":
      "Es posible que el alojamiento que buscabas ya no esté disponible o que el enlace no sea correcto.",
    "globals.goSearch": "Buscar alojamientos",

    "globals.errorPageTitle": "Esta página ha fallado",
    "globals.errorPageBodyLead":
      "Se produjo un error al renderizar esta página. Si está relacionado con la base de datos, comprueba que PostgreSQL esté en marcha (",
    "globals.errorPageBodyTail": ").",

    "globals.chipRemove": "Quitar {value}",
    "globals.chipLimit": "Límite de {max} alcanzado",
    "globals.chipAdd": "Añadir {label}",
  },
} as const;
