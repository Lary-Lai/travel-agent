# 旅居 Agent · AI Travel Agent 旅游住宿平台

一个 Airbnb 风格的旅游住宿平台，在完整的住宿业务之上，加入了一个**真正参与业务流程**的 AI Travel Agent。

AI 不是一个单独的聊天机器人：它会调用真实的工具，工具连接真实的 Service 层，Service 读写真实的 PostgreSQL 数据库，最终把结果变成界面上的房源卡片和已写入的心愿单。

---

## 一、项目介绍

### 产品定位

面向中文用户的短租/住宿预订平台。用户搜索房源、查看详情、计算价格、完成预订、按主题收藏；AI Agent 则用自然语言接管这些操作。

平台内置 **6 座城市 · 72 套真实结构化房源**（东京、巴黎、伦敦、纽约、新加坡、首尔），数据全部来自数据库，前端没有任何硬编码的房源数据。

### 三条核心业务链

| 业务链 | 流程 |
| --- | --- |
| **住宿平台** | 首页 → 搜索 → 房源列表 → 房源详情 → 收藏 → 心愿单 |
| **预订系统** | 房源 → 日期/人数 → 价格计算 → 确认预订 → 生成订单 → **收银台支付** → Trips → **取消与退款** |
| **AI Agent** | 自然语言需求 → LLM → Tool Calling → Service → PostgreSQL → 返回真实数据 → UI 展示/执行操作 |

### 收银台（模拟支付）

订单创建后状态为**待支付（PENDING）**，并自动跳转到 `/payment/[bookingId]` 收银台，提供三种支付方式：

| 支付方式 | 页面内容 |
| --- | --- |
| **微信支付** | 品牌绿配色、演示二维码、15 分钟倒计时与「已失效」刷新 |
| **支付宝** | 品牌蓝配色、演示二维码、同样的倒计时逻辑 |
| **银行卡** | 卡片预览（随卡号实时切换卡种与配色）+ 卡号 / 有效期 / 安全码 / 持卡人表单，卡号用 **Luhn 算法**做前端校验 |

支付成功后订单转为**已确认（CONFIRMED）**，并记录支付方式、支付时间与模拟交易号，成功页会完整展示这些信息；Trips 页面则显示「待支付」标签与「去支付」入口。

> **不接入真实支付网关**：二维码是**不可扫描的装饰图案**（既然没有网关，生成一个真码反而会误导用户）；卡号仅在前端做格式校验，**不会被发送或存储**。页面上明确标注"演示环境，不产生真实扣款"。

### 取消与退款

**已支付**的订单被取消时，会按取消政策生成一条**真实的退款记录**（而不是让钱凭空消失）。取消确认弹窗会先向服务端**查询报价**，把每一项退款金额摊开给用户看，再让用户确认：

| 取消时间（距入住） | 房费 | 清洁费 | 服务费 | 结果 |
| --- | --- | --- | --- | --- |
| ≥ 7 天 | 全额 | 全额 | 全额 | 全额退款 |
| 3 – 6 天 | 50% | 全额 | 不退 | 部分退款 |
| ≤ 2 天 | 不退 | 不退 | 不退 | 不可退款 |

清洁费在最后一刻之前都全额退还（服务根本没有发生），平台服务费不退 —— 这是主流预订平台的通行结构。

退款走自己的状态机，与真实渠道的异步到账一致：

```
取消已支付订单 → PROCESSING（退款处理中，预计 1-3 个工作日）
                      │
              渠道结算 ├──► SUCCEEDED（退款成功，记录到账时间）
                      └──► FAILED（退款失败）
```

退款**原路退回**到下单时使用的渠道（微信 / 支付宝 / 银行卡），并带独立退款单号。Trips 页面会展示退款档次、金额、去向渠道、退款单号与到账时间。

> 演示环境提供「模拟退款到账」按钮来推进 `PROCESSING → SUCCEEDED`，否则永远看不到退款完成。真实的退款是异步的，这一点在状态机里如实保留。

### AI Agent 特色

- **真实 Tool Calling**：LLM 通过 AI SDK 的 `tool()` 机制决定调用哪个工具、传什么参数，而不是关键词匹配。
- **8 个真实工具**，覆盖搜索、详情、推荐、比较、心愿单读写。
- **多步工具循环**：一次用户输入内可以连续调用多个工具（搜索 → 读详情 → 比较 → 写入心愿单），由 `stopWhen(stepCountIs(8))` 驱动。
- **写入型工具**：Agent 可以真正创建心愿单、增删收藏，并直接把数据写入 PostgreSQL。
- **指代消解**：服务端保存短期会话记忆，所以"把**刚才推荐的第一个**房源加入心愿单"可以正确解析。
- **流式输出 + Tool 执行状态**：界面实时显示"正在搜索房源…"、"✓ 找到 6 个房源"等步骤。
- **PDF 旅行计划解析**：上传 PDF → 提取文字 → LLM 结构化 → 交给 Agent 继续推荐住宿。

> **设计红线**：Agent 永远不直接访问数据库。所有工具都调用 `server/` 下的 Service 层，与 REST API 共用同一套业务逻辑和权限校验。

---

## 二、技术栈

| 层次 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16.3.6（App Router, Turbopack）、React 19.2、TypeScript 5 |
| 样式 | Tailwind CSS v4（CSS-first）、shadcn/ui（radix）、Lucide React、Framer Motion |
| 客户端状态 | Zustand（UI 状态）、TanStack Query v5（服务端数据） |
| 后端 | Next.js Route Handlers、Service Layer、REST API |
| 数据库 | **PostgreSQL 18.4**（真实实例）、Prisma ORM 7.10 + `@prisma/adapter-pg` |
| 认证 | JWT（`jose`）存于 HttpOnly Cookie + bcrypt 密码哈希 |
| AI | AI SDK v7、`@ai-sdk/openai-compatible`、Tool Calling、Streaming |
| 文件处理 | `unpdf`（PDF 文本提取）+ LLM 结构化解析 |
| 工程 | ESLint、Prettier、npm、Git |

### 关于认证方案的说明

需求说明中允许「Auth.js **或**安全的 Session/JWT 机制」。本项目采用后者：

- Agent 需要在 Route Handler 内**服务端**确定当前用户身份，且绝不接受前端传入的 `userId`；
- 自己实现的 `jose` HS256 会话（约 100 行）链路短、可审计、行为完全可控；
- 已安装的 `next-auth@5` beta 在 Next 16 + Prisma 7 组合下需要额外的 adapter 与配置成本。

因此使用 `lib/auth.ts` 中的自研会话机制，安全属性（HttpOnly、SameSite=Lax、生产环境 Secure、算法固定）均已落实，并且每次请求都会重新查库确认用户仍然存在。

---

## 三、环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

```env
# ===== 数据库 =====
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/travel_agent?schema=public"

# ===== 认证 =====
AUTH_SECRET="用 node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" 生成"
AUTH_TRUST_HOST=true

# ===== AI（任意 OpenAI 兼容端点） =====
AI_API_KEY="你的 API Key"
AI_BASE_URL="https://api.deepseek.com/v1"
AI_MODEL="deepseek-chat"
```

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串。默认指向项目自带的嵌入式实例（端口 55432） |
| `AUTH_SECRET` | 会话 JWT 签名密钥，**必须**至少 16 字符，否则启动即报错 |
| `AI_API_KEY` | 模型 API Key。留空时 Agent 会明确提示"未配置模型"，其余功能不受影响 |
| `AI_BASE_URL` | OpenAI 兼容的 API 根地址。默认 `https://api.deepseek.com/v1` |
| `AI_MODEL` | 模型名。默认 `deepseek-chat`（**需支持 function calling**，`deepseek-reasoner` 不支持工具调用） |

其他已验证可用的组合：OpenAI `gpt-4o-mini`、Agnes `agnes-2.5-flash`。只要端点兼容 OpenAI Chat Completions 且模型支持 function calling 即可。

`AUTH_SECRET` 生成命令：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 四、启动方式

本项目**自带嵌入式 PostgreSQL**，无需预先安装数据库，也不需要管理员权限。

```bash
# 1. 安装依赖
npm install

# 2. 启动数据库（首次会自动 initdb 建库，数据存放在 ./data/pgdata）
npm run db:start

# 3. 应用数据库迁移
npx prisma migrate dev

# 4. 生成演示数据（72 套房源 / 6 座城市 / 26 项设施）
npx prisma db seed

# 5. 生成 Prisma Client（迁移时通常已自动执行）
npm run db:generate

# 6. 启动开发服务器
npm run dev
```

打开 <http://localhost:3000>。

> 也可以一步完成第 2–4 步：`npm run setup`

### 演示账号

```
邮箱：demo@travel-agent.dev
密码：Demo1234
```

该账号预置两个心愿单：**东京旅行**（3 套房源）与**欧洲之旅**（2 套房源）。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 |
| `npm run db:start` / `db:stop` / `db:status` | 启动 / 停止 / 查看嵌入式 PostgreSQL |
| `npm run db:ping` | 测试数据库连通性 |
| `npm run db:psql -- "select 1"` | 执行一条 SQL（注意：该发行包不含 psql.exe，此命令走 `pg` 驱动） |
| `npm run db:reset` | **删除**全部本地数据 |
| `npm run db:seed` | 重新生成演示数据 |
| `npm run db:studio` | 打开 Prisma Studio |

### 回归测试

```bash
npx tsx scripts/verify-db.ts     # 数据库：枚举、CRUD、唯一约束、级联删除
node scripts/smoke-api.mjs       # API：63 项断言，含跨用户越权测试（需先 npm run dev）
npx tsx scripts/verify-tools.ts  # Agent 工具：45 项断言，含真实写入校验
node scripts/verify-ai.mjs       # AI 端点：连通性 + 流式 + ★function calling 能力
node scripts/smoke-agent.mjs     # Agent 端到端：26 项断言，真实模型驱动（需先 npm run dev）
npx tsx scripts/inspect.ts       # 查看种子数据分布
node scripts/make-test-pdf.mjs   # 生成用于测试 PDF 解析的示例文件
```

当前实测结果（全部通过）：

| 脚本 | 结果 |
| --- | --- |
| `verify-db.ts` | ✅ ALL CHECKS PASSED |
| `smoke-api.mjs` | ✅ **134 / 134** |
| `verify-tools.ts` | ✅ **45 / 45** |
| `verify-ai.mjs` | ✅ chat + tool calling OK |
| `smoke-agent.mjs` | ✅ **26 / 26** |

---

## 五、项目结构

```
travel-agent/
├── app/                          # 页面与 API（Next.js App Router）
│   ├── page.tsx                  # 首页：Hero + 搜索 + 分类 + 热门目的地 + 推荐房源
│   ├── search/page.tsx           # 搜索结果页（URL 即状态）
│   ├── listings/[id]/page.tsx    # 房源详情：画廊、设施、房东、预订面板
│   ├── wishlist/page.tsx         # 我的心愿单
│   ├── trips/page.tsx            # 我的行程
│   ├── login/ · register/        # 登录 / 注册
│   ├── error.tsx · not-found.tsx # 错误边界
│   └── api/                      # Route Handlers
│       ├── listings/             #   GET 搜索 / GET 详情
│       ├── wishlists/            #   心愿单 CRUD + items 增删
│       ├── bookings/             #   订单创建 / 列表 / 取消 / [id]/pay 支付
│       │                         #   [id]/refund-quote 退款报价
│       ├── refunds/              #   [id]/settle 模拟退款到账
│       ├── auth/                 #   register / login / logout / session
│       ├── saved/                #   当前用户已收藏的房源 id
│       ├── meta/                 #   目的地、设施字典、价格区间
│       └── agent/                #   POST 流式 Agent；upload 解析 PDF
│
├── components/                   # UI 组件
│   ├── listing-card.tsx          #   房源卡片（图片/名称/位置/类型/评分/评价/价格/收藏）
│   ├── search-bar.tsx            #   目的地 + 日期区间 + 人数
│   ├── filter-panel.tsx          #   价格滑块 / 类型 / 设施 / 人数
│   ├── booking-widget.tsx        #   预订面板 + 价格明细
│   ├── payment-panel.tsx         #   收银台：三种支付方式 + 订单摘要 + 成功页
│   ├── cancel-booking-dialog.tsx #   取消确认：退款报价 + 逐项明细 + 取消政策表
│   ├── qr-placeholder.tsx        #   确定性伪二维码 SVG（不可扫描，仅装饰）
│   ├── listing-gallery.tsx       #   图片画廊 + 灯箱
│   ├── agent-drawer.tsx          #   悬浮按钮 + 侧边抽屉
│   ├── agent-chat.tsx            #   对话窗口（流式、Tool 状态、上传）
│   ├── agent-message.tsx         #   工具执行状态渲染
│   ├── agent-listing-card.tsx    #   Agent 结果房源卡片
│   ├── agent-provider.tsx        #   承载会话状态（关闭抽屉不丢历史）
│   ├── session-provider.tsx      #   当前用户上下文
│   ├── save-to-wishlist-dialog.tsx
│   ├── wishlist-view.tsx · trips-view.tsx
│   ├── providers.tsx             #   QueryClient + Session + Agent + Toaster
│   └── ui/                       #   shadcn/ui 组件
│
├── server/                       # Service 层（唯一允许访问数据库的地方）
│   ├── listing.service.ts        #   搜索、详情、推荐、城市统计
│   ├── wishlist.service.ts       #   心愿单 CRUD + 归属校验
│   ├── booking.service.ts        #   订单创建、可用性、价格重算、支付、取消退款
│   ├── refund.service.ts         #   退款查询与模拟到账（归属校验）
│   └── user.service.ts           #   注册、登录校验
│
├── agent/                        # AI Agent
│   ├── agent.ts                  #   streamText + 多步工具循环
│   ├── provider.ts               #   模型配置与实例化
│   ├── session.ts                #   有界短期会话记忆
│   ├── types.ts
│   ├── prompts/system.ts         #   系统提示词
│   └── tools/                    #   ★ 8 个工具
│       ├── searchListings.ts
│       ├── getListingDetail.ts
│       ├── recommendListings.ts
│       ├── compareListings.ts
│       ├── getUserWishlists.ts
│       ├── createWishlist.ts
│       ├── addToWishlist.ts
│       ├── removeFromWishlist.ts
│       ├── resolve.ts            #   指代消解 / 鉴权 / 错误归一
│       └── index.ts
│
├── prisma/
│   ├── schema.prisma             # 9 张表：User, Listing, ListingImage, Amenity,
│   │                             #        ListingAmenity, Wishlist, WishlistItem, Booking
│   ├── seed.ts                   # 确定性种子脚本（固定随机种子）
│   └── migrations/
│
├── lib/
│   ├── db.ts                     # Prisma Client + pg 连接池
│   ├── auth.ts                   # jose 会话 + HttpOnly Cookie
│   ├── http.ts                   # 统一响应封装与类型化错误
│   ├── validators.ts             # zod 校验（API 层）
│   ├── search-params.ts          # URL ↔ 搜索条件（宽松解析）
│   ├── pricing.ts                # 价格计算（前后端共用同一模块）
│   ├── refund.ts                 # 取消政策与退款金额计算（前后端共用同一模块）
│   ├── format.ts                 # 货币 / 日期格式化
│   ├── cities.ts                 # 城市元数据 + 中英文归一
│   ├── amenities.ts              # 设施字典
│   ├── api.ts                    # 类型化客户端
│   └── store.ts                  # Zustand
│
├── types/index.ts                # 共享 DTO
├── scripts/                      # db.mjs / verify-db.ts / smoke-api.mjs / verify-tools.ts …
├── prisma.config.ts              # Prisma 7 配置（数据源 URL、迁移、seed）
└── data/                         # 嵌入式 PostgreSQL 数据目录（已 gitignore）
```

---

## 六、Agent 架构

### 完整调用链

```
用户自然语言
     │
     ▼
Next.js Route Handler  /api/agent        ← 从 HttpOnly Cookie 解析用户身份
     │
     ▼
LLM (DeepSeek deepseek-chat, OpenAI 兼容)  ← 决定调用哪个工具、传什么参数
     │
     ▼
Tool Calling  agent/tools/*.ts           ← zod 校验参数
     │
     ▼
Service 层  server/*.service.ts          ← 业务规则 + 权限校验
     │
     ▼
Prisma  →  PostgreSQL 18                 ← 真实数据 / 真实写入
     │
     ▼
Tool Result（结构化 JSON）
     │
     ▼
LLM 生成中文回答 + 界面渲染房源卡片
```

关键点：**Agent 不绕过业务层**。工具与 REST API 调用的是同一批 Service 函数，因此业务规则（价格计算、容量校验、归属校验）只有一份实现。

### 8 个工具的作用

| 工具 | 作用 | 是否需要登录 |
| --- | --- | --- |
| `searchListings` | 按目的地、日期、人数、预算、类型、设施搜索真实房源。支持把"800 左右"自动转成 ±30% 价格区间 | 否 |
| `getListingDetail` | 读取单个房源的完整信息：介绍、全部设施、房东、房型细节 | 否 |
| `recommendListings` | 搜索后按预算匹配度、评分、口碑、交通与设施偏好**打分排序**，返回 Top-N 并附推荐理由 | 否 |
| `compareListings` | 拉取 2–4 个房源详情，输出结构化对比（价格、评分、可住人数、房间数、交通、设施），并计算"最便宜/评分最高/容量最大/最划算" | 否 |
| `getUserWishlists` | 读取当前用户的心愿单及其中的房源 | **是** |
| `createWishlist` | 创建心愿单，如「东京旅行」 | **是** |
| `addToWishlist` | 把房源加入心愿单；支持用序号引用"刚才推荐的第 1 个"；目标心愿单不存在时按名称创建 | **是** |
| `removeFromWishlist` | 从心愿单移除房源；未指定心愿单时自动查找，命中多个则返回候选让用户确认 | **是** |

**推荐与比较的排序发生在工具内部**（确定性、可解释），而不是交给提示词，这样推荐结果一定基于真实数据，模型只负责组织语言。

### 指代消解（短期记忆）

`agent/session.ts` 保存每个会话最近一次搜索/推荐结果的**有序 id 列表**。因此：

- "把**第一个**加入心愿单" → `addToWishlist({ position: 1 })`
- "比较**刚才这三个**" → `compareListings({ positions: [1,2,3] })`

该记忆是进程内、有上限（500 会话）、带 1 小时 TTL 的缓存，**不缓存任何与安全相关的数据**——归属校验每次都重新查库。

### 错误处理策略

工具内部统一捕获异常并返回 `{ ok: false, error: "..." }`，而不是抛出，这样：

- 工具失败不会中断整轮对话，模型可以据此向用户解释并给出替代方案；
- 未登录时调用心愿单工具会返回"该操作需要登录后才能进行"；
- 重复收藏返回 409 语义的友好提示；
- LLM 本身失败（密钥无效 / 网络不通）时，`/api/agent` 会把错误转换成中文提示，以流式 `error` part 返回，页面不会崩溃。

---

## 七、数据库设计

9 张表，含枚举、外键、唯一约束与索引。原生枚举四个：`PropertyType`、`BookingStatus`（PENDING / CONFIRMED / CANCELLED）、`PaymentMethod`（WECHAT / ALIPAY / CARD）、`RefundStatus`（PROCESSING / SUCCEEDED / FAILED）。

| 表 | 关键字段 | 约束 / 索引 |
| --- | --- | --- |
| `User` | id, email, password, name, avatar, createdAt | `email` 唯一 |
| `Listing` | title, description, location, city, country, lat/lng, pricePerNight, propertyType, rating, reviewCount, maxGuests, bedrooms, beds, bathrooms, hostId | `city` / `propertyType` / `pricePerNight` 索引，`(city, propertyType, pricePerNight)` 复合索引 |
| `ListingImage` | listingId, url, position | 级联删除 |
| `Amenity` | name, icon, category | `name` 唯一 |
| `ListingAmenity` | listingId, amenityId | 复合主键（多对多） |
| `Wishlist` | name, userId | `(userId, name)` 唯一 —— 同一用户不能有同名心愿单 |
| `WishlistItem` | wishlistId, listingId | `(wishlistId, listingId)` 唯一 —— 同一房源不能重复收藏 |
| `Booking` | userId, listingId, checkIn, checkOut, guests, nights, roomPrice, cleaningFee, serviceFee, totalPrice, status, **paymentMethod, paidAt, paymentTradeNo** | `(listingId, checkIn, checkOut)` 索引用于可用性查询 |
| `Refund` | bookingId, amount, status, reason, tier, method, tradeNo, note, requestedAt, completedAt | `bookingId` / `status` 索引；随订单级联删除 |

关系：`User 1—N Listing`（房东）、`User 1—N Wishlist`、`Wishlist N—M Listing`（经 `WishlistItem`）、`Listing N—M Amenity`（经 `ListingAmenity`）、`User 1—N Booking`。

### 订单状态流转

```
创建订单 ──► PENDING（待支付，锁定日期）
                │
        支付成功 ├──► CONFIRMED（已确认）
        取消订单 └──► CANCELLED（已取消，日期释放）
```

可用性查询会把 **PENDING 与 CONFIRMED 都视为占用**，所以下单即锁房，避免两个人同时支付同一段日期。`payBooking` 会重新校验归属、是否已取消、是否已支付，因此重复支付返回 409、支付他人订单返回 403。

退款是独立状态机，同样落库：

```
取消已支付订单 ──► 按政策计算退款额 ──► 创建 Refund(PROCESSING)
                                              │
                                      渠道结算 ├──► SUCCEEDED
                                              └──► FAILED
```

`Refund` 单独建表而不是挂在 `Booking` 上，原因是：退款有自己的生命周期与**自己的金额**（政策可能只退一部分），并且需要独立的审计轨迹。退款记录与订单状态变更在**同一个事务**里写入，所以不存在"订单已取消但没有退款记录"的中间态。

### 价格计算

```
房费   = pricePerNight × 晚数
清洁费 = clamp(pricePerNight × 0.4, 50, 400)   // 取整到 10
服务费 = 房费 × 0.12
总价   = 房费 + 清洁费 + 服务费
```

`lib/pricing.ts` 是**唯一实现**：详情页展示、Booking Service 落库都用它。服务端在创建订单时**重新计算**，完全忽略前端传来的金额。

---

## 八、安全设计

| 风险 | 措施 |
| --- | --- |
| 越权读取他人数据 | 所有私人接口先 `requireUser()`，用户 id **只**来自会话 Cookie；`userId` 从不接受前端传参 |
| 越权修改他人心愿单 | 每次操作都 `assertOwnedWishlist()` 查库确认归属，命中他人资源返回 403 |
| 越权取消他人订单 | `cancelBooking` 校验 `booking.userId === userId` |
| 篡改价格 | 服务端按 `pricePerNight` 重算，忽略客户端金额 |
| 重复预订 | 服务端检测日期区间重叠（`checkIn < 目标退房 && checkOut > 目标入住`） |
| 会话伪造 | HS256 签名 + 固定算法校验；每次请求重新查库确认用户存在 |
| Cookie 窃取 | HttpOnly + SameSite=Lax + 生产环境 Secure |
| 账号枚举 | 邮箱不存在与密码错误返回同一条消息 |
| 密码泄露 | bcrypt（cost 10）哈希；查询一律 `select` 白名单字段，DTO 中没有 password |
| 参数注入 | zod 校验 + Prisma 参数化查询 |

`scripts/smoke-api.mjs` 中有 8 项专门验证跨用户隔离的断言（User B 读/写/删 User A 的资源全部被拒）。

---

## 九、开发记录

### 遇到的主要问题与解决

**1. Prisma 7 移除了 schema 中的 `url`**
`Error: The datasource property 'url' is no longer supported in schema files.`
解决：数据源 URL 迁到新增的 `prisma.config.ts`（CLI 用），客户端改为在 `lib/db.ts` 中通过 `@prisma/adapter-pg` 驱动适配器传入连接串。Prisma 7 的默认 generator 也从 `prisma-client-js` 改成了 `prisma-client`（必须指定 `output`）。

**2. `npm i -D prisma` 装到了预发布版**
`prisma` 包的 `latest` dist-tag 指向 `8.0.0-rc.15`，而 `@prisma/client` 的 `latest` 是 `7.10.0`。两者大版本不一致会导致 generate/migrate 失败。
解决：把两个包都**精确锁定**为 `7.10.0`（不带 `^`），并在 `package.json` 中固定。

**3. 嵌入式 PostgreSQL 不包含 `psql.exe`**
`@embedded-postgres/windows-x64` 只提供 `initdb.exe` / `pg_ctl.exe` / `postgres.exe`。最初用 `psql` 建库导致脚本挂起 5 分钟。
解决：`scripts/db.mjs` 改用 `pg` 驱动执行 SQL；同时确认了 Windows 上必须用 `pg_ctl` 启动，postmaster 会自动 detach，所以脚本退出后数据库仍然存活。

**4. Windows 上 PostgreSQL 后端进程崩溃（error 487）**
日志出现 `client backend was terminated by exception 0xC0000142` 与 `could not reserve shared memory region ... error code 487`，随后 `reinitializing`。
解决：调小共享内存段（`shared_buffers=32MB`、`max_connections=30`），并把连接池限制为 10。共享内存段越小，Windows 上越容易在固定地址成功保留。

**5. 项目目录名含空格导致无法创建项目**
`create-next-app` 报 `name can only contain URL-friendly characters`。
解决：在需求文档指定的 `travel-agent/` 子目录中创建项目，正好符合目标目录结构。

**6. Next.js 16 的破坏性变更**
本机 Next 16.3.6 随包提供了版本匹配文档（`node_modules/next/dist/docs/`），我先读了文档再写代码，避免了用旧知识踩坑。实际影响：
- `cookies()` / `headers()` 变成异步，必须 `await`；
- 页面与 Route Handler 的 `params`、`searchParams` 都是 Promise；
- `middleware.ts` 被 `proxy.ts` 取代；
- Route Handler 没有 `searchParams` 属性，要用 `request.nextUrl.searchParams`；
- `fetch` 默认不再缓存；数据库驱动的页面用 `await connection()` 声明为动态渲染。

**7. `lucide-react` v1 移除了品牌图标**
`Github` 图标的导入让 `tsc` 直接报错。
解决：改用中性文案；并建立**显式图标注册表**（`components/amenity-icon.tsx`）替代动态索引，避免把 6000+ 个图标打进产物。

**8. `tsx` 以 CJS 运行脚本时无法使用顶层 await**
`Top-level await is currently not supported with the "cjs" output format`。
解决：脚本统一改为 `async function main()` + `main().catch()` 结构。

**9. shadcn CLI v4 参数变更**
`--base-color` 已不存在，`-b` 改为选择组件库（base/radix/aria），预设改用 `-p nova`。
解决：`npx shadcn@latest init -y -b radix -p nova`，并通过 `--help` 确认真实参数。

**10. PowerShell 引用与插值的坑**
`"$id?w=400"` 会被解析成变量 `$id?`（导致 45 个图片地址全部 404），`curl` 的 JSON 参数也会被引号处理破坏。
解决：改用 `${id}` 显式界定变量名，SQL 与 JSON 一律写入临时文件或用 Node 脚本执行；后来把验证逻辑全部下沉到 Node 脚本，彻底绕开 shell 差异。

**11. 图片资源**
先实测了 picsum（可用但 3.5s）与 loremflickr（超时），最终选用 Unsplash，并**逐个验证 45 个图片 id 返回 200** 后写入种子脚本，避免演示时出现裂图。

**11. DeepSeek 的 `json_object` 模式要求提示词里出现 "json" 字样**
`generateObject` 默认发送 `response_format: { type: "json_object" }`，DeepSeek 直接返回 400：
`Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.`
（OpenAI 没有这个约束，所以很容易在换模型时踩到。）
解决：在 PDF 结构化解析的提示词中显式写明"以 JSON 格式返回（只输出 JSON）"。由于该路径本来就有启发式兜底，这个失败最初表现为"PDF 能解析但结果是英文的"——兜底掩盖了真实错误，是靠阅读服务端日志才发现 `generateObject` 一直在抛异常。

### 技术选择记录

| 决策 | 理由 |
| --- | --- |
| 支付走"模拟但真实落库" | 需求明确不接入真实支付。但把**状态机**（PENDING → CONFIRMED）与支付方式、支付时间、交易号真正写进数据库，业务链路依然完整，演示时也能看到订单状态确实变了——比一个纯静态页面更有说服力 |
| 二维码用装饰图案而非真码 | 既然没有网关，生成一个**可扫描**的二维码会让用户以为真能付款，属于误导。所以画的是不可扫描的装饰图案，并在旁边明确标注"演示用，不可真实支付" |
| 银行卡号只在前端校验 | 用 Luhn 算法做前端格式校验，卡号**不发送、不存储**，演示项目不承担任何卡数据责任 |
| 下单即锁房（PENDING 也占用日期） | 否则两人可同时支付同一段日期。可用性查询同时排除 PENDING 与 CONFIRMED |
| 退款独立建表而非挂在订单上 | 退款有自己的生命周期与金额（政策可能只退一部分），也需要独立审计轨迹；与状态变更同事务写入，杜绝"取消了却没有退款记录" |
| 退款金额由服务端按政策计算 | 与价格计算同理：客户端只展示，不参与计算，避免篡改退款额 |
| 取消前先调 refund-quote 接口 | 让用户在确认前看到**真实**的退款金额与政策档次，而不是取消后才知道退多少 |
| 嵌入式 PostgreSQL 而非 SQLite | 需求要求 PostgreSQL。真实 PG 才能用原生枚举、`@db.Date`、数组与完整事务语义；嵌入式方案无需管理员权限，`schema.prisma` 保持 `provider = "postgresql"` |
| 自研 `jose` 会话而非 Auth.js | 见第二节说明；Agent 必须在服务端确定身份，自研链路更短更可审计 |
| 价格计算抽成共享模块 | 避免"前端显示一个数、后端存另一个数"这类经典 bug |
| 排序打分放在工具内而非提示词 | 让推荐结果确定、可解释、可测试，不依赖模型的算术能力 |
| 工具异常返回 `{ ok: false }` 而非抛出 | 单点失败不会中断整轮对话，模型能据此给出替代方案 |
| 会话状态提升到 `AgentProvider` | Radix Sheet 关闭时会卸载内容，状态放在抽屉里会导致每次关闭都丢失对话 |

### Agent 调试过程

1. **先验证模型端点，再写业务代码**。用 `curl` 直接打 `/v1/chat/completions` 确认鉴权头格式、模型名与工具调用支持，而不是先写一堆 Agent 代码再调试。这个过程本身很有价值：第一版提供的 Key 被网关判定为 `401 Invalid token`（`Authorization: Bearer`、裸 key、`x-api-key` 三种方式都试过，从而排除了"请求格式写错"的可能，定位到是 Key 本身失效）。这也直接催生了 `scripts/verify-ai.mjs` —— 把"端点能不能用、模型会不会调工具"变成一条命令即可回答的问题。
2. **把工具体系与 LLM 解耦验证**。`scripts/verify-tools.ts` 直接调用每个工具的 `execute`，因此**不依赖模型可用性**就能验证 Tool → Service → PostgreSQL 全链路，包括"真的往数据库写了一行又删掉"。模型不可用时项目依然可验证、可交付。
3. **补齐端到端验证**。换成可用的 DeepSeek Key 后，新增 `scripts/smoke-agent.mjs`：用真实模型跑完整流程，断言模型**确实选择了正确的工具**、工具**返回了真实数据库行**、以及心愿单**确实写进了库**（通过独立的 API 查询复核，而不是相信工具的自我报告）。26 项断言全部通过，其中第 3 项验证了"搜索 → 比较"在**同一轮对话内**的多步工具循环。
4. **用序号而非 id 做指代**。模型在多轮中引用具体 id 容易出错，改为服务端维护有序 id 列表、模型只传 `position`，稳定性显著提升。
5. **预算用区间而非精确值**。"800 左右"如果按精确匹配会几乎无结果；改成 ±30% 区间后，东京场景稳定返回 3 个候选，正好支撑"帮我选三个 → 比较这三个"的演示。
6. **失败路径也要能演示**。在无 Key 状态下请求 `/api/agent`，确认返回的是可读的中文提示而不是 500。PDF 解析同理：LLM 不可用时退回正则启发式，仍能提取出目的地/天数/人数/预算。

### 已知限制

- **模型必须支持 function calling**。`deepseek-chat` 已验证可用；`deepseek-reasoner` 不支持工具调用，换成它 Agent 会退化。为此提供了 `node scripts/verify-ai.mjs`，改配置后先跑一次即可确认。
- **待支付订单不会自动过期**。PENDING 会一直占用日期；生产环境应加超时释放（例如 15 分钟后自动取消）。收银台上的倒计时只是前端提示，不改变后端状态。
- **退款的「到账」是手动模拟的**。真实渠道退款是异步回调驱动的（1-3 个工作日），演示环境用「模拟退款到账」按钮推进 `PROCESSING → SUCCEEDED`，没有真实资金流动，也没有接入渠道退款回调。
- 会话记忆是**进程内**的，重启服务即清空；生产环境应换成 Redis。
- 未接入真实支付（需求明确不要求）。
- `@prisma/adapter-pg` 会打印一条 `pg` 的弃用警告（`client.query() when the client is already executing a query`），来自依赖内部，不影响功能。

---

## 十、最终演示流程（3–5 分钟）

| # | 步骤 | 看点 |
| --- | --- | --- |
| ① | 打开首页 | Hero、搜索组件、房源类型分类、热门目的地、推荐房源、Agent 入口 |
| ② | 搜索东京，4 人 | 筛选面板、URL 同步（刷新后状态保持）、房源卡片信息完整 |
| ③ | 进入房源详情 | 图片画廊 + 灯箱、设施、房东、**价格明细（房费+清洁费+服务费）** |
| ④ | 登录 | 使用演示账号 `demo@travel-agent.dev` / `Demo1234` |
| ⑤ | 收藏房源 | 爱心 → 选择/新建心愿单 → Toast 反馈 |
| ⑥ | 完成一次预订并支付 | 选日期人数 → 价格实时计算 → 确认 → **跳转收银台** → 依次展示微信 / 支付宝 / 银行卡 → 模拟支付成功 |
| ⑦ | 取消并退款 | Trips 点「取消订单」→ 弹窗展示**取消政策与逐项退款金额** → 确认 → 订单取消、退款处理中 → 点「模拟退款到账」 |
| ⑧ | 打开 AI 助手，输入自然语言需求 | 流式输出 + **"正在搜索房源…"→"✓ 找到 N 个房源"** 工具执行状态 + 房源卡片 |
| ⑨ | "帮我选三个" | 调用 `recommendListings`，返回带推荐理由的 3 张卡片 |
| ⑩ | "比较刚才这三个" | 调用 `compareListings`，输出结构化对比与结论 |
| ⑪ | "把第一个加入东京旅行心愿单" | 调用 `addToWishlist` **真实写库** → 打开心愿单页面看到该房源 |
| ⑫ | 上传旅行计划 PDF | 解析出目的地/天数/人数/预算/景点 → Agent 继续推荐住宿 |

**演示重点**：`AI Agent → Tool → Service → Database → UI` 这一完整链路，以及"AI 的推荐来自真实数据库、AI 的操作真实落库"。

---

## 十一、核心开发原则（本项目遵守情况）

| 原则 | 落实 |
| --- | --- |
| 数据必须来自真实数据库 | 前端零硬编码房源；首页/搜索/详情全部查询 PostgreSQL |
| Agent 必须调用真实 Tool | 使用 AI SDK `tool()` + `stopWhen`，真实工具循环 |
| Tool 必须连接真实业务逻辑 | 8 个工具全部调用 `server/` Service 层 |
| Agent 不得绕过业务层改数据库 | 工具内不出现任何 Prisma 调用 |
| API 必须鉴权与权限控制 | 私人接口 `requireUser()` + 逐次归属校验；跨用户越权测试覆盖读取/写入/删除/取消订单 |
| 每完成一个模块立即测试 | 5 个可复现脚本共 **205 项断言**（134 + 45 + 26 + DB + AI），全部通过 |
| 不把业务数据写死在前端 | 城市/设施/价格区间均来自 `/api/meta` 与数据库 |
| 每完成一个模块立即测试 | 4 次阶段性提交，每个阶段都有可复现的验证脚本 |
