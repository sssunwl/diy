# 趁墟｜香港手作墟

第一期：Vite＋TypeScript 無框架前台、Canvas 像素市集、手作人申請與私人連結管理、Cloudflare Worker／D1／KV 審核後台。不提供登入帳號或交易服務。

## 本機啟動

已安裝的依賴足夠，不需新增套件。Node 24 可直接執行 TypeScript 測試。

```sh
npx wrangler d1 execute diy --local --file worker/schema.sql
npm run worker:dev
# 另一個終端機
npm run dev
```

開啟 http://localhost:5196/tekuteku/；後台是 http://localhost:8796/admin。若 Wrangler 版本要求從設定檔目錄執行，使用 `cd worker && npx wrangler d1 execute diy --local --file schema.sql`。本機 D1 與照片儲存在 `worker/.wrangler/`，勿提交。本機無 Access AUD 且 host 為 localhost／127.0.0.1 時才可略過 Access；正式環境必須設定 Access AUD。

`.env.development` 已指定本機 API。按需要在不提交的 `.env.local` 放 `VITE_TURNSTILE_SITEKEY` 和 `VITE_REPORT_EMAIL`。只有 `VITE_` 前綴變數會公開到瀏覽器，絕對不可放 secret。Turnstile site key 是公開識別碼；secret 只存在 Worker。未設 Turnstile secret 時，Worker 只接受 localhost／127.0.0.1 的 Origin 申請。

本機 Worker 環境變數放 `worker/.dev.vars`（不提交），包括 `ADMIN_EMAIL`。未設定時本機以「本機站長」記錄登入。正式 `ADMIN_EMAIL` 是必要綁定；派工單同時要求設定固定 email 及禁止寫死 email，本專案選擇後者，不把個人信箱寫入設定檔。

## 驗證

```sh
npm run build
npx tsc -p worker/tsconfig.json
node --experimental-strip-types tools/test.mjs
node tools/worker-test.mjs
node tools/smoke.mjs
SMOKE_PHOTO=/absolute/path/smoke-800.webp node tools/smoke.mjs
```

`tools/test.mjs` 驗證欄位／Unicode 字數／網址／價格／slot 和 JWT 簽章拒絕路徑。`tools/smoke.mjs` 對本機 Worker 測試驗證錯誤、CORS、管理授權；預設以 `tools/webp-fixture.mjs` 內自行產生的合法 800×800 WebP 測完整申請→審核→公開→修改待審→刪除；可用 `SMOKE_PHOTO` 換成其他照片。`tools/worker-test.mjs` 使用 Node 內建 SQLite、記憶體 KV／Cache 執行同一份 Worker，不需要開 port，但不能代替 Wrangler 實測。用瀏覽器直接開 `tools/photo-fixture.html`，可離線產生真正的 800×800 WebP；沒有使用偽造檔頭冒充圖片。

## 部署

1. 在 Cloudflare 建立 D1 `diy`、KV PHOTOS，把 `worker/wrangler.toml` 的兩個 `REPLACE_ME` 換成實際資源 ID。這些資源 ID 不是密鑰。
2. 執行 `cd worker && npx wrangler d1 execute diy --remote --file schema.sql` 建表。首次本機需另執行 `--local`。
3. 以 `npx wrangler secret put TURNSTILE_SECRET`、`npx wrangler secret put ADMIN_EMAIL` 設定秘密及私人資料。Cloudflare 環境綁定設定 `ACCESS_TEAM_DOMAIN`（只有網域、不含路徑）、`ACCESS_AUD`；更新 toml 的非敏感設定以免後續部署覆蓋。正式 AUD 絕不可空白。
4. Cloudflare Access 保護 `/admin` 和 `/api/admin/*`，只允許站長；Worker 還會獨立檢查 RS256、issuer、aud、有效期與站長 email。Access 不應擋住公開 `/api/stalls`、申請／管理及 `/p/*`。正式 API 綁定 `diy.sssuni.com`，`ALLOWED_ORIGINS` 只填明確來源。
5. 執行 `cd worker && npx wrangler deploy`。在 Turnstile 設定 GitHub Pages 及本機網域。沒有建立自動寄信服務，本期只收集 email 供站長另行通知。
6. GitHub Pages 選 Actions，repo variables 設 `TURNSTILE_SITEKEY`、`REPORT_EMAIL`。push main 後 workflow 建置 `/tekuteku/` 並部署。公開檢舉信箱會出現在成品中，請使用可公開的信箱。`base` 固定 `/tekuteku/`。

## 資料與狀態

`data/regions/hk.json` 是香港地區與兩條街設定；`data/demo/hk.json` 是 14 個虛構示範攤，沒有真實帳號或照片。真攤位優先佔 slot，不足 10 個時以示範攤補空 slot；未使用位置開放申請。全部示範商品與場景由 `src/pixelkit/market.js` 程式繪製，角色沿用 pixelkit。

`src/types.ts` 和 `src/validate.ts` 前後台共用。D1 `live_json` 只含公開白名單資料；email 與 token_hash 分欄存放，公開 API 不回傳。`draft_json` 保留新申請或修改版。修改送審／退回不會抹掉 `live_json`，核准才切換；收攤會刪 D1 與該攤全部 KV 照片。核准才分配位置，資料庫唯一索引阻止同時審核重疊，遇到競爭請重新審核。

照片經前台中心裁切與 WebP 壓縮，後端檢查 250KB、RIFF／WEBP chunk、影像尺寸 800×800；照片以帶內容雜湊的 key 儲存 KV。Worker 不含完整影像解碼器，檔頭／容器檢查不等於完整解碼驗證。更改前後版本都需要的照片會保留至核准。公開 API／照片用 Cache API 60 秒／瀏覽器一年快取，核准、下架、收攤會清除本地 edge 的攤位快取，其他 edge 最多延遲 60 秒。

管理 token 為 32 bytes 隨機數，只在申請成功時回傳一次；D1 只保存 SHA-256 雜湊。管理頁讀取網址後清 hash，token 只存 sessionStorage；換造型、已逛紀錄、語言及教學存 localStorage，儲存不可用不影響逛街。沒有遺失連結重發或自動寄信功能。

## 絕不能進 repo

不要提交 `.git` 操作產生的意外變動、`_ref/` 參考截圖、付費素材原檔、私人照片與 email、申請表回應、管理連結／token、Cloudflare／Turnstile secret、憑證、`.dev.vars`、私密 `.env`、本機 `.wrangler` 資料庫／KV、含敏感資料的 log。示範與測試資料只使用虛構名稱及保留的 `example.invalid` 測試地址。`dist/` 與 `node_modules/` 亦不提交。

## 此環境實際驗證

前台 production build 與 Worker strict TypeScript 檢查通過；14 項純函式測試和離線 Worker 生命週期測試通過。本沙箱拒絕 Vite 開啟 5190 port（EPERM）；Wrangler 本機建表及啟動均遇到 macOS `SecItemCopyMatching failed -50`，改用暫存設定／log 目錄仍未成功。因此 API smoke 連線失敗，完整生命週期、瀏覽器 375×667 排版與互動仍需在可啟動本機服務的環境實測。沒有網路、沒有安裝套件、沒有部署或 commit。
