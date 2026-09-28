# 旅居 Agent · AI Travel Agent 旅游住宿平台

一个 Airbnb 风格的旅游住宿平台，在完整的住宿业务之上，加入了一个**真正参与业务流程**的 AI Travel Agent。

AI 不是一个单独的聊天机器人：它会调用真实的工具，工具连接真实的 Service 层，Service 读写真实的 PostgreSQL 数据库，最终把结果变成界面上的房源卡片和已写入的心愿单。

---

## 一、项目介绍

### 产品定位

面向中文用户的短租/住宿预订平台。用户搜索房源、查看详情、计算价格、完成预订、按主题收藏；AI Agent 则用自然语言接管这些操作。

平台内置 **10 座城市 · 180 套真实结构化房源**（东京、巴黎、伦敦、纽约、新加坡、首尔、京都、曼谷、巴塞罗那、悉尼），数据全部来自数据库，前端没有任何硬编码的房源数据。

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

### 房源详情：多视角照片与可点击设施

**多视角画廊** —— 每套房源 6 张照片，每张都带角度标签：

```
公寓/别墅/民宿: 客厅 · 主卧 · 厨房 · 卫生间 · 次卧 · 阳台与周边
酒店:          客房 · 卫浴 · 公共区域 · 早餐区 · 建筑外观 · 周边环境
```

桌面端是「1 张大图 + 4 张小图」的宫格（Airbnb 布局），点击任意一张进入灯箱：支持 `←/→` 方向键、底部缩略图条直接跳转、并显示当前角度名称与「3 / 6」进度。移动端只显示主图，其余角度收进「查看全部」弹窗，避免长页面堆叠。

**可点击的设施** —— 点击任意设施弹出说明卡片，包含：

- 这个设施到底意味着什么（例如「地铁附近」= 步行可达地铁或轨道交通站）
- 所属分类（基础 / 卫浴 / 出行 / 政策 / 安全 …）
- **当地普及度**：真实统计出来的「伦敦 12 套房源中 9 套提供」，配进度条

> 演示使用图库图片，因此角度标签描述的是「这张图代表的视角」，而不是对真实房源的核验拍摄。

### 房源图片：本地打包，不再依赖图库 CDN

**结论先行：图片从「经常加载不出来」变成了中位数 3–6 毫秒。**

原来的做法是让每个 `<Image>` 去 `images.unsplash.com` 取图，再经过 Next 的图片优化器。问题出在优化器给上游的超时只有约 **7 秒**，而这台机器到 `images.unsplash.com` 的连接极不稳定——实测**单张 148KB 的图花了 114 秒**，并且大约**三分之一的请求在 10 秒左右直接失败**。超时的结果是优化器返回 **504**，卡片于是退化成占位块，页面看起来就像"一直转不出来"。

修法不是在 Next 上调超时（7 秒之后再等 100 秒也没有意义），而是**把图从运行时依赖变成仓库里的静态资源**：

- 种子里其实只有 **45 张不重复的照片**（在 180 套房源之间复用），所以只要下载一次
- `npm run images:fetch` 把这 45 张图抓进 `public/listings/`，并写出 `manifest.json`
- 种子读取 manifest：**本地有就用 `/listings/xxx.jpg`，没有才回退到远程 URL**——所以克隆下来不跑这一步也能用，只是慢
- `next/image` 依旧按断点裁切，但读的是本地文件，**不再有上游请求**

下载脚本是**可续跑**的（已有文件跳过）、带 4 次重试与退避、并发 3，并且**从 `prisma/seed.ts` 里解析 `PHOTO_IDS`**，所以照片清单只有一个来源，不会和种子脱节。

实测对比（`node scripts/bench-images.mjs`，同一台机器）：

| | 修复前 | 修复后 |
| --- | --- | --- |
| 成功返回 200 | 约 2/3，其余 **504** | **12 / 12** |
| 单张耗时中位数 | 超时（约 7 秒后被中断） | **w=640 约 4ms；w=1080 约 3ms** |
| 最慢一张 | 100 秒级 | **6 ms** |
| 首次下载 45 张 | —— | 约 40 秒（共 7.1 MB） |

`scripts/diagnose-images.mjs` 保留了当初的归因过程：它同时请求**上游原图**与 **`/_next/image`** 并给出三种互斥结论（上游 4xx/5xx、上游可达但超过 7 秒、上游正常而优化器失败），输出里明确写着 `The optimizer is fine. The failures are the upstream network path`。

### 界面与交互细节

**夜间模式** —— 顶栏提供主题切换（浅色 / 深色 / 跟随系统），默认跟随系统，选择会持久化。基于 `next-themes` 切换 `<html>` 上的 `.dark` 类，与 `app/globals.css` 中的深色 token 对应。

**AI 回复按 Markdown 渲染** —— 模型输出里的 `**加粗**`、`- 列表`、`1. 编号`、`` `代码` ``、`[链接](url)` 都会被正确渲染，而不是把星号原样显示给用户。列表用主题色圆点、编号列表用圆形序号徽标、小标题带左侧强调条。解析逻辑在 `lib/agent-markdown.ts`（纯函数、可单测），渲染在 `components/agent-markdown.tsx`，**不使用 `dangerouslySetInnerHTML`**，模型输出无法注入标记。

**头像预设（12 个，全部内置）** —— 个人主页提供 12 个预设头像，也可粘贴任意图片链接。

它们**不再来自外部头像服务，而是打包在 `public/avatars/` 里的本地 SVG**（由 `scripts/make-avatars.mjs` 生成，每个不到 1KB）。这是一次被迫但结果更好的改动：原来的 `i.pravatar.cc` 开始**对每个请求都返回 403**，24 个预设里有 22 个显示成裂图。本地文件永远能加载、离线可用，也不再依赖第三方可用性。12 个由 6 组配色 × 3 种剪影组合而成，构图差异足够明显。

新注册的账号会用 `presetAvatarFor(seed)` 按邮箱做 FNV 哈希**确定性地**分配一个预设头像——同一个账号每次登录拿到的都是同一张，而不是每次随机变。种子脚本也会把历史遗留的 `pravatar` 头像一次性迁移到本地预设。

**图片加载失败时居中显示说明文字** —— `components/safe-image.tsx` 统一接管了所有房源图片：`onError` 或 `src` 为空时，渲染一个占位块——居中的图标 + **居中的 alt 文字**（`absolute inset-0 flex flex-col items-center justify-center`）。此前是浏览器原生的裂图图标加一段左上角溢出的小字。已应用到房源卡片、详情页相册（4 处）、Agent 结果卡片、收银台、行程页与首页。

### 首页的层次感：分层的渐变，而不是装饰

首页做了「有层次、有立体感，但依然简约」的改造。做法是**叠加几层极低对比度的渐变**，而不是加大阴影或堆装饰元素——渐变是被"感觉到"的，不是被"看到"的：

- **Hero** —— 三层柔和径向渐变从角落渗入品牌色，叠在一层被遮罩淡出的细网格之上，底部再有一道从搜索框背后向上渗出的光晕（`.glow-primary`，`blur(3rem)`）。此外只在顶部加了一道 1px 内高光（`.edge-light`）作为"受光面"。
- **搜索框** —— 因为浮在渐变之上，单独给了一层更高的阴影 + 1px ring 来托起。**深色模式下特意抬到 `--secondary` 而不是 `--card`**：Hero 的暖色光晕会让它背后的区域比中性背景更亮，只抬到 `card`（0.205）时卡片和背景几乎等亮，实测对比度只有 1.07；抬到 `secondary`（0.269）后实测达到 **1.255**，边缘才真正立起来。
- **房源类型卡片** —— 六个图标各配一组渐变色底（蓝 / 绿 / 橙 / 粉 / 紫 / 黄绿），加 `.surface-sheen` 的顶部受光与 hover 位移，用很小的成本做出"卡片是凸起的"。
- **城市卡片** —— 图片上叠三段式黑色渐变遮罩，加 ring 与阴影。

所有渐变都由主题 token 经 `color-mix()` 混出（`app/globals.css` 里的 `.surface-hero` / `.surface-sheen` / `.edge-light` / `.grid-fade` / `.glow-primary`），因此**浅色与深色模式自动各自成立**，不需要为深色再写一份规则。

**价格区间的双输入框** —— 滑块两端新增了可手动输入的最小/最大价格输入框：

- 输入框是**非受控**的，只有失去焦点或按回车才提交，所以输入过程中不会被过滤结果打断，也不会因为输入到一半（比如刚敲下"1"）就触发一次查询
- 输入非法或留空时**恢复成当前生效的值**，不会把筛选条件写坏
- 拖动滑块时价格是**即时跟手**的：拖动过程只更新本地状态，`onValueCommit`（松手）才真正写入筛选条件与 URL，因此既不会卡顿，也不会往历史记录里塞进几十条中间状态
- 输入框的 `key` 会跟随生效值变化，外部重置筛选后输入框能同步刷新

**入住人数可选「1 位」** —— 步进控件的取值域是 `不限 → 1 → 2 → … → 16`。早期版本的加减逻辑有两处 off-by-one，导致**「1 位」永远选不到**（`不限` 按加号直接跳到 2，而从 2 按减号又直接回到 `不限`），独自出行的人根本没法筛。现在步进规则抽成了 `lib/guests.ts` 里的纯函数并有单测守着，其中一条就是"从 `不限` 一路加到底必须不重不漏地经过每一个取值"。

**首页搜索栏下拉后吸顶并缩窄** —— Hero 里的搜索栏在向下滚动后会缩成一条吸顶的紧凑栏，**并且仍然可以正常搜索**，与 Airbnb 的行为一致。

缩窄是**从两边向中间收**的：紧凑栏**以 Hero 搜索栏实测到的宽度起步**，随着继续下滚线性收窄到 576px。因为容器是居中布局，宽度减少就表现为左右两侧同时向中间收，读起来是"这条搜索栏在变窄"，而不是"又冒出来一条"。圆角也从 24px 同步收到 16px，让它像是同一个物件在变形。

进度直接由**搜索栏自身的 bounding rect** 推导，而不是另设哨兵：它的底边越过 header 的那一刻正好是 `pinned` 翻转为真、也是收窄开始的时刻。实测（`--dump-dom` 读取内联样式）：顶部 768px（不显示）→ 滚到 `#browse` **624.6px** → `#destinations` 576px；`768 − 192 × 0.746875 = 624.6`，与代码里的插值完全吻合。

关键点是**两个实例共用同一份 draft**：`SearchBar` 新增了受控模式（`value` / `onChange`），由 `StickySearchBar` 持有状态，Hero 的那一条只是被滚动移出视野、并没有卸载，所以两处的目的地、日期、人数永远一致，在任意一处修改另一处立刻同步，提交也走同一条代码路径。

一个真实的坑：第一版把哨兵元素放在搜索栏**上方**，于是搜索栏顶端一超过 header 就切换——而那时 Hero 搜索栏还有大半在屏幕上，结果**同时出现两条搜索栏**。

**助手面板头部** —— 「清空」与「关闭」并排在同一行，不再重叠。

### 城市天气

房源详情页与搜索结果页都会显示**所选城市的实时天气**，数据来自 [Open-Meteo](https://open-meteo.com/)——**免费且无需 API Key**，所以克隆下来就能用。

- 当前温度、体感温度、湿度、风速、天气描述（中文）与对应图标
- **未来 5 天预报**：最高/最低温 + 降水概率
- 出行建议（如「记得带伞」「气温偏低，建议厚外套」），由温度、风力和降水概率推导
- 服务端**进程内缓存 15 分钟**；天气服务不可用时优先返回上一次的缓存值，完全取不到就不渲染这张卡片（绝不让它拖垮页面）
- 夜间会自动切换成月亮图标；城市坐标直接复用 `lib/cities.ts` 里已有的经纬度

```
GET /api/weather?city=Tokyo      → 单个城市
GET /api/weather?all=1           → 全部 10 座城市
```

### 个人主页

从右上角头像菜单进入 `/profile`：

| 区块 | 内容 |
| --- | --- |
| 主页背景 | 8 个内置渐变背景 + 自定义背景图 URL，顶部实时预览 |
| 账号概览 | 心愿单 / 收藏房源 / 行程订单数量、注册时间 |
| 公开资料 | 昵称、12 个内置预设头像 + 自定义头像 URL、实时预览、未保存时可撤销 |
| 个性化主页 | 自定义标签、生活爱好、心仪地点、已旅行地点展柜 |
| 账号安全 | 修改密码（需验证当前密码） |

**个性化主页**的四个区块都是"芯片式"编辑——输入后回车（或逗号）添加，点建议词直接加入，点芯片上的 ×（或空输入框按退格）删除，并显示 `n / 上限` 计数。四个区块共用同一个 `components/chip-list-editor.tsx`，交互只定义一次：

| 区块 | 上限 | 说明 |
| --- | --- | --- |
| 自定义标签 | 8 | 用几个词形容旅行风格，会显示在主页横幅的昵称下方 |
| 生活爱好 | 10 | 平时喜欢做什么 |
| 心仪地点 | 12 | 想去但还没去的地方 |
| 已旅行地点展柜 | 24 | 去过的地方，用更宽松的"陈列"样式展示 |

服务端会**统一清洗**每一组芯片：去首尾空格、丢弃空项、**按大小写不敏感去重**（所以 `东京` 与 `东京 ` 不会同时存在）、超长项截断到 20 字、超出上限截断。校验与清洗都在服务端再做一遍，不依赖前端。

**主页背景默认是本地 CSS 渐变，不是图库照片**——8 个预设（极光 / 日落 / 深海 / 森林 / 沙丘 / 樱花 / 午夜 / 薄荷）都是 Tailwind 渐变类，所以离线可用、永远不会有裂图，深色模式下也成立。想用自己的图就填一个图片 URL，**加载失败会自动回退到预设渐变**并给出提示，而不是显示裂图。

保存采用"**只发送、只更新你改动过的部分**"的语义：服务端把**未出现的字段视为"不要动"**，因此编辑器分区块保存时不会把其他区块的内容清空。同时表单顶部会出现一条"有未保存的修改"提示条，附带**撤销修改**按钮。

两个刻意的设计：

- **邮箱不可改**：它是登录凭据与账号标识，修改需要邮箱验证流程，不适合放在这个演示里。
- **改密码必须验证当前密码**：否则仅凭泄露的会话 Cookie 就能把真正的账号主人锁在门外。

### 房源详情：评论、地图与入住须知

**房客评价（真实持久化）** —— 房源详情页有完整的评论区：

- 综合评分、**1–5 星分布条**、本站评价条数
- 评价卡片：头像、昵称、星级、日期、正文；自己的那条带「我的评价」标记，可**编辑**与**删除**
- 未登录可以**读**，要**写**必须先登录（按钮会跳转登录并回跳本页）

**持久化是这个功能的重点**：评价存在 `Review` 表里，以 `(listingId, userId)` 作为唯一键。所以

- 评价**下次登录依然在**，换设备也在——因为它只依赖账号，不依赖浏览器
- 再次提交是**编辑而不是新增**（唯一键 + upsert），既不会刷出一堆重复，平均分也不会被同一个人反复影响
- 作者**只来自会话 Cookie**，请求体里没有 userId，因此无法冒充他人发表
- **房东不能评价自己的房源**（返回 403）——这是可信度问题，不是功能缺失
- 删除只能删自己的

房源行里的 `rating` / `reviewCount` 是种子数据里的**历史聚合**（演示数据没有逐条记录），UI 会把它单独标注成「房源历史评分 … 来自 … 条早期评价」，而不会和本站真实评价混在一起算——两个数字都真实，混算就都不真实了。

**房源位置地图** —— 详情页「位置信息」下有一张可缩放的地图，定位标记落在精确坐标上，并附「在地图中打开」外链。实现上的三个决定：

- **瓦片用 Esri World Street Map**（免 API Key）。实测本机**只有 Esri 可达**：OpenStreetMap、Carto、Wikimedia、Stadia 全部连接失败，而 Esri 在四座城市 × 两个缩放级别下**全部返回 200**（约 30–50KB/张，300–1700ms）。选能用的，而不是最"标准"的。
- **用瓦片拼贴而不是引入地图库**。没有新依赖、没有额外 CSS，几何计算是纯函数（`lib/tiles.ts`）并有 25 项单测。代价是不能拖拽平移，用缩放按钮 + 外链覆盖实际需求。
- **用原生 `<img>` 而不是 `next/image`**。第三方瓦片若走优化器，就会在关键路径上多一次上游请求和约 7 秒超时——正是把房源图片打成占位块的那个失败模式。瓦片本身已经很小。

地图的**居中逻辑**也踩了一次：最初把瓦片网格对齐到整块瓦片，结果标记落在坐标恰好在瓦片内的位置——东京算出来在拼贴的 **97%** 处，等于挂在底边外。改成**以坐标为中心、把瓦片层反向偏移一个不足一格的距离**，标记就恒定落在正中；单测里对 6 座城市 × 5 个缩放级别断言"坐标必须落在拼贴正中"，误差容忍 0.001px。瓦片数学本身也按可证伪的不变量测：y 轴不能翻转（巴黎必须排在悉尼上方）、每放大一级瓦片号必须是 `2x` 或 `2x+1`、极点纬度必须被夹紧。

**入住须知** —— 预订面板与详情页各有一个「入住须知」入口，弹出对话框显示：

- **入住 / 退房时间**（酒店 14:00/12:00，民宿 15:00/11:00）
- **入住守则**：吸烟、噪音、宠物、聚会等
- **其他须知**：停车、交通、办公条件、延迟退房

这些内容是**从房源自身属性推导**的，不是手写的固定文案——标了「可带宠物」的房源不会同时写「恕不接待宠物」，标了「免费停车」的才会写"楼下有免费停车位"。手写这类文案最容易出的错就是自相矛盾，所以让两者同源。

### 根据搜索记录推荐目的地

首页多了一排「根据你的搜索记录推荐」：

- 用户每次搜索都会记一条 `SearchEvent`（**仅登录用户**）
- 城市名会先归一化成规范名，所以「东京」「Tokyo」「tokyo」会聚合到同一个城市，而不是各算一次
- 排名用**时间衰减加权**而不是简单计数：半衰期 14 天。上个月搜了 5 次东京、这周搜了 2 次雷克雅未克的人，更可能在计划后者
- 未登录、或还没有搜索记录时，退回「热门目的地」并明确说明原因，而不是显示一个空区块

三条刻意的边界：

- **只记录登录用户的搜索。** 匿名会话没有可个性化的身份，存陌生人的查询属于"收集了却没有用途"。
- **同一小时内重复的同一搜索会被折叠。** 刷新页面、拖动价格滑块都会重新出现同一个 `location`，不应该把信号刷高。
- **AI Agent 也能读到它。** 新增第 9 个工具 `getMySearchHistory`，当用户说「随便推荐一下」而没有明确目的地时，模型会先调这个工具再据此推荐。

记录动作发生在搜索页上一个**显式的 POST**（`components/search-recorder.tsx`），而不是在页面渲染时写库：GET 里写数据库本身就是坏味道，而且预取也会误触发。

### 多语言（6 种）

顶栏有语言切换器，支持 **简体中文、繁体中文、English、日本語、한국어、Español**。

**语言存在 Cookie 里，不是放在 URL 里。** 这样所有现有路由、链接、分享地址都不用改；代价是无法把某一门语言"钉"在链接里分享出去，对这个应用不重要。服务端在渲染前读 Cookie，所以**首屏就是正确语言**，不会先闪一下中文再切换；首次访问按 `Accept-Language` 猜，并正确处理 `zh-Hant` / `zh-TW` / `zh-HK` → 繁体，而不是笼统地把所有 `zh` 都当成简体。

实现是**一个类型化查表，没有引入 i18n 库**：

- `lib/i18n/dictionaries/zh-CN.ts` 是**参考字典**，其余 5 份以它为类型。少一个 key、多一个 key 都是**编译错误**，而不是线上悄悄退化成中文。
- `Dictionary` 由 zh-CN 的**键树**推导、并把叶子放宽为 `string`——直接用 `typeof zhCN` 会把类型变成字面量 `"搜索"`，任何译文都无法满足。
- `{name}` 占位符由 `interpolate()` 替换；查不到时**回退到参考语言**，最后才回退成 key 本身，让缺失在界面上可见而不是渲染成空白。
- `lib/i18n/plurals.ts` 处理**英文/西班牙文的单数**：纯模板替换会渲染出 "1 nights" / "1 noches"，所以 `count === 1` 时对少数 key 取单数变体。中文/日文/韩文不标记单复数，不配置即可。

**覆盖范围要说清楚：**

| 已翻译 | 未翻译（有意） |
| --- | --- |
| 顶栏导航、语言切换器、登录/注册/退出 | **房源标题与描述**（种子里的创作内容） |
| 首页 Hero、区块标题、空状态、错误状态 | **评论正文**（用户生成内容） |
| 搜索栏（目的地 / 日期 / 人数 / 按钮 / 提示） | **设施说明文案**（26 项字典内容） |
| 通用单位与按钮（晚 / 位 / 条评价 / 查看全部…） | |

判断标准是**界面外壳属于产品、需要翻译；内容属于数据、应当保持原样**。翻译创作内容既不可能准确，也会把数据表变成翻译文件。

切换器把每种语言**用它自己的文字**标注（`简体中文` / `繁體中文` / `English` / `日本語` / `한국어` / `Español`）——一个只写 "Chinese/English/Japanese" 的列表对读不懂英语的人没有用；另外刻意**不用国旗**：国旗是国家，不是语言。

**切换语言会主动重渲染，不需要手动刷新** —— 这一点很容易漏：应用里绝大多数文案是**服务端渲染**的（首页、筛选栏、房源卡片、详情页），而客户端的状态更新**不会**重新渲染这些树。所以切换语言时做了三件事，缺一不可：

1. 更新本地 state —— 客户端组件立刻跟着变
2. 写 Cookie —— 让**下一次请求**（包括下面的刷新）以新语言返回
3. 调 `router.refresh()` —— 重新执行服务端组件

只做前两步的话，界面会一半新语言、一半旧语言，直到用户自己按 F5。刷新包在 `useTransition` 里，所以切换时按钮会显示转圈，而不是看起来"点了没反应"。

**已经覆盖的界面**：顶栏与语言切换器、首页（Hero、各区块、空/错状态、AI 推广区与其示例问题）、搜索页（筛选栏全部标签与设施名、结果标题、排序、清除、分页、空状态）、房源卡片（房型/床/人数/评价/每晚）、**天气**（含晴阴雨雪的描述与"记得带伞"这类建议）、**房源详情页各段标题与入住须知对话框**。

**还没覆盖**：预订面板与评论区的正文标签、个人主页、心愿单/行程页、页脚。这些页面仍是中文——**这是当前的真实状态**，不是已经完成。

**一个踩过的坑（服务端组件里调用客户端 hook）**：`WeatherCard` 原本可以服务端渲染，我加上 `useT()` 之后**房源详情页直接 500**：

```
Attempted to call useT() from the server but useT is on the client.
```

是天气那两条既有断言把它抓出来的（"详情页应显示温度"失败）。修法有两种——把卡片变成客户端组件，或者把 `t` 作为 prop 传下去。这里选了前者：它本来就紧邻客户端边界（图标、交互），而 `CityWeather` 是纯 JSON、跨边界没有代价。教训是：**给一个服务端组件加客户端 hook，等于把它悄悄变成客户端组件，而报错发生在运行时而不是编译期。**

**天气文案为什么不能直接翻译**：服务端生成的是**一句话**（`"记得带伞，气温偏低，建议厚外套"`），一句话没法在客户端查表。所以 DTO 里同时给出 `advice`（成句，给 API 与 Agent 用）和 `adviceKeys`（`["umbrella", "cold"]`，给界面翻译用）。同理，天气描述按 `kind`（晴/阴/雨/雪…13 种）而不是按 Open-Meteo 的 25 个 code 做映射。

**设施名怎么翻译**：设施名是数据库里的中文（`地铁附近`），它同时是**筛选条件的取值**，不能改。所以 `lib/i18n/labels.ts` 维护一张 `存储名 → slug` 的映射，界面只翻译标签；`verify-i18n.ts` 断言这张映射覆盖了 `AMENITY_CATALOG` 的全部 26 项——新增设施却忘了加标签会**测试失败**，而不是在界面上露出一个中文词。

**字典分成「主字典 + 分组模块」两层**：`lib/i18n/dictionaries/zh-CN.ts` 是界面外壳的主字典；`lib/i18n/messages/` 下每个功能组（个人主页、心愿单、行程、收银台、评论与媒体、Agent 界面、页脚与全局）各有一个独立模块。

这不是为了好看，而是为了**并行翻译不打架**：剩余界面有四百多条文案，如果一个共享字典文件被多个写入者同时修改，行级冲突几乎是必然的。一组一个文件之后，每个写入者只碰自己的文件，键命名空间也按组名隔离（`account.title` 而不是 `title`），`translate()` 直接按第一个点号分段路由到对应模块。

`verify-i18n.ts` 对每个模块断言四件事：**各语言键集合完全一致**、没有空值、键名带组名前缀、以及**每个键都能被 `translate()` 真正解析出来**（最后一件事专治"模块写好了但忘了接进 `MESSAGE_MODULES`"——那种情况界面会把键名本身显示出来）。

### 账号会保留（`db:seed` 现在是非破坏性的）

**早期版本的种子脚本会 `deleteAll()` 掉所有用户**，所以每次重新生成演示数据都会把注册过的账号一起删掉——这正是"下次登录又要重新注册"的原因。

现在 `npm run db:seed` 可以**反复安全执行**：

- 种子用户按邮箱 **upsert**，真实注册的账号**完全不动**
- 房源按新增的 `Listing.seedKey` **upsert**，因此**房源 id 保持稳定**
- 因为 id 稳定，真实用户的心愿单与订单**也不会被级联删除**
- 演示心愿单只在"不存在或为空"时补种，用户自己整理过的内容不会被覆盖
- 每次执行都会打印保留了几个真实账号

```
[seed] accounts: 11 total, 2 registered by real users (preserved)
```

> 从旧版本升级会执行一次性清理：没有 `seedKey` 的历史种子房源会被移除（此应用不提供创建房源的功能，所以无 key 的房源必然来自旧种子）。

### AI Agent 特色

- **真实 Tool Calling**：LLM 通过 AI SDK 的 `tool()` 机制决定调用哪个工具、传什么参数，而不是关键词匹配。
- **8 个真实工具**，覆盖搜索、详情、推荐、比较、心愿单读写。
- **多步工具循环**：一次用户输入内可以连续调用多个工具（搜索 → 读详情 → 比较 → 写入心愿单），由 `stopWhen(stepCountIs(8))` 驱动。
- **写入型工具**：Agent 可以真正创建心愿单、增删收藏，并直接把数据写入 PostgreSQL。
- **指代消解**：服务端保存短期会话记忆，所以"把**刚才推荐的第一个**房源加入心愿单"可以正确解析。
- **流式输出 + Tool 执行状态**：界面实时显示"正在搜索房源…"、"✓ 找到 6 个房源"等步骤。
- **旅行计划解析（PDF / 图片）**：上传 PDF **或手机拍的行程图** → 有文字层就直接读、没有（扫描件/拍照件）就渲染成图交给视觉模型 OCR → LLM 结构化 → 交给 Agent 继续推荐住宿。

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
| 文件处理 | `unpdf`（PDF 文本层提取 + 页面栅格化）、`@napi-rs/canvas`、视觉模型 OCR、LLM 结构化解析 |
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

# 4. 生成演示数据（180 套房源 / 10 座城市 / 26 项设施）
npx prisma db seed

# 5. 生成 Prisma Client（迁移时通常已自动执行）
npm run db:generate

# 6. 下载房源图片到 public/listings/（约 7MB / 45 张，可续跑）
#    不做这一步也能跑，但图片会走远程 CDN，可能很慢或加载失败
npm run images:fetch

# 7. 启动开发服务器
npm run dev
```

打开 <http://localhost:3001>。

> **端口固定为 3001**（`next dev -p 3001`）。本机 3000 端口被另一个项目（`D:\project\expense reimbursement`）的 dev server 占用，固定端口可以避免两个项目互相抢占、URL 也不再来回变化。要改用其他端口，编辑 `package.json` 里的 `dev` / `start` 脚本即可。

> 也可以一步完成第 2–4 步：`npm run setup`
>
> 第 6 步是可选的，但**强烈建议执行**：不下载的话每张房源图都要现场去 Unsplash 取，在这台机器上实测约三分之一的请求会超时（详见「房源图片：本地打包」一节）。图片已随仓库提交，所以 `git clone` 之后通常不需要再跑。

#### 一键启动（Windows）

```
双击 start.cmd
```

它会**逐步校验**，任何一步失败都会停下来并打印**该跑哪条命令去修**，而不再是静默地卡住：

```
 [1/3] Database (embedded PostgreSQL, port 55432) ...
       database is accepting connections.
 [2/3] Web server ...
 [3/3] Waiting for the app to answer on http://localhost:3001 ...
  waiting.
  server responded after 2 attempt(s) — HTTP 200

 ============================================================
   Ready:  http://localhost:3001
   Login:  demo@travel-agent.dev / Demo1234
 ============================================================
```

结束后的状态：

| 窗口 | 内容 |
| --- | --- |
| `AI Travel Agent (web)` | Next.js dev server（**关掉它就停止网站**） |
| 你双击的那个窗口 | 启动结果与错误诊断，可以安全关闭 |
| PostgreSQL | 以 detached 方式运行在 55432，用 `npm run db:stop` 停止 |

三条设计上的取舍：

- **启动成功后才打开浏览器**。以前是先打印地址、让浏览器去撞 `ERR_CONNECTION_REFUSED`；现在 `scripts/wait-for-server.mjs` 会真的轮询 `/api/meta` 直到拿到 **HTTP 200** 才打开（Next 首次编译通常需要几秒，冷启动更久，所以期间会每秒打一个点表示在进展而不是卡死）。
- **数据库用「真连一次」来判定，而不是看 `pg_ctl status`**。`pg_ctl status` 只检查 postmaster.pid 里的 PID 还活着，所以对一个"进程在、但已经无法派生 backend"的 postmaster 依然会报 running。启动前改用一次真实的 `select 1` 往返 + `db:ping` 复核。
- **不再有无限等待**。`pg_ctl` 的每一次调用都有超时（启动 75s、停止 60s、状态 20s、initdb 180s），随后还有 30s 的真实连接等待。之前正是无超时的 `spawnSync` 让脚本永远停在 "starting PostgreSQL ..."。

出问题时可以先手动跑一次体检：

```bash
npm run db:doctor
```

它会逐项检查：二进制是否存在、集群是否初始化、`postmaster.pid` 是否已失效、**数据库是否真的能连上**、`travel_agent` 库里有没有数据、以及 3001 端口是否有服务在应答。最后给出 `no problems found` 或列出每条 FAIL 对应的修复命令。

#### ⚠️ 请在你自己的终端里启动服务

**不要从"会回收子进程"的环境里启动**（CI、部分 IDE 的终端封装器、AI Agent 工具的后台任务等）。这类环境通常把命令放进 Windows **Job Object**，命令结束或环境清理时整个进程树被回收，于是：

| 现象 | 原因 |
| --- | --- |
| `localhost:3001` 拒绝连接 | dev server 进程被一起回收 |
| 能连上但每个查询都 `ECONNRESET` | postmaster 还活着（`pg_ctl status` 显示 running、端口也在监听），却已**无法派生 backend 进程**，日志里是 `client backend ... terminated by exception 0xC0000142`（STATUS_DLL_INIT_FAILED） |

在你自己的 cmd / PowerShell 窗口里运行不会有这个问题（终端本身就是那个长生命周期父进程）。停止数据库：`npm run db:stop`。

如果确实必须从受约束的环境启动，用前台守护模式，它让父进程常驻：

```bash
npm run db:serve     # 前台运行，保持父进程存活；Ctrl+C 退出
```

普通终端里 `npm run db:start` 是够用的（命令结束后终端本身仍在）。

> ⚠️ 请不要在 `npm run dev` 运行期间执行 `npm run build`：两个 Next 进程争用 `.next` 目录可能导致 dev server 被终止。

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
| `npm run db:serve` | 前台守护模式启动数据库（父进程常驻，适合受进程管理器约束的环境） |
| `npm run db:ping` | 测试数据库连通性 |
| `npm run db:doctor` | 一键体检：二进制 / 集群 / 连接 / 数据 / 3001 端口逐项检查并给出修复命令 |
| `npm run db:psql -- "select 1"` | 执行一条 SQL（注意：该发行包不含 psql.exe，此命令走 `pg` 驱动） |
| `npm run db:reset` | **删除**全部本地数据 |
| `npm run db:seed` | 重新生成演示数据 |
| `npm run images:fetch` | 下载房源图片到 `public/listings/`（可续跑；已有文件会跳过） |
| `npm run avatars:make` | 重新生成 12 个内置预设头像 SVG |
| `npm run db:studio` | 打开 Prisma Studio |

### 回归测试

```bash
npx tsx scripts/verify-db.ts     # 数据库：枚举、CRUD、唯一约束、级联删除
node scripts/smoke-api.mjs       # API：155 项断言，含跨用户越权测试（需先 npm run dev）
npx tsx scripts/verify-tools.ts  # Agent 工具：55 项断言，含真实写入校验
node scripts/verify-ai.mjs       # AI 端点：连通性 + 流式 + ★function calling 能力
node scripts/test-vision.mjs     # AI 端点：★是否支持图片输入（扫描件 OCR 的前提）
node scripts/smoke-agent.mjs     # Agent 端到端：51 项断言，含 PDF / 扫描件 / 图片解析
node scripts/smoke-weather-profile.mjs  # 天气 + 个人主页 + ★账号跨播种保留：39 项断言
node scripts/smoke-profile-fields.mjs   # 个性化主页字段 + 预设头像校验：26 项断言
node scripts/smoke-new-features.mjs     # 评论持久化 + 搜索记录推荐 + 入住须知 + 地图：63 项断言
npx tsx scripts/verify-guests.ts        # 入住人数步进：17 项断言（纯逻辑单测）
npx tsx scripts/verify-tiles.ts         # 地图瓦片数学：25 项断言（纯逻辑单测）
npx tsx scripts/verify-i18n.ts          # 6 种语言字典：50 项断言（键覆盖/占位符/单复数）
npx tsx scripts/verify-markdown.ts      # Agent Markdown 渲染：21 项断言（纯逻辑单测）
npx tsx scripts/inspect.ts       # 查看种子数据分布
node scripts/diagnose-images.mjs # 诊断房源图片：区分"上游挂了 / 上游太慢 / 优化器坏了"
node scripts/bench-images.mjs    # 实测图片加载耗时（中位数 / 最慢 / 失败数）
node scripts/make-test-pdf.mjs      # 生成"有文字层"的 PDF 测试文件
node scripts/make-scanned-pdf.mjs   # 生成"扫描件"PDF + 同页 JPEG 测试文件
```

当前实测结果（全部通过）：

| 脚本 | 结果 |
| --- | --- |
| `verify-db.ts` | ✅ ALL CHECKS PASSED |
| `smoke-api.mjs` | ✅ **155 / 155** |
| `verify-tools.ts` | ✅ **55 / 55** |
| `verify-ai.mjs` | ✅ chat + tool calling OK |
| `test-vision.mjs` | ✅ 支持图片输入（远程 URL 与 data URI） |
| `smoke-agent.mjs` | ✅ **51 / 51** |
| `smoke-weather-profile.mjs` | ✅ **39 / 39**（天气依赖外部服务，取不到时该部分跳过） |
| `smoke-profile-fields.mjs` | ✅ **26 / 26** |
| `smoke-new-features.mjs` | ✅ **63 / 63** |
| `verify-guests.ts` | ✅ **17 / 17** |
| `verify-tiles.ts` | ✅ **25 / 25** |
| `verify-i18n.ts` | ✅ **50 / 50**（6 种语言键覆盖 + 占位符 + 单复数） |
| `verify-markdown.ts` | ✅ **21 / 21** |
| `bench-images.mjs` | ✅ **12 / 12 张加载成功**，中位数 4ms |

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
│   ├── profile/page.tsx          # 个人主页：资料编辑 + 修改密码
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
│       ├── users/me/             #   PATCH 资料；POST /password 修改密码
│       ├── weather/              #   GET 城市实时天气与预报（Open-Meteo）
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
│   ├── amenity-list.tsx          #   可点击的设施列表 + 设施说明弹窗
│   ├── weather-card.tsx          #   天气卡片（当前 + 5 日预报）
│   ├── city-weather-strip.tsx    #   搜索页跟随所选城市的天气条
│   ├── profile-form.tsx          #   个人主页表单（横幅 / 资料 / 个性化 / 密码）
│   ├── chip-list-editor.tsx      #   芯片列表编辑器（标签 / 爱好 / 心仪 / 去过）
│   ├── listing-gallery.tsx       #   多视角画廊 + 灯箱 + 缩略图条
│   ├── listing-map.tsx           #   房源位置地图（Esri 瓦片拼贴，可缩放）
│   ├── house-rules-panel.tsx     #   入住须知对话框（时间 / 守则 / 其他须知）
│   ├── review-section.tsx        #   评论区：评分分布 + 发表/编辑/删除
│   ├── sticky-search-bar.tsx     #   首页搜索栏下拉后吸顶并缩窄
│   ├── locale-provider.tsx       #   语言上下文（客户端）
│   ├── locale-switcher.tsx       #   顶栏语言切换器（6 种语言）
│   ├── search-recorder.tsx       #   把当前搜索记入搜索历史（未登录为 no-op）
│   ├── personalized-destinations.tsx  # 按搜索记录推荐目的地
│   ├── qr-placeholder.tsx        #   确定性伪二维码 SVG（不可扫描，仅装饰）
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
│   ├── travel-plan.service.ts    #   旅行计划取文：PDF 文字层 / 扫描件栅格化 OCR / 图片 OCR
│   ├── weather.service.ts        #   城市天气（Open-Meteo，带 15 分钟缓存与兜底）
│   ├── review.service.ts         #   评价读写（(listing,user) 唯一，upsert 即编辑）
│   ├── personalization.service.ts #  搜索历史记录 + 时间衰减加权的目的地推荐
│   └── user.service.ts           #   注册、登录校验
│
├── agent/                        # AI Agent
│   ├── agent.ts                  #   streamText + 多步工具循环
│   ├── provider.ts               #   模型配置与实例化
│   ├── session.ts                #   有界短期会话记忆
│   ├── types.ts
│   ├── prompts/system.ts         #   系统提示词
│   └── tools/                    #   ★ 9 个工具
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
│   ├── cities.ts                 # 10 座城市元数据 + 中英文归一
│   ├── amenities.ts              # 设施字典
│   ├── avatars.ts                # 12 个内置预设头像 + 确定性分配 + 预设白名单
│   ├── profile-options.ts        # 主页背景预设 + 芯片建议词 + 清洗与上限
│   ├── guests.ts                 # 入住人数步进规则（不限 → 1 → … → 16）
│   ├── tiles.ts                  # 地图瓦片数学（纯函数，带单测）
│   └── i18n/                     # 6 种语言：locales / dictionaries / plurals / server
│   ├── api.ts                    # 类型化客户端
│   └── store.ts                  # Zustand
│
├── types/index.ts                # 共享 DTO
├── scripts/                      # db.mjs / verify-db.ts / smoke-api.mjs / verify-tools.ts
│                                 # smoke-agent.mjs / verify-ai.mjs / test-vision.mjs / inspect.ts
│                                 # fetch-listing-images.mjs / diagnose-images.mjs / bench-images.mjs
│                                 # wait-for-server.mjs（start.cmd 的就绪轮询）
├── public/
│   ├── avatars/                  # 12 个内置预设头像 SVG（由 make-avatars.mjs 生成）
│   └── listings/                 # 45 张房源照片 + manifest.json（images:fetch 下载）
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

### 9 个工具的作用

| 工具 | 作用 | 是否需要登录 |
| --- | --- | --- |
| `searchListings` | 按目的地、日期、人数、预算、类型、设施搜索真实房源。支持把"800 左右"自动转成 ±30% 价格区间 | 否 |
| `getListingDetail` | 读取单个房源的完整信息：介绍、全部设施、房东、房型细节、入住须知 | 否 |
| `recommendListings` | 搜索后按预算匹配度、评分、口碑、交通与设施偏好**打分排序**，返回 Top-N 并附推荐理由 | 否 |
| `compareListings` | 拉取 2–4 个房源详情，输出结构化对比（价格、评分、可住人数、房间数、交通、设施），并计算"最便宜/评分最高/容量最大/最划算" | 否 |
| `getMySearchHistory` | 读取当前用户的搜索记录，得出他最关注的目的地。用户说"随便推荐一下"而没有明确目的地时先调这个 | **是** |
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

### 旅行计划解析（PDF / 扫描件 / 图片）

上传入口在 Agent 对话面板底部（**上传旅行计划**）。三条路径自动分流：

```
上传文件
   │
   ├─ PDF，有文字层 ─────────► 直接读文字            method: pdf-text
   │
   ├─ PDF，无文字层（扫描/拍照）
   │        └─ 渲染每页为 PNG ──► 视觉模型 OCR        method: ocr
   │
   └─ 图片（JPG / PNG / WebP）──► 视觉模型 OCR        method: ocr
                                        │
                                        ▼
                          LLM 结构化（destination / days /
                          guests / budgetPerNight / places / summary）
                                        │
                                        ▼
                          交回 Agent 继续 recommendListings
```

几个实现要点：

- **扫描件判定**：PDF 文字层提取出的字符数低于阈值（40）就认为没有可用文字层，自动转入 OCR，而不是直接报错。
- **OCR 用同一个模型配置**：渲染出的 PNG 以 data URI 交给当前配置的视觉模型逐页转录（提示词要求逐字转录、不加解释）。不需要额外接入 OCR 服务。
- **页数上限**：最多渲染 5 页，兼顾识别质量与耗时。
- **模型必须支持图片输入**：若模型不支持，扫描件会返回明确提示而不是静默失败。可用 `node scripts/test-vision.mjs` 一键检测当前端点是否支持图片输入。
- 解析结果里会返回 `method`、`pageCount`、`textLayerChars`，便于排查是走了哪条路径。



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
| `Listing` | title, description, location, city, country, lat/lng, pricePerNight, propertyType, rating, reviewCount, maxGuests, bedrooms, beds, bathrooms, hostId, **seedKey** | `city` / `propertyType` / `pricePerNight` 索引，`(city, propertyType, pricePerNight)` 复合索引，`seedKey` 唯一（让种子可重复执行） |
| `ListingImage` | listingId, url, position, **caption（拍摄角度/房间）** | 级联删除 |
| `Amenity` | name, icon, category, **description** | `name` 唯一 |
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

**12. DeepSeek 的 `json_object` 模式要求提示词里出现 "json" 字样**
`generateObject` 默认发送 `response_format: { type: "json_object" }`，DeepSeek 直接返回 400：
`Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.`
（OpenAI 没有这个约束，所以很容易在换模型时踩到。）
解决：在 PDF 结构化解析的提示词中显式写明"以 JSON 格式返回（只输出 JSON）"。由于该路径本来就有启发式兜底，这个失败最初表现为"PDF 能解析但结果是英文的"——兜底掩盖了真实错误，是靠阅读服务端日志才发现 `generateObject` 一直在抛异常。

**13. 桌面端房源画廊整块塌陷（但图片其实是好的）**
症状：详情页本该放图片的位置一片空白，只留一条灰色分隔线；**移动端却正常**。
排查：先验证资源本身 —— 直接请求原始图片 URL 和 `/_next/image` 优化后的地址，都返回 `200 image/jpeg`（148KB / 71KB），SSR HTML 里也确实有图片标签。所以**不是加载问题，是布局问题**。
根因：桌面端容器写了 `md:grid-cols-4 md:grid-rows-2`，而 `grid-rows-2` 展开是 `repeat(2, minmax(0, 1fr))` —— **`fr` 必须有确定的高度才能解析**。容器没有高度，同时每个格子又写了 `md:aspect-auto md:h-full`（关掉移动端的 `aspect-4/3`，改成"占满行高"），于是行高 = 内容高度 = 0，整个画廊塌成一条线。移动端因为保留了 `aspect-4/3` 所以看不出问题。
解决：给容器一个确定高度（`md:h-[26rem] lg:h-[30rem]`），格子去掉 `h-full` 交给网格拉伸；移动端只显示主图，其余角度收进「查看全部」弹窗。
教训：**先确认资源能不能加载，再怀疑布局**。如果一上来就去换图片地址或改 `next.config` 的 `images` 配置，方向会完全跑偏。

**14. 扫描版 PDF 无法识别 → 接入视觉模型 OCR 时踩到两个 pdf.js 的坑**

需求是"图片型 PDF 也要能识别"。动手前先做了一件省事的事：**验证当前端点到底支不支持图片输入**（`scripts/test-vision.mjs`）—— 结果 `deepseek-chat` 远程 URL 与 data URI 两种方式都能正确描述图片，所以 OCR 可行，不需要换provider。随后踩到两个坑：

坑一：`canvasImport` 必须是**函数**而不是模块本身。

```js
// ✗ 报错 "Parameter canvasImport is required in Node.js environment."
renderPageAsImage(bytes, 1, { canvasImport: await import("@napi-rs/canvas") })
// ✓
renderPageAsImage(bytes, 1, { canvasImport: () => import("@napi-rs/canvas") })
```

unpdf 内部是 `await interopDefault(canvasImport())` —— 它自己会调用这个 thunk。

坑二（更隐蔽）：**pdf.js 会 transfer（detach）传进去的 ArrayBuffer**，所以同一份字节不能复用第二次。

```
先 extractText(pdf) 再 renderPageAsImage(bytes)  →  Cannot transfer object of unsupported type.
每次调用都传一份新拷贝                              →  正常
```

原因是 pdf.js 通过 `postMessage` 把 buffer **转移**给 worker，原 buffer 随即被置空。第一版我的上传流程正好是"先抽文字、失败再渲染"，必然踩中。修法是 `server/travel-plan.service.ts` 里每次调用都传 `new Uint8Array(bytes)` 的**新拷贝**。

顺带：`@napi-rs/canvas` 是原生模块，必须写进 `next.config.ts` 的 `serverExternalPackages`，否则 Next 会尝试打包 `.node` 二进制而失败。

验证方式：用 `@napi-rs/canvas` 画一页行程 → 编码成 JPEG → 包进一个只含图片 XObject 的 PDF（**故意不放文字对象**），生成的 fixture 文字层确实是 0 字符，正好用来证明走的是 OCR 而不是文字层。

**15. 重新生成演示数据会把注册过的账号一起删掉（"下次登录又要重新注册"）**

用户反馈"下次登录还要重新注册"。查下来不是会话或登录的问题，而是**种子脚本自己的锅**：

```ts
await prisma.user.deleteMany();   // ← 把所有账号删光，包括真实注册的
```

会话 Cookie 有效期是 30 天，本来不该掉线；但我在开发与测试过程中反复执行 `npm run db:seed`，每次都把用户的账号删了。这个问题的隐蔽之处在于：**它不报错、不崩溃，只是"账号不见了"**，很容易被误判成认证逻辑有 bug。

修法是让种子脚本变成**可重复执行且非破坏性**的：

- 种子用户按邮箱 `upsert`（不再是先删后建），真实注册的账号完全不碰
- 给 `Listing` 加了 `seedKey` 唯一键，房源改为按它 `upsert` —— **房源 id 因此保持稳定**
- id 稳定这一点是关键：否则真实用户的心愿单条目与订单会因为外键级联而被连带删除
- 演示心愿单只在"不存在或为空"时补种，用户自己整理过的内容不会被覆盖

顺带踩到两个小坑：给已有数据的表加唯一索引时 Prisma 会要求交互确认（CI 里跑不了），所以改用 `migrate deploy` + 手写迁移 SQL；而用 PowerShell 的 `Set-Content -Encoding UTF8` 生成的 SQL 文件**带 BOM**，PostgreSQL 直接报 `syntax error at or near ""` —— 迁移文件必须用无 BOM 的 UTF-8。

现在验证方式是 `scripts/smoke-weather-profile.mjs` 里的一条断言：注册账号 → 改资料改密码 → **真的执行一次 `db:seed`** → 再用新密码登录，必须成功。

**16. 从受进程管理器约束的环境启动服务，整个进程树会被回收**

`localhost:3001` 报 `ERR_CONNECTION_REFUSED`，同时数据库也一起消失。原因是：在把命令放进 Windows **Job Object** 的环境里（CI、部分 IDE 终端封装器、AI Agent 工具的后台任务），当环境清理时，**整棵进程树都会被回收**——dev server 和 postmaster 一起没了。

这和之前那个 `0xC0000142` 是同一套机制的两个表现：

| 启动方式 | 结果 |
| --- | --- |
| 在受约束环境里跑 `db:start`（命令结束即回收 Job） | postmaster 残留但**无法派生 backend** → 连上就 `ECONNRESET` |
| 整个 Job 被清理 | 服务直接消失 → `ERR_CONNECTION_REFUSED` |

所以本项目加了三道保险：

1. **`start.cmd`**：一键启动，并**检测 3001 端口是否已被占用**——因为端口是固定的，重复启动会以 `EADDRINUSE` 崩溃，提示清楚比抛异常好。
2. **`npm run db:serve`**：父进程常驻的前台守护模式，供确实无法脱离 Job 的环境使用。
3. README 里明确写了「请在你自己的终端里启动服务」——终端本身就是那个长生命周期父进程，不会有这个问题。

**17. AI 回复里的 `**` 直接显示给用户 + 助手面板按钮重叠**

两个纯 UI 问题，但都直接影响观感：

- 模型输出的是 Markdown（`**加粗**`、`- 列表`），而聊天气泡只是 `whitespace-pre-wrap` 原样输出，于是星号被当成了正文。
- Sheet 组件自带的关闭按钮是 `absolute top-3 right-3`，而对话头部右上角也放了「清空」按钮（`px-4 py-3`），两者区域重叠。

修法：

- 写了 Markdown 子集的解析与渲染。**特意没有引入 markdown 库**：模型只会用很有限的几种语法，而且解析逻辑被我抽成 `lib/agent-markdown.ts` 的**纯函数**，可以直接单元测试（`scripts/verify-markdown.ts`，21 项断言，测试数据直接取自截图中那段真实回复）。渲染层不使用 `dangerouslySetInnerHTML`，模型输出无法注入标记。
- 助手面板关闭内置关闭按钮（`showCloseButton={false}`），改由对话头部自己渲染「清空 + 关闭」两个按钮，放在同一行自然就不会重叠。

另外做了一个小重构：Markdown 解析最初写在 React 组件里，导致**无法测试**——而这恰恰是用户报的问题。把它抽成纯模块后，才会发现"加粗整行不会被误判为列表项"这类边界，也才有测试守住。

**18. 24 个预设头像里有 22 个是裂图（头像服务对每个请求都返回 403）**

症状：个人主页的预设头像几乎全是裂图，只有零星几个能显示。

排查：没有先怀疑自己的组件，而是直接请求头像服务本身的地址 —— `i.pravatar.cc` **对每一个 URL 都返回 403**。所以这是第三方服务单方面失效，与代码无关。这类"看起来像前端 bug 的第三方故障"很容易被误判成组件写错了。

修法：**不再依赖任何外部头像服务**，改为把 12 个预设头像作为本地 SVG 打包进 `public/avatars/`，由 `scripts/make-avatars.mjs` 脚本生成（6 组配色 × 3 种剪影，每个不到 1KB）。种子脚本会把历史遗留的 `pravatar` 头像一次性迁移到本地预设（实测迁移了 4 个账号）。

两个顺带得到的改进：

- 新账号用 `presetAvatarFor(seed)` 按邮箱哈希**确定性**分配头像，而不是每次登录随机变一个。
- 生成的图形**用视觉模型逐张看过**。第一版的"长发"剪影渲染出来像个钥匙孔（头发画在头之前，被后画的头盖住了大半），肉眼在小尺寸下根本没看出来；调整绘制顺序（肩 → 发 → 头）并区分实心/半透明填充后才正常。

教训：**依赖外部免费资源就要准备好它随时失效**。图片这类资源体积很小，内置进仓库是最稳的选择。

**19. `next dev` 长时间运行后 Turbopack 内部状态损坏，表现为一个假的 500**

症状：回归测试里"支付页本人可打开"这条突然变成 `got 500`，而此前一直是 200。

排查：第一反应是刚做的改动把支付页改坏了（这一轮确实动了 `payment-panel.tsx`）。但去看 `data/dev.log` 才发现，整个日志被构建工具的崩溃刷屏了：

```
FATAL: An unexpected Turbopack error occurred
  Cell CellId { type_id: ValueTypeId { id: 550,
    name: ValueType { name: "turbopack_ecmascript::hmr::version::EcmascriptMergedChunkVersion" } },
    index: 0 } no longer exists in task TaskId { id: 583719 }
[Server HMR] Subscription error, resubscribing: Error [TurbopackInternalError]
```

也就是**开发服务器的增量编译状态已经损坏**（这一轮连续改了很多文件，还动过 `next.config.ts`），并不是应用代码抛异常。

修法：停掉开发服务器、删掉 `.next/dev` 缓存后重启。重启后 `Ready in 309ms`，同一条断言恢复 200，整个 API 套件 **142 / 142** 通过 —— 确认了这个 500 是假警报。

教训：**测试失败时先读服务端日志，再改代码**。如果直接去翻支付页的代码，会在一个不存在的问题上耗很久。另外记住一条硬约束：**`next dev` 还活着的时候绝不能跑 `next build`**，两者会争抢 `.next` 目录并把开发服务器直接杀掉（退出码 `1073807364`）。

**20. 依赖第三方实时数据的断言，会把服务抖动误报成构建失败**

天气来自 Open-Meteo，这一套断言因此在一次运行里出现了两个假失败：

- `GET /api/weather?city=Tokyo -> 200` 变成 404。但 `getCityWeather()` 在"城市不支持"和"服务不可用且无缓存"两种情况下都返回 `null`，路由因此统一报 404（这是刻意的设计——没数据就不渲染卡片）。所以供应商抖动会让"已知城市"也返回 404，而这条断言写成了 `=== 200`。
- `GET /api/weather?all=1` 断言恰好 6 座城市。但 `getAllCityWeather()` 会 `filter(entry => entry !== null)` **丢掉取不到的城市**，所以供应商部分失败时返回 5 个或更少是符合契约的，不是 bug。

修法：

- 端点级断言改为接受"200 带数据"或"404 且供应商不可用"两种形态，把严格的 200 判断交给 `liveCheck`。
- `all=1` 拆成两条：**确定性**的一条只断言"返回的每一条都是完整的"，**数量为 6** 交给 `liveCheck`。
- 供应商状态从"开头拍一次快照"改成**每次实时响应都刷新**（`noteProvider`），中途抖动时后续断言转为 SKIP 而不是 FAIL；对"巴黎"这种多余的独立请求加一次重试。

改完后连续跑 3 次都是 **39 / 39**。

教训：**测试第三方依赖时，要把"确定性"和"依赖外部"的断言分开**。前者永不免除，后者该跳过就跳过。让供应商的一次超时显示成红色的失败，会让人逐渐不再相信这套测试 —— 那比没有测试更糟。

**21. 部分房源图片加载失败（是网络，不是代码）**

症状：搜索结果页有几张房源卡片显示成占位块。因为这一轮刚好给图片加了"失败就显示居中说明文字"的降级，所以需要先确认：**到底是我们的改动错了，还是真的加载不到？**

排查：写了 `scripts/diagnose-images.mjs`，用真实的房源数据同时请求**上游原图**和 **`/_next/image` 优化后的地址**，并且把结论分成三种互斥的成因：

```
  listing                               upstream      via /_next/image  verdict
  蚕室站步行2分钟 · 温馨公寓｜首尔                 ERR 10670ms         200 44KB 0.0s  ok
  肖尔迪奇独栋小院 · 可住8人｜伦敦                 ERR 10730ms          504 0KB 0.0s  too slow for Next
  梨泰院站步行4分钟 · 通透公寓｜首尔                ERR 10726ms          504 0KB 0.0s  too slow for Next
  代官山站步行4分钟 · 精致公寓｜东京             200 110KB 0.0s         200 34KB 0.0s  ok
  ...

  => The optimizer is fine. The failures are the upstream network path
     to images.unsplash.com, not our code.
```

结论很明确：**上游 200 的时候，优化器 100% 都能正常返回**（0 例优化器失败）。失败的那几张是到 `images.unsplash.com` 的连接本身中断（约 10.7 秒后报错），其中一张单独测时甚至用了 **114 秒**才下载完 148KB——而 Next 的图片优化器给上游只有约 7 秒，超时就回 504。所以这是**本机到 Unsplash 的网络通路问题**，不是应用代码的问题。

顺带确认了这个降级的价值：如果没有 `SafeImage`，这几张卡片会显示成浏览器原生的裂图图标；现在它们优雅地降级成居中的图标加说明文字，页面整体观感依然成立。

> 如果你在自己的网络下也遇到同样的裂图，可以直接跑 `node scripts/diagnose-images.mjs` 看到底是哪一段慢。种子脚本里的 45 个图片 id 在写入时**逐个验证过返回 200**，所以 4xx 基本可以排除。

**22. 「1 位」在入住人数里永远选不到（两处 off-by-one）**

用户反馈"入住人数没有单人选项"。看代码，问题不在缺选项，而在步进逻辑：

```tsx
// 加号：从「不限」直接跳到 2，1 被跳过
onClick={() => onChange({ guests: guests === 0 ? 2 : Math.min(16, guests + 1) })}
// 减号：从 2 直接回到「不限」，也到不了 1
onClick={() => onChange({ guests: guests === 3 ? undefined : guests - 1 })}
```

合起来的效果是 **1 完全不可达**：从 `不限` 出发只能得到 2、3、4…，而从 2 往回减又直接变成 `不限`。（原始减号阈值写的是 `<= 3`，实际连 2 都到不了。）

修法：取值域明确定义为 `不限(0) → 1 → 2 → … → 16`，并把规则抽成 `lib/guests.ts` 的纯函数：

```ts
increaseGuests(0) === 1        // 不再是 2
decreaseGuests(2) === 1
decreaseGuests(1) === 0        // 回到「不限」
```

同时补了 `scripts/verify-guests.ts`（17 项）。其中最有价值的一条不是逐个断言，而是**可达性**：从 `不限` 反复加到底，必须**不重不漏地经过每一个取值**，且反向减回来正好是它的逆序。这才是"1 选不到"这类 bug 的真正形式化描述——逐个写 `increaseGuests(0) === 1` 只能证明我想到的那一步，可达性才能证明没有别的洞。

顺带确认了后端一直是对的（`guests >= 1` 才生效、校验最小 1），所以这只是 UI 的锅。另外补了 API 断言：`guests=1` 正常返回且不过滤掉任何房源（所有房源都至少能住 1 人），而 `guests=0/-1/17` 一律 400——`不限` 在协议层是**省略该参数**，不是传 0。

**23. 自己上一步的改动把"选预设头像"改坏了（改了数据格式却没改校验）**

用户还没报，但在做个性化主页时顺手一测就撞上了：**点预设头像 → 保存 → 400**。

```
400  "/avatars/avatar-5.svg"   请求参数不合法
200  "https://example.com/a.png"
```

原因是我上一轮把头像从 `i.pravatar.cc` 的**绝对 URL** 换成了本地打包的**同源相对路径**（`/avatars/avatar-5.svg`），却没有同步改校验规则——`z.url()` 和 `updateProfile` 里的 `^https?://` 都只接受绝对 URL，于是 12 个预设头像**没有一个能保存**。

这属于"改了数据的形状，却没改约束它的地方"。修法不是在两处各打一个补丁，而是让规则只有一个来源：

- `lib/avatars.ts` 新增 `isPresetAvatar()`，**按精确清单匹配**（而不是 `/avatars/` 前缀）——这样能接受的恰好就是我们打包的那 12 个文件，没人能把头像指到任意同源路径上。
- `lib/validators.ts`（Zod）与 `server/user.service.ts`（服务层）都调用它，两层规则一致。

顺手把 DTO 的字段映射也收敛成一处：原来 `lib/auth.ts` 的 `getCurrentUser()` 自己写了一份 `select` + 手拼 DTO，和 `server/user.service.ts` 的 `toDto` 重复——加字段时必然漏掉一边（这次就漏了），现在直接复用 `getUserById()`。

**教训：测试通过不等于功能可用。** 这套断言里有"头像能保存"，但它传的是 `https://…`；而 UI 实际传的是 `/avatars/…`。断言覆盖了端点，却没覆盖**用户真正会走的那条路径**。补测之后专门加了预设路径、未知预设路径、以及 `/etc/passwd` 这类任意同源路径的用例。

**24. 跑完迁移后开发服务器还在用旧的 Prisma Client**

加完字段、迁移也应用了、`tsc` 也过了，但登录接口直接 500：

```
Unknown field `coverPreset` for select statement on model `User`.
Available options are marked with ?.
```

磁盘上的 Client 已经是新的（`prisma generate` 明确输出了新字段），但**正在运行的 `next dev` 进程里还驻留着迁移前加载的那份 Client**——模块已经被 require 进内存，改文件不会让它重新求值。重启后立刻正常。

和之前那个 Turbopack 假 500 是同一类问题的两面：**改了 Prisma schema 之后，光跑迁移不够，还要重启开发服务器**。以后遇到"字段明明加了却说不存在"，先重启再怀疑代码。

**25. 房源图片"经常长时间加载不出来"（上游 CDN 不稳，不是代码）**

用户的反馈是"页面经常长时间加载不出图片"。先用 `scripts/diagnose-images.mjs` 把三种互斥成因分开，结论很干净：

```
upstream 200 时优化器 100% 正常（0 例优化器失败）
失败的几张是到 images.unsplash.com 的连接本身中断（约 10.7s 后报错）
单独测一张 148KB 的图，用了 114 秒
```

Next 的图片优化器给上游只有约 **7 秒**，超时就回 **504**——所以"优化器优化不动"和"页面一直转"是同一件事的两种说法。

修法不是在 Next 上调超时（再等 100 秒也没有意义），而是**把运行时依赖变成静态资源**。关键观察是：种子里其实只有 **45 张不重复的照片**，在 180 套房源之间复用。所以只要下载 45 次就够了：

- `npm run images:fetch` 把 45 张抓进 `public/listings/`，写出 `manifest.json`；脚本**可续跑**、带重试与退避、并发 3，并且**从 `prisma/seed.ts` 里解析 `PHOTO_IDS`**，保证照片清单只有一个来源
- 种子读 manifest：本地有就用 `/listings/xxx.jpg`，没有才回退远程 URL（所以不跑这步也能用，只是慢）
- `next/image` 照旧按断点裁切，但读的是本地文件，**不再有上游请求**

实测（`node scripts/bench-images.mjs`）：

| | 修复前 | 修复后 |
| --- | --- | --- |
| 成功返回 200 | 约 2/3，其余 504 | **12 / 12** |
| 单张耗时中位数 | 超时（约 7 秒后中断） | **约 4 ms** |
| 最慢一张 | 100 秒级 | **6 ms** |

顺带发现一个更值得记的点：**45 张图的首次下载总共只花了约 40 秒**（并发 3），说明这条链路不是"带宽慢"而是**间歇性卡死**——同一张图上次 114 秒、这次 1.2 秒。这类故障用"优化超时"是救不回来的，只有把资源搬到本地才彻底消失。

还有一条测试层面的教训：这条断言原来写的是 `g.url.startsWith("http")`，它把"图片必须是远程 URL"当成了不变量——而这恰恰是我这次改掉的东西。断言随实现更新为"要么是 `/listings/` 本地路径、要么是 http(s)"，并**新增了一条真的去请求图片、要求返回 200 的断言**：格式正确但 404 的 URL 正是最初那个 bug 的形态，只看字符串前缀是抓不到的。

**26. 城市查询会连带返回整个国家的房源**

加城市时发现的既有 bug：在京都查询返回了 36 套，而其他城市都是 18 套。

根因在 `buildListingWhere()`：

```ts
if (city) {
  matches.push({ city: { equals: city.name } });
  matches.push({ country: { equals: city.country } }); // ← 无条件加上
}
```

`findCity("Kyoto")` 解析出的城市其 `country` 是 Japan，于是"按国家匹配"这条也被加了进去，把东京的房源一起捞了出来。**城市名不是国家请求**——写这段时的本意是让「日本 / Japan」能查到该国全部房源，但没区分用户输入的是城市还是国家。

修法是只在**输入确实指向国家时**才放宽到国家：`country` 的英文名或 `countryZh` 与输入完全相等才算。修完的实测：

```
Kyoto    → 18  cities: Kyoto          Japan → 36  cities: Kyoto/Tokyo
京都      → 18  cities: Kyoto          日本  → 36  cities: Kyoto/Tokyo
Barcelona→ 18  cities: Barcelona      Spain → 18  cities: Barcelona
```

这个 bug 在只有 6 座城市、且每国只有一座城市时**完全看不出来**（伦敦、巴黎、纽约、首尔、新加坡各自独占一个国家，只有东京+京都同属日本才暴露）——是"增加数据量"这个动作把它逼出来的。

**27. 双击 `start.cmd` 后浏览器一直"拒绝连接"**

用户反馈双击启动后 `localhost:3001` 仍然 `ERR_CONNECTION_REFUSED`。截图显示终端停在：

```
[1/2] Starting PostgreSQL (embedded, port 55432) ...
> node scripts/db.mjs start
[db] starting PostgreSQL on 127.0.0.1:55432 ...
_
```

也就是说**它卡在数据库这一步，从来没走到启动 Web 服务那一步**。用 `db:doctor` 一看就清楚了：

```
OK    database accepts connections — 127.0.0.1:55432
OK    database "travel_agent" has tables — 180 listings / 22 users
FAIL  web server — nothing answering on port 3001 (run: npm run dev)
```

数据库是好的，**Web 服务根本没起来**——于是浏览器拒绝连接。

三个真正的缺陷：

1. **`isRunning()` 只信 `pg_ctl status`**。它只检查 `postmaster.pid` 里的 PID 还活着，所以对一个"进程在、但已无法派生 backend"的 postmaster 依然报 running（也就是 README 里早写过的 `0xC0000142` 那种状态）。判断"数据库能不能用"必须靠**一次真实的 `select 1` 往返**。
2. **有无限等待**。`scripts/db.mjs` 里所有 `spawnSync` 都没有 `timeout`。`pg_ctl status` / `start` / `stop` 任何一次卡住，脚本就永远停在那里，用户只看到一个光标。
3. **失败即静默**。数据库没起来，脚本就不再往下走，既不告诉用户 Web 服务没启动，也不说为什么；浏览器那句"拒绝连接"是用户能得到的唯一线索。

修法：

- `run()` 强制带超时（db:start 时给 `pg_ctl` 75s、stop 60s、status 20s、initdb 180s），并用 `timedOut` 区分"超时被杀"与"正常失败"。
- 新增 `probe()` / `waitUntilReachable()`：**用真实连接**判断可用性，启动后再等最多 30s 拿到一次成功往返，否则报错退出。
- `start()` 现在能识别"端口在听但连不上"这一具体状态，并直接打印修复步骤（`npm run db:stop` → `npm run db:serve`）。
- 新增 `npm run db:doctor`：逐项体检并输出每条 FAIL 对应的修复命令。
- 新增 `scripts/wait-for-server.mjs`：轮询 `/api/meta` 直到 **HTTP 200**，每秒打一个点。`start.cmd` 用它**确认网站真的能访问之后才打开浏览器、才打印 Ready**。
- 重写 `start.cmd`：三步进度 + `db:ping` 复核 + 就绪轮询；Web 服务放到独立窗口（关掉它即停止网站，启动窗口可安全关闭）；任何一步失败都会 `pause` 并自动跑一次 `db:doctor`，而不是让窗口一闪而过。

顺带说明为什么 `pg_ctl status` 不能被当作真相——这也是这次最值得记的一点：**"进程还在"和"服务可用"是两件事**。凡是做健康检查，就要检查那个真正被依赖的能力（能不能连上、能不能查），而不是检查它的代理指标（进程在不在、端口听没听）。

**28. 一排六个新功能：评论、地图、吸顶搜索、入住须知、个性化推荐，以及"已经做过"的爱心**

按用户列的顺序做，但第一项先做了一次核实：**首页与搜索页的房源卡片上其实已经有爱心了**（`ListingCard` 里的 `FavoriteButton`，`SavedSync` 会把已收藏状态从服务端灌进 Zustand）。用 DOM 数了一下：首页 8 个、搜索页 12 个，与卡片数一致；收藏接口与跨用户隔离在 `smoke-api.mjs` 里也一直是绿的。所以这一项没有重做，只是把结论告诉了用户——**先验证"是不是真的缺"，比直接开工更省事**。

其余五项里，有三个坑值得记：

**(1) 吸顶搜索栏重叠。** 用 `IntersectionObserver` 观测一个哨兵元素来决定何时显示紧凑栏。第一版把哨兵放在搜索栏**上方**，于是搜索栏顶端刚越过 header 就切换——可那时 Hero 搜索栏还有大半在屏幕上，**两条搜索栏同时出现**。把哨兵移到搜索栏**下方**后，它离开视口的时刻恰好等于 Hero 搜索栏底边缩进 header 之下，也就是"彻底看不见"的时刻。教训：**判断"元素是否已离场"，观测点要放在它的下游而不是上游**，否则得到的是"刚开始离场"。

**(2) 地图标记挂在边缘外。** 瓦片拼贴最初对齐到整块瓦片（`floor` 到瓦片边界），标记位置就等于坐标在它自己那块瓦片里的偏移——完全看运气。东京算出来落在拼贴的 **97%** 处，几乎贴在底边。改成**以坐标为中心**：先算坐标在整张世界图上的像素位置，再让它落在拼贴正中，瓦片层反向偏移不足一格的距离（`offsetX/Y` 是 `[0, tileSize)` 的余数）。现在标记恒在正中，单测对 6 座城市 × 5 个缩放级别断言漂移 < 0.001px。
　另外这一项也是**先测网络再选方案**：OpenStreetMap、Carto、Wikimedia、Stadia **全部连不上**（和 Unsplash 同一类问题），只有 Esri 可达且在四城 × 两缩放级别下全部 200。如果一开始就按"最标准"的做法上 Leaflet + OSM，交付的会是一张全灰的地图，而且我在这里根本验证不了。

**(3) 自己的测试把数据搞脏了，导致一个假失败。** "评论删除后条数应该回落"这条断言失败。查下来不是删除有问题，而是**同一脚本前面的"房东不能评价自己房源"用例**：我用 `host.linxiao` 去评价了一个**并非他发布**的房源，于是那次提交合法成功、多出一条评论，把后面的计数基准打乱了；而我的断言写成了 `403 || 201` 这种两边都算过的宽松条件，等于没测。改成先找到 `hostName === "林晓"` 的房源再断言必须是 403。教训：**宽松的断言不只是"测不出来"，还会制造脏数据，让别处的失败看起来像 bug**。

顺带两处"断言假设错了"：`/api/agent` 只返回模型配置、不列工具清单，所以"工具已注册"改到 `verify-tools.ts` 里对 `createAgentTools` 做单元断言；以及"搜索两次悉尼应该排第一"——但**同一小时内的重复搜索按设计会被折叠**，所以两次悉尼只算一次，排名由时间衰减决定。断言改成贴合设计：两座被搜过的城市都要出现、总数应为 2（悉尼一次 + 巴黎一次），并把"重复搜索被折叠"本身也断言下来。

**29. 三件事：爱心"看不见"、缩窄"不自然"、以及一次自己造成的编码事故**

**(1) 爱心其实一直在，只是看不见。** 用户第二次反馈"主页房源没有爱心"。我没有直接再写一遍，而是先取证：DOM 里首页有 8 个、搜索页有 12 个收藏按钮，与卡片数一一对应；再把卡片右上角放大 2 倍截图确认——**4 张完整可见的卡片上都有爱心**。所以问题不是"没有"，而是**看不清**：原来的样式是 `bg-black/25` 的圆底 + `fill-black/30` 的心形，在明亮的房源照片上几乎融进背景。
　　改成 Airbnb 那种对比：`bg-black/45` + 一圈 `ring-white/25` 发丝边 + 阴影，心形改成白色描边加一点半透明填充，直径 32→36px；**已收藏状态翻转成白色圆底 + 品牌红实心**，两种状态一眼可分。

　　**教训：用户说"没有"时，先确认是"不存在"还是"看不见"。** 直接重写会做出两套重复的 UI，而真正的问题是可用性。

**(2) 缩窄要"跟着主搜索栏从两边收"。** 用户觉得原来的缩放不自然。原来紧凑栏是以固定宽度淡入的，和 Hero 那条没有关系。改成**以 Hero 搜索栏实测宽度起步、随滚动线性收窄到 576px**，居中容器让收窄表现为左右同时向内；圆角同步从 24px 收到 16px。进度改为由搜索栏自身的 `boundingClientRect` 推导，不再用哨兵——它底边越过 header 的那一刻既是"吸顶"也是"开始收窄"。
　　实测三个滚动位置的内联宽度：768px → **624.6px** → 576px，且 `768 − 192 × 0.746875 = 624.6` 与代码插值一致，说明是连续插值而不是两段跳变。

**(3) 我又用 PowerShell 改中文源码，把文件写成了乱码。** 用 `Get-Content -Raw` + `Set-Content` 批量替换 `site-header.tsx` 里的中文字符串，结果得到 `AI 鍔╂墜`、`璐︽埛鑿滃崟`。这不是第一次（之前 README 也被这样弄坏过一次），而且这次是**并行工作的子代理先发现的**——它在报告里引用了那行乱码。
　　处理方式是 `git checkout` 还原，然后**全部改用 edit 工具**重做（edit 工具按 UTF-8 读写，不经过 PowerShell 的编码猜测），并加了一道自检：用脚本扫描源文件里剩余的 mojibake 字符与 BOM。

　　**结论很明确：不要用 PowerShell 的读写 cmdlet 处理含中文的源码。** 同一类事故在一个项目里发生两次，就不是意外而是流程问题——现在凡是替换中文，一律走 edit 工具，需要批量时写一次性 Node 脚本（`readFileSync`/`writeFileSync` 显式 `utf8`）而不是 shell 管道。

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
| 天气用 Open-Meteo 而不是付费天气 API | 免注册、免 API Key、全球覆盖，`git clone` 后无需额外配置即可运行；代价是依赖外部服务，因此加了 15 分钟缓存与"取不到就不渲染"的兜底 |
| 自写 Markdown 子集而非引入 markdown 库 | 模型只用几种语法，自写体积为零、且是纯函数可单测；同时完全不碰 HTML 解析，没有注入面 |
| 主题切换用 CSS 而非读取 `resolvedTheme` | 服务端不知道主题，读它需要 mounted 守卫，而在 effect 里 setState 正是 React lint 规则禁止的。用 `dark:hidden` / `dark:block` 两个图标由 CSS 决定，既无水合不一致也不需要守卫 |
| `Listing.seedKey` 唯一键 | 让种子脚本能 upsert 而不是先删后建，房源 id 稳定 → 真实用户的心愿单与订单不会被级联删除 |
| 改密码必须验证当前密码 | 只凭会话 Cookie 不能改密码，避免 Cookie 泄露后被永久夺号 |
| 预设头像内置为本地 SVG，不引外部头像服务 | 原来用的 `i.pravatar.cc` 已对每个请求返回 403（24 个里坏了 22 个）。本地文件永远能加载、离线可用、每个不到 1KB；代价是预设从 24 个变成 12 个，但 12 个都是确定可用的 |
| 头像按邮箱哈希确定性分配 | 同一个账号每次登录拿到同一张头像；若用随机数，用户每次进来看到的自己都不一样，会以为账号串了 |
| 图片统一走 `SafeImage` 组件 | 浏览器原生的裂图占位无法控制、alt 文字会溢出。统一接管后任何房源图失效都优雅降级为居中图标 + 居中说明文字，且 6 处调用点行为一致 |
| 价格滑块拖动中只更新本地状态，`onValueCommit` 才提交 | 拖动过程不触发查询、不写 URL：既保证跟手不卡顿，也不会把几十条中间状态塞进浏览器历史，让"后退"变得不可用 |
| 价格输入框非受控 + 失焦/回车才提交 | 受控输入会在用户刚敲下"1"时就触发一次全量查询并打断输入；非受控加显式提交既避免了抖动，也便于在输入非法时恢复成当前生效值 |
| 主页背景用本地 CSS 渐变而不是图库照片 | 8 个预设是 Tailwind 渐变类，离线可用、永远不裂图、深色模式下也成立；自定义背景图加载失败还能回退到渐变。用图库照片则会重演头像服务 403 那一幕 |
| 个性化内容存成 Postgres 数组（`String[]`）而不是关联表 | 这些是**有序的短标签**，没有独立生命周期、不需要被单独查询或引用，建四张关联表只会让增删改都要开事务。数组配 `normaliseChips()` 清洗足够，上限（8/10/12/24）也天然限制了体积 |
| 未出现的字段视为"不要动"，而不是"清空" | 编辑器按区块保存，若把"没传"当成"清空"，改一次爱好就会把背景、标签、去过的地方全部抹掉。支持分区块保存的前提就是这条语义 |
| 芯片清洗在服务端再做一遍 | 前端已限制长度与数量，但 API 是公开入口，去重/截断/上限必须由服务端保证；前端只负责体验，不负责正确性 |
| 头像校验按"精确清单"而不是路径前缀 | 只接受我们打包的 12 个文件，避免把头像指到任意同源路径（例如 `/etc/passwd` 这类会被当作 URL 的输入） |
| 房源图片下载进仓库，而不是运行时取 | 上游 CDN 实测单张 114 秒、约 1/3 请求失败，而 Next 给上游只有约 7 秒，于是表现为"图片一直加载不出来"。45 张图共 7.1MB，一次下载换掉全部运行时不确定性，也让 demo 能离线跑 |
| 图片下载脚本从 `prisma/seed.ts` 解析 `PHOTO_IDS` | 照片清单若在种子和下载脚本里各写一份，加图时必然漏掉一边；解析同一个来源可以保证两者不脱节 |
| 种子优先本地图片、缺失才回退远程 | `git clone` 后不跑 `images:fetch` 也能启动（只是慢），不会因为少了一步就出现裂图或报错 |
| 首页层次感用分层低对比渐变，而不是重阴影 | 用 `color-mix()` 从主题 token 混出渐变，浅色/深色自动各自成立、不必写两份规则；对比度刻意压低，做到"感觉得到但看不出来"，仍然是简约风 |
| 深色模式的搜索框抬到 `--secondary` 而非 `--card` | Hero 的暖色光晕让卡片背后的区域比中性背景更亮，只抬一档实测对比度仅 1.07（几乎看不见），抬两档后达到 1.255 |
| 城市名与国家名分开处理 | 按城市查询时不应连带返回同国其他城市；只有输入确实指向国家（`Japan` / `日本`）时才放宽到全国 |
| 健康检查连一次数据库，而不是看 `pg_ctl status` | `pg_ctl status` 只证明 PID 还活着，对一个无法派生 backend 的 postmaster 依然报 running。被依赖的能力是"能查询"，那就直接查一次 |
| `db.mjs` 里每次 `pg_ctl` 调用都带超时 | 无超时的 `spawnSync` 会让 `start.cmd` 永远停在 "starting PostgreSQL ..."，用户只看到光标和一个拒绝连接的浏览器 |
| `start.cmd` 确认 HTTP 200 之后才打开浏览器 | 先打印地址再让浏览器去撞 `ERR_CONNECTION_REFUSED`，是把"没启动成功"伪装成"地址打错了"；轮询到 200 再打开才是确定的 |
| Web 服务放在独立窗口 | 启动窗口要腾出来做就绪检查与错误报告，而且独立窗口意味着关闭启动窗口不会连带把网站停掉 |
| 评论用 `(listingId, userId)` 唯一键 + upsert | 一个人对一套房源只有一条评价：再次提交是编辑而非新增。否则同一人可以反复刷分，平均分立刻失去意义 |
| 评论作者只取自会话 Cookie | 请求体里没有 userId，因此无法以他人身份发表；删除只能删自己的，房东不能评价自己的房源（403） |
| 历史聚合评分与本站评价分开展示 | `Listing.rating` 是种子里的历史聚合，没有逐条记录；把它和真实评价混在一起算，两个数字都会变得不可解释。分开标注则两者都成立 |
| 地图瓦片用原生 `<img>` 而非 `next/image` | 走优化器会在关键路径上多一次上游请求和约 7 秒超时——正是把房源图片打成占位块的失败模式 |
| 地图用瓦片拼贴而不是引入 Leaflet | 无新依赖、无额外 CSS，几何是带 25 项单测的纯函数；代价是不能拖拽，用缩放按钮与外链补足 |
| 地图选 Esri 而不是 OSM | 实测本机只有 Esri 可达（OSM/Carto/Wikimedia/Stadia 全部连接失败）。选能验证的方案，而不是最"标准"的方案 |
| 地图以坐标为中心而非对齐瓦片 | 对齐瓦片会让标记位置取决于坐标落在瓦片内的位置（东京落在拼贴 97% 处）；以坐标为中心则标记恒在正中 |
| 入住须知由房源属性推导而非硬编码 | 标了「可带宠物」就不会写「恕不接待宠物」，标了「免费停车」才写停车位。让规则与设施同源，避免自相矛盾 |
| 只记录登录用户的搜索 | 匿名会话没有可个性化的身份；存陌生人的查询属于"收集了却没有用途" |
| 搜索记录按城市归一化 + 时间衰减加权 | 「东京」与「Tokyo」是一次意图，必须聚合；简单计数会让"上个月搜过 5 次"压过"这周搜过 2 次"，而后者更可能是在计划中 |
| 同一小时内的重复搜索被折叠 | 刷新与拖动滑块都会重复出现同一个 location，不应把信号刷高 |
| 搜索记录用显式 POST 而不是在页面渲染时写库 | GET 里写数据库是坏味道，预取也会误触发；显式 POST 语义清楚，未登录时是个 no-op 而不是报错 |
| 语言存 Cookie 而不是放在 URL 里 | 所有现有路由、链接、分享地址都不用改；代价是无法把语言钉在链接里分享，对本应用不重要。服务端读 Cookie 渲染，因此首屏语言正确、不会闪烁 |
| 自写类型化查表而不是引入 i18n 库 | 应用只有一套字典形状，`Dictionary` 就能让"漏翻译一个 key"变成编译错误；没有复数规则/日期格式的额外需求，`Intl` 已经够用，不值得为此加依赖与构建插件 |
| 参考字典即类型 | 以 zh-CN 的键树为类型、叶子放宽为 `string`（直接用 `typeof zhCN` 会把类型变成字面量，任何译文都无法满足）。这样少 key、多 key 都在编译期暴露 |
| 查不到时回退到参考语言，最后才回退成 key 本身 | 渲染成 key 让缺失在界面上可见，比渲染成空白更容易被发现 |
| 单数形式单独用 `plurals.ts` 配置 | 纯模板替换会输出 "1 nights"；中文/日文/韩文不标记单复数，不配置即可，不需要为它们引入复数规则库 |
| 只翻译界面外壳，不翻译内容 | 房源标题、评论正文、设施说明是创作/用户数据，翻译既不可能准确，也会让数据表变成翻译文件 |
| 语言名用各自语言书写且不用国旗 | 只写 "Chinese/English/Japanese" 的列表对读不懂英语的人没有用；国旗代表国家而非语言 |
| 收藏按钮的对比度由组件自己保证 | 它叠在任意照片上，不能依赖背后的图。`black/45` 圆底 + 白色发丝描边 + 阴影在明暗照片上都清晰，已收藏翻成白底红心，两态一眼可分 |
| 缩窄宽度以主搜索栏实测宽度为起点 | 固定宽度的淡入看起来像"另一条搜索栏"；从实测宽度线性收窄、居中容器让左右同时向内，才读得出是同一个物件在变形 |
| 头像用普通 `<img>` 而非 `next/image` | 用户可填任意图片 URL，走 `next/image` 需要把每个域名加进 `remotePatterns`，对用户自定义地址不现实 |
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
- **扫描件 OCR 还要求模型支持图片输入**。`deepseek-chat` 已验证支持；用 `node scripts/test-vision.mjs` 可以一键检测。若换成纯文本模型，扫描版 PDF / 图片上传会返回明确提示（有文字层的 PDF 与其余功能不受影响）。
- **OCR 会消耗较多 token**：每页按图片计费，因此最多渲染 5 页；页数很多的扫描件建议只上传关键几页。
- **待支付订单不会自动过期**。PENDING 会一直占用日期；生产环境应加超时释放（例如 15 分钟后自动取消）。收银台上的倒计时只是前端提示，不改变后端状态。
- **退款的「到账」是手动模拟的**。真实渠道退款是异步回调驱动的（1-3 个工作日），演示环境用「模拟退款到账」按钮推进 `PROCESSING → SUCCEEDED`，没有真实资金流动，也没有接入渠道退款回调。
- 会话记忆是**进程内**的，重启服务即清空；生产环境应换成 Redis。
- **个性化主页的内容没有长度之外的内容审核**。标签、爱好、地点都是自由文本，只做了去空格、去重、截断和数量上限；这是一个单机演示，没有其他用户能看到你的主页，所以未接入敏感词过滤。
- **主页仅为本人可编辑、无法被他人浏览**。数据模型与接口都已就绪（`GET /api/auth/session` 会返回全部字段），但没有做"查看他人主页"的路由。
- 未接入真实支付（需求明确不要求）。
- 改了 `prisma/schema.prisma` 之后，**跑完迁移还要重启 `next dev`**：开发服务器会把 Prisma Client 常驻在内存里，否则会报 `Unknown field ... for select statement`。
- `@prisma/adapter-pg` 会打印一条 `pg` 的弃用警告（`client.query() when the client is already executing a query`），来自依赖内部，不影响功能。

---

## 十、最终演示流程（3–5 分钟）

| # | 步骤 | 看点 |
| --- | --- | --- |
| ① | 打开首页 | Hero、搜索组件、房源类型分类、热门目的地、推荐房源、Agent 入口 |
| ② | 搜索东京，4 人 | 筛选面板、URL 同步（刷新后状态保持）、房源卡片信息完整 |
| ③ | 进入房源详情 | **多视角图片画廊（带 客厅/主卧/厨房… 角度标签 + 灯箱缩略图）**、房东、**点开任一设施查看说明与当地普及度**、**当地实时天气与 5 日预报**、价格明细 |
| ④ | 登录 | 使用演示账号 `demo@travel-agent.dev` / `Demo1234`；右上角头像菜单 → **个人主页**：换背景、加标签、填心仪地点与已旅行地点展柜、改昵称/头像/密码 |
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
| Tool 必须连接真实业务逻辑 | 9 个工具全部调用 `server/` Service 层 |
| Agent 不得绕过业务层改数据库 | 工具内不出现任何 Prisma 调用 |
| API 必须鉴权与权限控制 | 私人接口 `requireUser()` + 逐次归属校验；跨用户越权测试覆盖读取/写入/删除/取消订单 |
| 每完成一个模块立即测试 | 12 个可复现脚本共 **502 项断言**（155 + 63 + 55 + 50 + 51 + 39 + 26 + 25 + 21 + 17 + DB + AI），全部通过 |
| 不把业务数据写死在前端 | 城市/设施/价格区间均来自 `/api/meta` 与数据库 |
| 每完成一个模块立即测试 | 4 次阶段性提交，每个阶段都有可复现的验证脚本 |
