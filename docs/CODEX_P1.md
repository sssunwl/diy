# CODEX 派工單 — 第一期（趁墟｜香港手作墟）

你在 `/Users/sws/Sun/Claude/DIY/` 工作。這是一個網上手作市集：訪客用像素小人逛香港深水埗的市集街道，點攤位看手作人作品，再連去他們自己的 IG／賣場。手作人可以自己在網站申請擺攤，站長在後台審核。**本期不碰金流、不做帳號登入。**

## 規則（一定要遵守）
- **不要 commit、不要碰 `.git`**；我（Claude）審完自己 commit
- **沒有網路**：依賴已裝好（`vite`、`typescript`、`@cloudflare/workers-types`、`wrangler`），**不要加任何新的 npm 套件**。需要的東西自己寫
- 不要讀或改 `_ref/`（參考截圖，不能進 repo）。附給你的圖只是**版面／氛圍參考**：街道一排排攤位、小人在中間走、底部按鈕、攤位面板。**不要抄它的畫風、文字、「老闆不在」用語**
- 只做本單列出的東西。**不要做**：帳號／Google 登入、留言板、聊天、線上人數、收藏同步、集章、送花、攤位佈置編輯器、金流、日本版內容。看到「可能以後會用到」也不要先做
- 程式註解與介面文字用繁體中文（香港書面語，可以有少量廣東話口語當點綴，例如攤位牌）
- 所有 localStorage 讀寫包 try/catch，壞了也要能玩
- 任何金鑰、secret、email 都不能寫死在程式或設定檔裡（用 `env` 綁定）

## 已有的東西
- `package.json`（scripts：`dev`=vite 5190、`build`=tsc+vite build、`worker:dev`）
- `src/pixelkit/core.js`、`character.js`、`furniture.js`：從我們另一個專案複製的**程式畫像素素材**（純 JS、不靠 DOM）。`core.js` 有 `Bmp`、`sprite(w,h,fn)`、`tone(hex)`、`outline()`、`toCanvas(bmp)`；`character.js` 的 `makeCharacter({skin,hair,hairColor,cloth})` 回傳 sprite sheet（一格 24×32，4 列方向 down/left/right/up × 6 欄 idle0,idle1,walk0..3），還有 `SKINS`、`HAIRS`、`HAIR_NAMES`、`HAIR_COLORS`、`CLOTH_COLORS`、`DEFAULT`、`randomLook(seed)`。`furniture.js` 有 `awning` 等可參考。**攤位、地面、地標等新素材照同一套 API 和畫風自己畫**（俯視斜 3/4、32px 一格、`tone()` 三階色、光從左上、自動描外框），放 `src/pixelkit/market.js`
- `docs/SPEC.md` 是規格，本單已把你需要的都寫進來，有衝突以本單為準

## A. 前台（Vite + TypeScript，無框架）

部署在 GitHub Pages 子路徑 `/diy/` → `vite.config.ts` 設 `base: '/diy/'`。`tsconfig.json` 開 `allowJs`、`strict`。

### A1. 資料
`data/regions/hk.json`（地區設定，前台 import）：
```json
{
  "id": "hk",
  "brand": { "name": "趁墟", "tagline": "香港手作墟", "en": "Chan Hui — Hong Kong Handmade Market" },
  "currency": "HKD", "currencySymbol": "HK$",
  "langs": ["zh-HK", "en"], "defaultLang": "zh-HK",
  "awayLines": ["攤主去咗飲茶", "行開一陣", "去咗買材料", "返屋企開工"],
  "markets": [
    { "id": "ssp", "name": {"zh-HK":"深水埗","en":"Sham Shui Po"},
      "streets": [
        { "id": "ki-lung", "name": {"zh-HK":"基隆街・布行","en":"Ki Lung St · Fabric"}, "slots": 12, "landmark": "fabric" },
        { "id": "yu-chau", "name": {"zh-HK":"汝州街・珠仔鈕扣","en":"Yu Chau St · Beads & Buttons"}, "slots": 12, "landmark": "buttons" }
      ] }
  ]
}
```
攤位資料型別（`src/types.ts`，前後台共用一份型別定義）：
```ts
type Category = 'accessory'|'textile'|'leather'|'ceramic'|'wood'|'paper'|'scent'|'art'|'food'|'class'|'other';
// 中文：飾物、布作／針織、皮革、陶瓷、木工、紙品／印刷、蠟燭／皂／香氛、插畫／藝術、手作食品、手作課程、其他手作
interface Stall {
  id: string;            // 12 碼 base32
  region: 'hk'; market: string; street: string; slot: number;  // slot 0..slots-1
  name: string;          // 品牌名 ≤20
  by: string;            // 攤主暱稱 ≤12
  category: Category;
  color: string;         // 遮雨棚 8 色之一：#e86a5c #f2a541 #f5d76e #7cc6a4 #5fa8d3 #8e7cc3 #f29bb6 #6b7a8f
  sign: string;          // 攤位牌 ≤6 字（可空）
  note: string;          // 給客人的話 ≤40
  items: { name: string; price: number }[];   // 1–3 件，price 0–99999 整數
  photos: string[];      // 1–3 張；示範攤是相對路徑，真攤位是 API 的 /p/... 完整網址
  igUrl: string;         // https://www.instagram.com/...
  shopUrl?: string;      // https，任何賣場
  demo?: boolean;        // 示範攤
  approvedAt: string;    // ISO
}
```
`data/demo/hk.json`：**14 個虛構示範攤**（`demo: true`，igUrl 用 `https://www.instagram.com/`，不要用任何真實帳號），分佈在兩條街、各類別都有，名字有香港手作味（例如「阿婆針線鋪」「石硤尾陶房」）。照片用程式畫的佔位圖：在 `src/pixelkit/market.js` 寫 `productPlaceholder(category, seed)` 產生 96×96 的像素小物（杯、耳環、袋、蠟燭……），面板裡放大顯示（`image-rendering: pixelated`）。示範攤的 `photos` 留空陣列，前台看到 `demo && photos.length===0` 就用佔位圖。

街道上**沒被佔用的 slot = 「誠徵攤主」空攤**（遮雨棚灰色、木牌寫「誠徵攤主」），點了打開申請頁並預選這條街。

資料來源：`src/api.ts` 先 `fetch(API_BASE + '/api/stalls?region=hk')`（3 秒逾時），失敗就用 `data/demo/hk.json`。成功時也**把示範攤補進還沒被真攤位佔用的 slot**（真攤位優先），直到真攤位 ≥ 10 個就不再補示範攤。`API_BASE` 來自 `import.meta.env.VITE_API_BASE`，預設 `https://diy.sssuni.com`；`.env.development` 設 `http://localhost:8790`。

### A2. 市集畫面（Canvas 2D）
- 全螢幕 canvas，`100dvh`，像素放大整數倍（手機 2×、桌面 3×，視窗太小就降一級），`imageSmoothingEnabled=false`
- 一條街＝水平捲動的場景：上下兩排攤位（每排 6 攤，slots 12）、中間行人路；街頭／街尾各有一個「路牌」，走過去可以換到下一條街（或用底部按鈕）
- 每條街有一個地標裝飾：`fabric`（布行：門口掛滿布疋的舖頭）、`buttons`（鈕扣舖：一格格玻璃櫃）。再加幾個街景小物：紅色郵筒、街燈、唐樓招牌（招牌只寫虛構字，不用真實店名）
- 攤位：木桌＋遮雨棚（攤主顏色，條紋）、招牌板寫品牌名（canvas 上用小字型 DOM 疊字或 canvas fillText 都可，要清楚可讀）、桌上擺 3 個商品縮圖；**每攤立一個小牌**寫 `awayLines` 隨機一句（用 id 做種子，固定）＋ 攤位牌文字
- 小人：`makeCharacter(look)`，速度約 90px/s（邏輯像素），走路動畫 8fps。操作：按住拖曳（小人往手指方向走）、點地面（走到那裡）、鍵盤方向鍵／WASD。相機跟著小人，不超出街道邊界。攤位桌子有碰撞
- 走到攤位前方 24px 內 → 攤位上方冒「點我」小提示；點攤位（或靠近按 Enter/空白）→ 開攤位面板
- 另外 3–5 個 NPC 路人（`randomLook`）在街上慢慢隨機走，純裝飾、不碰撞
- 點自己的小人 → 開「換造型」面板：膚色、髮型、髮色、衣服顏色，存 localStorage `diy.look`
- 逛過的攤位存 localStorage `diy.seen`（id 陣列），右上角顯示「逛過 3/12」

### A3. 介面（DOM）
- 頂欄：左「趁墟｜香港手作墟」logo 字；中間切換「逛街」／「品牌牆」；右「我要擺攤」「關於」「中／EN」
- 底部（逛街模式）：「下一攤」（小人自動走到下一個還沒逛過的攤）、「上一條街／下一條街」、「找攤位」（開品牌牆）
- **攤位面板**（手機 = 底部抽屜，桌面 = 右側面板）：照片輪播（1–3 張，點放大）、品牌名、攤主暱稱、類別標籤、示範攤要有明顯「示範攤」標籤、商品清單＋HK$ 價格、「攤主留言」、主按鈕「看 IG」、次按鈕「去賣場」（沒有 shopUrl 就不顯示）——都 `target=_blank rel="noopener noreferrer"`；「分享」（複製 `…/diy/#stall=<id>`，支援 `navigator.share`）；底部小字「本站只展示攤位，不經手交易。購買請直接聯絡攤主。」＋「檢舉」（`mailto:` 收件人從 `VITE_REPORT_EMAIL` 讀，沒設就不顯示）
- **深連結**：網址 `#stall=<id>` → 切到該街、小人出現在該攤前、自動開面板
- **品牌牆**：格狀卡片（照片／佔位圖、品牌名、類別、街名），類別篩選 chip、搜尋框（品牌名／暱稱／商品名），點卡片＝開同一個攤位面板，面板上加「帶我去攤位」按鈕（切回逛街並走到攤位前）
- **關於**：一段介紹、不經手交易、價格以攤主賣場為準、禁售清單（非手作代購轉售、仿冒與侵權角色周邊、菸酒、藥品與療效宣稱、成人用品、活體動物、武器）、檢舉方式
- **第一次進站**：一張 3 步驟小教學（拖小人走／點攤位／點自己換造型），看過存 localStorage
- 中／英切換：介面字串放 `i18n/zh-HK.json`、`i18n/en.json`，程式不寫死介面文字；攤主自己填的資料不翻譯
- 版面：手機 375×667 起，**不能有水平捲軸**；按鈕最少 44px 高；文字不能被 canvas 蓋住（canvas 的 z-index 低於所有 UI）
- 視覺：暖色紙感＋像素風。字型用系統字（`-apple-system, "PingFang HK", "Noto Sans HK", sans-serif`）。不要用漸層紫、玻璃擬態

### A4. 申請頁「我要擺攤」（`#apply`，可帶 `&street=<id>`）
欄位與驗證（前後台同一套驗證函式 `src/validate.ts`，Worker 也 import 它）：
- 品牌名 1–20 字、攤主暱稱 1–12 字、街道（下拉）、類別（下拉）、IG 網址（必填，必須 `https://` 且 host 是 `instagram.com` 或 `www.instagram.com`）、賣場網址（選填，必須 `https://`）、招牌商品 1–3 件（名稱 1–20 字＋價格 0–99999 整數）、給客人的話 0–40 字、攤位牌 0–6 字、遮雨棚顏色（8 色色票）、照片 1–3 張（**至少 1 張**）、email（必填，格式驗證，旁邊寫「只用來通知審核結果，不會公開」）、兩個必勾：「這些是我自己做的作品、自己拍的照片」「我同意這些資料公開展示在趁墟」
- 字數用 `[...str].length` 算（emoji 算 1）
- **照片在瀏覽器端處理**：讀檔 → 中心裁正方形 → 縮到 800×800 → `canvas.toBlob('image/webp', 0.82)`；若 > 200KB 降品質重試（最低 0.6）；支援 HEIC 以外的 jpg/png/webp，不支援的格式顯示錯誤
- 右側（手機在上方）**即時預覽**：用同一套 canvas 攤位繪圖畫出申請者的攤位（遮雨棚色、招牌、攤位牌）
- Turnstile：載入 `https://challenges.cloudflare.com/turnstile/v0/api.js`（唯一允許的外部 script），site key 從 `VITE_TURNSTILE_SITEKEY` 讀；dev 沒設就略過
- 送出 `POST {API}/api/apply`（multipart：`data`=JSON 字串、`photo0..2`=webp 檔、`turnstile`=token）
- 成功畫面：大字顯示**私人管理連結** `https://sssunwl.github.io/diy/#manage=<token>`，有「複製」按鈕，警告「這條連結只會顯示一次，請存起來；之後改資料或收攤都要用它」
- 錯誤要逐欄顯示在欄位下方

### A5. 管理頁（`#manage=<token>`）
- `GET {API}/api/manage`（`Authorization: Bearer <token>`）→ 顯示狀態：待審／已上架／被退回（附原因）／有修改待審
- 可以改全部欄位（同申請表、照片可換可保留），送出 `PUT /api/manage`（multipart，同 apply 格式，`keepPhotos` 陣列表示保留哪幾張舊照）
- 「收攤」：兩次確認（第二次要輸入品牌名）→ `DELETE /api/manage`
- 讀到 token 後立刻 `history.replaceState` 把 hash 清掉，token 存 `sessionStorage`（不要放 localStorage）

## B. 後端（`worker/`，Cloudflare Worker，TypeScript）

`worker/wrangler.toml`：name `diy`、`main = "src/index.ts"`、compatibility_date `2026-10-01`、D1 binding `DB`（database_name `diy`，`database_id` 留 `"REPLACE_ME"`）、KV binding `PHOTOS`（id 留 `"REPLACE_ME"`）、vars：`ALLOWED_ORIGINS = "https://sssunwl.github.io,http://localhost:5190"`、`ADMIN_EMAIL = "sssunjp@gmail.com"`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`（留空字串）。secret：`TURNSTILE_SECRET`（不寫在檔案裡）。

`worker/schema.sql`：
```sql
CREATE TABLE IF NOT EXISTS stalls (
  id TEXT PRIMARY KEY, region TEXT NOT NULL, market TEXT NOT NULL,
  status TEXT NOT NULL,            -- pending | live | rejected
  live_json TEXT,                  -- 已核准、公開中的版本（Stall JSON，不含 email）
  draft_json TEXT,                 -- 待審版本（新申請或修改）
  email TEXT NOT NULL, token_hash TEXT NOT NULL,
  reject_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS stalls_email ON stalls(email);
CREATE INDEX IF NOT EXISTS stalls_region_status ON stalls(region, status);
CREATE TABLE IF NOT EXISTS apply_log (ip TEXT NOT NULL, at TEXT NOT NULL);
-- 登入紀錄（後台用）
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, email TEXT, path TEXT, country TEXT);
CREATE INDEX IF NOT EXISTS visits_at ON visits(at);
```
狀態語意：一攤只要 `live_json` 不為空就公開顯示（即使同時有 `draft_json` 在等審）。`status` 給後台與管理頁看：`pending`（有 draft 待審）、`live`（沒 draft）、`rejected`（draft 被退回，若 live_json 還在就繼續顯示舊版）。

**slot 分配**：核准時，若 draft 的 street 跟 live 的不同、或是新攤，分配該街第一個空 slot（扣掉已核准的真攤位）；該街滿了就放同市集下一條有空位的街；全滿回 409 給後台顯示「這個市集滿了」。

### API
- `GET /api/stalls?region=hk` → `{ stalls: Stall[] }`，只回 `live_json` 解析後的物件。`Cache-Control: public, max-age=60`，並用 Cache API 快取 60 秒。**絕不包含 email、token、IP**
- `GET /p/<key>` → 從 KV 讀照片，`Content-Type: image/webp`，`Cache-Control: public, max-age=31536000, immutable`（key 內含 hash，換照片就換 key）
- `POST /api/apply` → 驗證 Turnstile（`TURNSTILE_SECRET` 沒設時只在 `localhost` 來源放行，其他一律拒絕）→ 同 IP（`CF-Connecting-IP`）1 小時內 ≥5 次回 429 → `validate.ts` 驗證 → email 已存在回 409「這個 email 已經有攤位，請用管理連結修改」→ 照片檢查（必須 webp、≤250KB、讀 RIFF/WEBP 檔頭確認、實際尺寸 800×800）→ 存 KV key `p/<id>/<n>-<8碼sha256>.webp` → 產生 token（32 bytes 隨機，base64url）→ 存 SHA-256 雜湊 → 回 `{ token }`。`photos` 欄位存完整網址 `https://<worker host>/p/<key>`
- `GET /api/manage`（Bearer）→ `{ status, live, draft, rejectReason }`（含攤主自己的 email，因為是本人）
- `PUT /api/manage`（Bearer，multipart）→ 驗證後寫 `draft_json`、status=pending，新照片寫 KV；沒被保留的舊照片**在核准後才刪**（核准前舊版還在顯示）
- `DELETE /api/manage`（Bearer）→ 刪 D1 列＋該攤所有 KV 照片（`list({prefix:'p/<id>/'})`）
- 所有 `/api/*` 都要 CORS（只允許 `ALLOWED_ORIGINS`，含 `OPTIONS` 預檢）；錯誤一律 `{ error: '中文訊息', field?: '欄位' }`

### 後台 `/admin`（只限站長）
- **身份驗證**：Worker 自己驗 `Cf-Access-Jwt-Assertion`：用 `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` 的 JWKS（快取 1 小時）以 WebCrypto 驗 RS256 簽章、`aud` 含 `ACCESS_AUD`、未過期、`email === ADMIN_EMAIL`。不通過 → 403。**本機 dev**：只有在 `ACCESS_AUD` 為空**且**請求 host 是 `localhost`／`127.0.0.1` 時才放行，並把 email 當成 `ADMIN_EMAIL`（部署環境 `ACCESS_AUD` 一定會設，所以正式不會放行）
- `/admin` 回一頁 HTML（`worker/src/admin.html` 以字串 import 或內嵌）：待審清單（新申請、修改待審，修改要並排顯示舊版 vs 新版差異）、每攤可看大圖、點開 IG 連結、核准／退回（輸入原因）／下架（把 live_json 清掉並 status=rejected）；上方切換「待審／已上架／被退回」；顯示各街佔用數
- `/api/admin/list?status=`、`POST /api/admin/approve {id}`、`POST /api/admin/reject {id, reason}`、`POST /api/admin/takedown {id, reason}`
- **登入紀錄**：參考已放好的 `worker/src/visits.ref.js`（後端）與 `worker/src/visits-widget.ref.js`（面板），改寫成 `worker/src/visits.ts` 並把面板嵌進 admin.html，完成後刪掉兩個 .ref.js：只記頁面請求（`Sec-Fetch-Dest: document`）、欄位 時間(UTC ISO)/email/路徑/國家(`request.cf.country`)、保留 365 天（每次寫入 2% 機率順手刪 365 天前的）；`GET /api/admin/visits` 只限 ADMIN_EMAIL，回最近 200 筆；`/admin` 頁底放「登入紀錄」表格（時間轉香港時間顯示）

## C. 部署設定
- `.github/workflows/pages.yml`：push 到 main → `npm ci` → `npm run build`（env：`VITE_API_BASE=https://diy.sssuni.com`、`VITE_TURNSTILE_SITEKEY: ${{ vars.TURNSTILE_SITEKEY }}`、`VITE_REPORT_EMAIL: ${{ vars.REPORT_EMAIL }}`）→ `actions/upload-pages-artifact` `dist` → `actions/deploy-pages`。permissions：`pages: write`、`id-token: write`
- `README.md`：怎麼本機跑（`npm run dev` + `npm run worker:dev`，第一次要 `npx wrangler d1 execute diy --local --file worker/schema.sql`）、怎麼部署、資料結構、**哪些東西絕不能進 repo**

## D. 你要自己驗證的
- `npm run build` 0 錯誤（tsc strict）
- Worker 本機：`cd worker && npx wrangler d1 execute diy --local --file schema.sql`，`npx wrangler dev --local --port 8790` 能起來（沙箱若不讓你開 port 就跳過，寫在回報裡）
- 寫一個 `tools/smoke.mjs`（Node 原生 fetch，無依賴）：對 `http://localhost:8790` 跑 apply（產生 800×800 webp 測試圖可以用一個寫死的最小合法 webp……若產生不了就用前端同一套程式在瀏覽器測，Node 這邊只測驗證錯誤路徑）→ 確認 `/api/stalls` 沒出現待審攤 → 打 `/api/admin/approve`（本機放行）→ `/api/stalls` 出現、而且回應裡沒有 `email`／`token` 字串 → manage GET/PUT/DELETE
- 純函式單元測試 `tools/test.mjs`（無依賴，Node `assert`）：`validate.ts` 的各邊界（字數 emoji、IG host、價格範圍）、slot 分配、JWT 驗證拒絕（假 token、錯 aud、錯 email）。可以用 `node --experimental-strip-types` 跑 TS

## 回報格式
完成後輸出：做了哪些檔、每個驗證項的實際結果（成功／失敗／沒跑和原因）、**哪些地方你偏離了本單或自己多做了什麼**、已知問題。
