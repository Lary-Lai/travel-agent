/**
 * Agent drawer, chat window, and tool-status rendering.
 *
 * Keys are flat and namespaced with this file's group name, e.g. `agentUi.title`.
 * Every locale must define exactly the same key set — `scripts/verify-i18n.ts`
 * asserts that, and a missing key renders as the key itself so it is visible.
 *
 * Two conventions this file depends on:
 *
 *  - The tool *names* (`searchListings`, `addToWishlist`, …) are identifiers
 *    matched against the server's tool registry, so they stay in English and are
 *    never translated. Only their human-readable labels live here.
 *  - The brand "旅居 Agent" / "旅居 AI 助手" is a product name and stays as
 *    written in every locale, exactly as the auth module does.
 */
export const agentUi = {
  "zh-CN": {
    "agentUi.modelUnavailable": "无法获取 AI 状态",
    "agentUi.modelUnknown": "未配置模型",
    "agentUi.modelLabel": "模型 {name}",
    "agentUi.closeAssistant": "关闭助手",
    "agentUi.openAssistant": "打开 AI 旅行助手",
    "agentUi.modelMissing": "尚未配置可用的 AI 模型：{problem}",
    "agentUi.modelMissingHint": "请在 .env 设置 AI_API_KEY",

    "agentUi.greeting": "你好，我是旅居 AI 助手 👋",
    "agentUi.greetingBody":
      "用一句话告诉我你的旅行需求。我会查询真实房源、比较价格与设施，甚至直接帮你写入心愿单。",
    "agentUi.tryThese": "试试这些：",
    "agentUi.suggestionWishlists": "看看我的心愿单里都有什么。",

    "agentUi.stopGenerating": "停止生成",
    "agentUi.uploadPlan": "上传旅行计划",
    "agentUi.parsing": "解析中…",
    "agentUi.retry": "重试",

    "agentUi.uploadTypeError": "请上传 PDF 或图片（JPG / PNG / WebP）格式的旅行计划",
    "agentUi.uploadSizeError": "文件过大，请上传 8MB 以内的文件",
    "agentUi.parseFailed": "PDF 解析失败",
    "agentUi.parseSuccess": "已解析旅行计划（提取 {count} 个字符）",
    "agentUi.uploadFailed": "PDF 上传失败，请重试",

    "agentUi.uploadPromptIntro": "我上传了一份旅行计划，已解析出以下信息，请据此帮我推荐住宿：",
    "agentUi.uploadPromptDestination": "- 目的地：{value}",
    "agentUi.uploadPromptDays": "- 天数：{count} 天",
    "agentUi.uploadPromptGuests": "- 人数：{count} 人",
    "agentUi.uploadPromptBudget": "- 每晚预算：约 {amount} 元",
    "agentUi.uploadPromptPlaces": "- 计划中的地点：{places}",
    "agentUi.uploadPromptSummary": "- 概述：{summary}",
    "agentUi.uploadPromptAsk": "请先调用 recommendListings 推荐 3 个合适的房源。",
    "agentUi.planUnknownDestination": "未识别",
    "agentUi.placesSeparator": "、",

    "agentUi.requestFailed": "请求失败",
    "agentUi.guestHint": "当前未登录：可以搜索与比较房源，收藏相关操作需要先登录。",
    "agentUi.loginLink": "，去登录",

    "agentUi.toolSearch": "搜索房源",
    "agentUi.toolGetListingDetail": "读取房源详情",
    "agentUi.toolRecommendListings": "生成推荐",
    "agentUi.toolCompareListings": "对比房源",
    "agentUi.toolGetUserWishlists": "读取心愿单",
    "agentUi.toolCreateWishlist": "创建心愿单",
    "agentUi.toolAddToWishlist": "加入心愿单",
    "agentUi.toolRemoveFromWishlist": "移出心愿单",
    "agentUi.toolRunning": "正在{label}…",
    "agentUi.toolFailed": "{label}失败",
    "agentUi.toolError": "工具执行失败",

    "agentUi.summarySearch": "找到 {count} 个房源",
    "agentUi.summaryRecommend": "生成 {count} 个推荐",
    "agentUi.summaryCompare": "对比了 {count} 个房源",
    "agentUi.summaryListingDetail": "已读取房源详情",
    "agentUi.summaryWishlists": "读取到 {count} 个心愿单",
    "agentUi.summaryWishlistCreated": "已创建「{name}」",
    "agentUi.summaryWishlistAdded": "已加入「{name}」",
    "agentUi.summaryWishlistRemoved": "已从「{name}」移除",
    "agentUi.summaryDone": "已完成",

    "agentUi.recommendReason": "推荐理由：{reason}",
    "agentUi.viewDetail": "查看详情",
  },
  "zh-TW": {
    "agentUi.modelUnavailable": "無法取得 AI 狀態",
    "agentUi.modelUnknown": "未設定模型",
    "agentUi.modelLabel": "模型 {name}",
    "agentUi.closeAssistant": "關閉助手",
    "agentUi.openAssistant": "開啟 AI 旅行助手",
    "agentUi.modelMissing": "尚未設定可用的 AI 模型：{problem}",
    "agentUi.modelMissingHint": "請在 .env 設定 AI_API_KEY",

    "agentUi.greeting": "你好，我是旅居 AI 助手 👋",
    "agentUi.greetingBody":
      "用一句話告訴我你的旅行需求。我會查詢真實房源、比較價格與設施，甚至直接幫你寫入心願單。",
    "agentUi.tryThese": "試試這些：",
    "agentUi.suggestionWishlists": "看看我的心願單裡有什麼。",

    "agentUi.stopGenerating": "停止產生",
    "agentUi.uploadPlan": "上傳旅行計畫",
    "agentUi.parsing": "解析中…",
    "agentUi.retry": "重試",

    "agentUi.uploadTypeError": "請上傳 PDF 或圖片（JPG / PNG / WebP）格式的旅行計畫",
    "agentUi.uploadSizeError": "檔案過大，請上傳 8MB 以內的檔案",
    "agentUi.parseFailed": "PDF 解析失敗",
    "agentUi.parseSuccess": "已解析旅行計畫（擷取 {count} 個字元）",
    "agentUi.uploadFailed": "PDF 上傳失敗，請重試",

    "agentUi.uploadPromptIntro": "我上傳了一份旅行計畫，已解析出以下資訊，請據此幫我推薦住宿：",
    "agentUi.uploadPromptDestination": "- 目的地：{value}",
    "agentUi.uploadPromptDays": "- 天數：{count} 天",
    "agentUi.uploadPromptGuests": "- 人數：{count} 人",
    "agentUi.uploadPromptBudget": "- 每晚預算：約 {amount} 元",
    "agentUi.uploadPromptPlaces": "- 計畫中的地點：{places}",
    "agentUi.uploadPromptSummary": "- 概述：{summary}",
    "agentUi.uploadPromptAsk": "請先呼叫 recommendListings 推薦 3 個合適的房源。",
    "agentUi.planUnknownDestination": "未識別",
    "agentUi.placesSeparator": "、",

    "agentUi.requestFailed": "請求失敗",
    "agentUi.guestHint": "目前未登入：可以搜尋與比較房源，收藏相關操作需要先登入。",
    "agentUi.loginLink": "，前往登入",

    "agentUi.toolSearch": "搜尋房源",
    "agentUi.toolGetListingDetail": "讀取房源詳情",
    "agentUi.toolRecommendListings": "產生推薦",
    "agentUi.toolCompareListings": "比較房源",
    "agentUi.toolGetUserWishlists": "讀取心願單",
    "agentUi.toolCreateWishlist": "建立心願單",
    "agentUi.toolAddToWishlist": "加入心願單",
    "agentUi.toolRemoveFromWishlist": "移出心願單",
    "agentUi.toolRunning": "正在{label}…",
    "agentUi.toolFailed": "{label}失敗",
    "agentUi.toolError": "工具執行失敗",

    "agentUi.summarySearch": "找到 {count} 個房源",
    "agentUi.summaryRecommend": "產生 {count} 個推薦",
    "agentUi.summaryCompare": "比較了 {count} 個房源",
    "agentUi.summaryListingDetail": "已讀取房源詳情",
    "agentUi.summaryWishlists": "讀取到 {count} 個心願單",
    "agentUi.summaryWishlistCreated": "已建立「{name}」",
    "agentUi.summaryWishlistAdded": "已加入「{name}」",
    "agentUi.summaryWishlistRemoved": "已從「{name}」移除",
    "agentUi.summaryDone": "已完成",

    "agentUi.recommendReason": "推薦理由：{reason}",
    "agentUi.viewDetail": "查看詳情",
  },
  en: {
    "agentUi.modelUnavailable": "Could not read the AI status",
    "agentUi.modelUnknown": "Model not configured",
    "agentUi.modelLabel": "Model {name}",
    "agentUi.closeAssistant": "Close the assistant",
    "agentUi.openAssistant": "Open the AI travel assistant",
    "agentUi.modelMissing": "No AI model is configured: {problem}",
    "agentUi.modelMissingHint": "Set AI_API_KEY in .env",

    "agentUi.greeting": "Hi, I'm the 旅居 AI assistant 👋",
    "agentUi.greetingBody":
      "Tell me what you need in one sentence. I search real stays, compare prices and amenities, and can add them straight to your wishlist.",
    "agentUi.tryThese": "Try one of these:",
    "agentUi.suggestionWishlists": "What is in my wishlist?",

    "agentUi.stopGenerating": "Stop generating",
    "agentUi.uploadPlan": "Upload a travel plan",
    "agentUi.parsing": "Reading…",
    "agentUi.retry": "Retry",

    "agentUi.uploadTypeError": "Upload your travel plan as a PDF or an image (JPG / PNG / WebP)",
    "agentUi.uploadSizeError": "That file is too large — upload one under 8 MB",
    "agentUi.parseFailed": "Could not read the PDF",
    "agentUi.parseSuccess": "Travel plan read ({count} characters extracted)",
    "agentUi.uploadFailed": "The upload failed — please try again",

    "agentUi.uploadPromptIntro":
      "I uploaded a travel plan and these details were extracted — please recommend stays based on them:",
    "agentUi.uploadPromptDestination": "- Destination: {value}",
    "agentUi.uploadPromptDays": "- Length: {count} days",
    "agentUi.uploadPromptGuests": "- Guests: {count}",
    "agentUi.uploadPromptBudget": "- Budget per night: about ¥{amount}",
    "agentUi.uploadPromptPlaces": "- Planned places: {places}",
    "agentUi.uploadPromptSummary": "- Summary: {summary}",
    "agentUi.uploadPromptAsk": "Call recommendListings first and suggest 3 suitable stays.",
    "agentUi.planUnknownDestination": "not detected",
    "agentUi.placesSeparator": ", ",

    "agentUi.requestFailed": "Request failed",
    "agentUi.guestHint":
      "You are not signed in: you can search and compare stays, but saving needs an account.",
    "agentUi.loginLink": " — log in",

    "agentUi.toolSearch": "Listing search",
    "agentUi.toolGetListingDetail": "Listing details",
    "agentUi.toolRecommendListings": "Recommendations",
    "agentUi.toolCompareListings": "Listing comparison",
    "agentUi.toolGetUserWishlists": "Wishlist lookup",
    "agentUi.toolCreateWishlist": "Wishlist creation",
    "agentUi.toolAddToWishlist": "Add to wishlist",
    "agentUi.toolRemoveFromWishlist": "Remove from wishlist",
    "agentUi.toolRunning": "{label}…",
    "agentUi.toolFailed": "{label} failed",
    "agentUi.toolError": "The tool failed",

    "agentUi.summarySearch": "Found {count} stays",
    "agentUi.summaryRecommend": "{count} recommendations generated",
    "agentUi.summaryCompare": "Compared {count} stays",
    "agentUi.summaryListingDetail": "Listing details loaded",
    "agentUi.summaryWishlists": "{count} wishlists",
    "agentUi.summaryWishlistCreated": "Created “{name}”",
    "agentUi.summaryWishlistAdded": "Added to “{name}”",
    "agentUi.summaryWishlistRemoved": "Removed from “{name}”",
    "agentUi.summaryDone": "Done",

    "agentUi.recommendReason": "Why: {reason}",
    "agentUi.viewDetail": "View details",
  },
  ja: {
    "agentUi.modelUnavailable": "AI の状態を取得できませんでした",
    "agentUi.modelUnknown": "モデル未設定",
    "agentUi.modelLabel": "モデル {name}",
    "agentUi.closeAssistant": "アシスタントを閉じる",
    "agentUi.openAssistant": "AI 旅行アシスタントを開く",
    "agentUi.modelMissing": "利用できる AI モデルが設定されていません：{problem}",
    "agentUi.modelMissingHint": ".env に AI_API_KEY を設定してください",

    "agentUi.greeting": "こんにちは、旅居 AI アシスタントです 👋",
    "agentUi.greetingBody":
      "旅行の希望をひとことで教えてください。実際の宿泊施設を検索し、料金や設備を比較して、お気に入りへの追加までお手伝いします。",
    "agentUi.tryThese": "こんなふうに聞いてみてください：",
    "agentUi.suggestionWishlists": "お気に入りに何が入っているか見せて。",

    "agentUi.stopGenerating": "生成を停止",
    "agentUi.uploadPlan": "旅行プランをアップロード",
    "agentUi.parsing": "読み取り中…",
    "agentUi.retry": "再試行",

    "agentUi.uploadTypeError":
      "旅行プランは PDF または画像（JPG / PNG / WebP）でアップロードしてください",
    "agentUi.uploadSizeError":
      "ファイルが大きすぎます。8MB 以内のファイルをアップロードしてください",
    "agentUi.parseFailed": "PDF の読み取りに失敗しました",
    "agentUi.parseSuccess": "旅行プランを読み取りました（{count} 文字を抽出）",
    "agentUi.uploadFailed": "アップロードに失敗しました。もう一度お試しください",

    "agentUi.uploadPromptIntro":
      "旅行プランをアップロードしました。以下の情報が読み取れたので、これをもとに宿泊施設を提案してください：",
    "agentUi.uploadPromptDestination": "- 目的地：{value}",
    "agentUi.uploadPromptDays": "- 日数：{count} 日",
    "agentUi.uploadPromptGuests": "- 人数：{count} 人",
    "agentUi.uploadPromptBudget": "- 1 泊の予算：約 {amount} 元",
    "agentUi.uploadPromptPlaces": "- 予定している場所：{places}",
    "agentUi.uploadPromptSummary": "- 概要：{summary}",
    "agentUi.uploadPromptAsk":
      "まず recommendListings を呼び出して、適した宿泊施設を 3 件提案してください。",
    "agentUi.planUnknownDestination": "未検出",
    "agentUi.placesSeparator": "、",

    "agentUi.requestFailed": "リクエストに失敗しました",
    "agentUi.guestHint":
      "未ログインです：宿泊施設の検索と比較はできますが、保存にはログインが必要です。",
    "agentUi.loginLink": "。ログイン",

    "agentUi.toolSearch": "宿泊施設の検索",
    "agentUi.toolGetListingDetail": "宿泊施設の詳細",
    "agentUi.toolRecommendListings": "おすすめの生成",
    "agentUi.toolCompareListings": "宿泊施設の比較",
    "agentUi.toolGetUserWishlists": "お気に入りの取得",
    "agentUi.toolCreateWishlist": "お気に入りの作成",
    "agentUi.toolAddToWishlist": "お気に入りに追加",
    "agentUi.toolRemoveFromWishlist": "お気に入りから削除",
    "agentUi.toolRunning": "{label}中…",
    "agentUi.toolFailed": "{label}に失敗しました",
    "agentUi.toolError": "ツールの実行に失敗しました",

    "agentUi.summarySearch": "{count} 件の宿泊施設が見つかりました",
    "agentUi.summaryRecommend": "おすすめを {count} 件生成しました",
    "agentUi.summaryCompare": "{count} 件の宿泊施設を比較しました",
    "agentUi.summaryListingDetail": "宿泊施設の詳細を読み取りました",
    "agentUi.summaryWishlists": "お気に入りを {count} 件取得しました",
    "agentUi.summaryWishlistCreated": "「{name}」を作成しました",
    "agentUi.summaryWishlistAdded": "「{name}」に追加しました",
    "agentUi.summaryWishlistRemoved": "「{name}」から削除しました",
    "agentUi.summaryDone": "完了しました",

    "agentUi.recommendReason": "おすすめの理由：{reason}",
    "agentUi.viewDetail": "詳細を見る",
  },
  ko: {
    "agentUi.modelUnavailable": "AI 상태를 가져오지 못했습니다",
    "agentUi.modelUnknown": "모델 미설정",
    "agentUi.modelLabel": "모델 {name}",
    "agentUi.closeAssistant": "도우미 닫기",
    "agentUi.openAssistant": "AI 여행 도우미 열기",
    "agentUi.modelMissing": "사용할 수 있는 AI 모델이 설정되지 않았습니다: {problem}",
    "agentUi.modelMissingHint": ".env에 AI_API_KEY를 설정하세요",

    "agentUi.greeting": "안녕하세요, 旅居 AI 도우미입니다 👋",
    "agentUi.greetingBody":
      "여행 요구 사항을 한 문장으로 알려주세요. 실제 숙소를 검색하고 가격과 편의 시설을 비교하며, 위시리스트에 바로 추가해 드릴 수도 있습니다.",
    "agentUi.tryThese": "이렇게 물어보세요:",
    "agentUi.suggestionWishlists": "내 위시리스트에 뭐가 있는지 보여 줘.",

    "agentUi.stopGenerating": "생성 중지",
    "agentUi.uploadPlan": "여행 계획 업로드",
    "agentUi.parsing": "분석 중…",
    "agentUi.retry": "다시 시도",

    "agentUi.uploadTypeError": "여행 계획은 PDF 또는 이미지(JPG / PNG / WebP)로 업로드해 주세요",
    "agentUi.uploadSizeError": "파일이 너무 큽니다. 8MB 이하 파일을 업로드해 주세요",
    "agentUi.parseFailed": "PDF 분석에 실패했습니다",
    "agentUi.parseSuccess": "여행 계획을 분석했습니다 ({count}자 추출)",
    "agentUi.uploadFailed": "업로드에 실패했습니다. 다시 시도해 주세요",

    "agentUi.uploadPromptIntro":
      "여행 계획을 업로드했고 다음 정보를 분석했습니다. 이를 바탕으로 숙소를 추천해 주세요:",
    "agentUi.uploadPromptDestination": "- 목적지: {value}",
    "agentUi.uploadPromptDays": "- 일수: {count}일",
    "agentUi.uploadPromptGuests": "- 인원: {count}명",
    "agentUi.uploadPromptBudget": "- 1박 예산: 약 {amount} 위안",
    "agentUi.uploadPromptPlaces": "- 계획 중인 장소: {places}",
    "agentUi.uploadPromptSummary": "- 요약: {summary}",
    "agentUi.uploadPromptAsk": "먼저 recommendListings를 호출해 적합한 숙소 3곳을 추천해 주세요.",
    "agentUi.planUnknownDestination": "인식되지 않음",
    "agentUi.placesSeparator": ", ",

    "agentUi.requestFailed": "요청 실패",
    "agentUi.guestHint":
      "로그인하지 않은 상태입니다: 숙소 검색과 비교는 가능하지만 저장하려면 로그인이 필요합니다.",
    "agentUi.loginLink": ". 로그인",

    "agentUi.toolSearch": "숙소 검색",
    "agentUi.toolGetListingDetail": "숙소 상세 정보",
    "agentUi.toolRecommendListings": "추천 생성",
    "agentUi.toolCompareListings": "숙소 비교",
    "agentUi.toolGetUserWishlists": "위시리스트 조회",
    "agentUi.toolCreateWishlist": "위시리스트 만들기",
    "agentUi.toolAddToWishlist": "위시리스트에 추가",
    "agentUi.toolRemoveFromWishlist": "위시리스트에서 제거",
    "agentUi.toolRunning": "{label} 중…",
    "agentUi.toolFailed": "{label} 실패",
    "agentUi.toolError": "도구 실행 실패",

    "agentUi.summarySearch": "숙소 {count}곳을 찾았습니다",
    "agentUi.summaryRecommend": "추천 {count}개를 생성했습니다",
    "agentUi.summaryCompare": "숙소 {count}곳을 비교했습니다",
    "agentUi.summaryListingDetail": "숙소 상세 정보를 불러왔습니다",
    "agentUi.summaryWishlists": "위시리스트 {count}개를 불러왔습니다",
    "agentUi.summaryWishlistCreated": "“{name}” 생성 완료",
    "agentUi.summaryWishlistAdded": "“{name}”에 추가 완료",
    "agentUi.summaryWishlistRemoved": "“{name}”에서 제거 완료",
    "agentUi.summaryDone": "완료",

    "agentUi.recommendReason": "추천 이유: {reason}",
    "agentUi.viewDetail": "상세 보기",
  },
  es: {
    "agentUi.modelUnavailable": "No se pudo leer el estado de la IA",
    "agentUi.modelUnknown": "Modelo no configurado",
    "agentUi.modelLabel": "Modelo {name}",
    "agentUi.closeAssistant": "Cerrar el asistente",
    "agentUi.openAssistant": "Abrir el asistente de viajes con IA",
    "agentUi.modelMissing": "No hay ningún modelo de IA configurado: {problem}",
    "agentUi.modelMissingHint": "Define AI_API_KEY en .env",

    "agentUi.greeting": "Hola, soy el asistente de IA de 旅居 👋",
    "agentUi.greetingBody":
      "Cuéntame en una frase qué necesitas. Busco alojamientos reales, comparo precios y servicios, y puedo añadirlos directamente a tus favoritos.",
    "agentUi.tryThese": "Prueba con esto:",
    "agentUi.suggestionWishlists": "¿Qué hay en mi lista de favoritos?",

    "agentUi.stopGenerating": "Detener la generación",
    "agentUi.uploadPlan": "Subir un plan de viaje",
    "agentUi.parsing": "Leyendo…",
    "agentUi.retry": "Reintentar",

    "agentUi.uploadTypeError": "Sube el plan de viaje en PDF o como imagen (JPG / PNG / WebP)",
    "agentUi.uploadSizeError": "El archivo es demasiado grande: sube uno de menos de 8 MB",
    "agentUi.parseFailed": "No se pudo leer el PDF",
    "agentUi.parseSuccess": "Plan de viaje leído ({count} caracteres extraídos)",
    "agentUi.uploadFailed": "La subida falló. Inténtalo de nuevo",

    "agentUi.uploadPromptIntro":
      "He subido un plan de viaje y se ha extraído esta información; recomiéndame alojamientos a partir de ella:",
    "agentUi.uploadPromptDestination": "- Destino: {value}",
    "agentUi.uploadPromptDays": "- Duración: {count} días",
    "agentUi.uploadPromptGuests": "- Personas: {count}",
    "agentUi.uploadPromptBudget": "- Presupuesto por noche: unos {amount} ¥",
    "agentUi.uploadPromptPlaces": "- Lugares previstos: {places}",
    "agentUi.uploadPromptSummary": "- Resumen: {summary}",
    "agentUi.uploadPromptAsk":
      "Llama primero a recommendListings y recomienda 3 alojamientos adecuados.",
    "agentUi.planUnknownDestination": "sin detectar",
    "agentUi.placesSeparator": ", ",

    "agentUi.requestFailed": "La solicitud falló",
    "agentUi.guestHint":
      "No has iniciado sesión: puedes buscar y comparar alojamientos, pero guardar requiere una cuenta.",
    "agentUi.loginLink": " — iniciar sesión",

    "agentUi.toolSearch": "Búsqueda de alojamientos",
    "agentUi.toolGetListingDetail": "Detalles del alojamiento",
    "agentUi.toolRecommendListings": "Recomendaciones",
    "agentUi.toolCompareListings": "Comparación de alojamientos",
    "agentUi.toolGetUserWishlists": "Consulta de favoritos",
    "agentUi.toolCreateWishlist": "Creación de favoritos",
    "agentUi.toolAddToWishlist": "Añadir a favoritos",
    "agentUi.toolRemoveFromWishlist": "Quitar de favoritos",
    "agentUi.toolRunning": "{label}…",
    "agentUi.toolFailed": "Error: {label}",
    "agentUi.toolError": "La herramienta falló",

    "agentUi.summarySearch": "Se encontraron {count} alojamientos",
    "agentUi.summaryRecommend": "{count} recomendaciones generadas",
    "agentUi.summaryCompare": "Se compararon {count} alojamientos",
    "agentUi.summaryListingDetail": "Detalles del alojamiento cargados",
    "agentUi.summaryWishlists": "{count} listas de favoritos",
    "agentUi.summaryWishlistCreated": "Se creó “{name}”",
    "agentUi.summaryWishlistAdded": "Añadido a “{name}”",
    "agentUi.summaryWishlistRemoved": "Quitado de “{name}”",
    "agentUi.summaryDone": "Listo",

    "agentUi.recommendReason": "Por qué: {reason}",
    "agentUi.viewDetail": "Ver detalles",
  },
} as const;
