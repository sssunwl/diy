# 第一期實作回報

已實作香港深水埗兩街市集、14 個虛構示範攤、Canvas 小人與 NPC、攤位碰撞／互動、造型及已逛紀錄、品牌牆、雙語介面、深連結、攤位照片與分享、申請／私人連結管理、Worker API、D1／KV、Turnstile／Access、審核後台及登入紀錄。沒有 commit、沒有操作 `.git`、沒有讀改 `_ref/`、沒有新增 npm 依賴、沒有連外或部署。

## 檔案

前台新增 `index.html`、`vite.config.ts`、`tsconfig.json`、`.env.development`、`.gitignore`；程式新增 `src/main.ts`、`scene.ts`、`style.css`、`ui.ts`、`form.ts`、`api.ts`、`types.ts`、`validate.ts`。新增 `src/pixelkit/market.js` 程式繪製攤位、商品佔位圖、地面、布行／鈕扣舖及街景，原有 core／character／furniture 沒有修改。新增 `data/regions/hk.json`、`data/demo/hk.json`、`i18n/zh-HK.json`、`i18n/en.json`。

後端新增 `worker/wrangler.toml`、`schema.sql`、`tsconfig.json`；程式新增 `worker/src/index.ts`、`auth.ts`、`photos.ts`、`slots.ts`、`visits.ts`、`admin.html`、`raw.d.ts`。已將兩個 visits 參考檔改寫並刪除 `.ref.js`。新增 `.github/workflows/pages.yml`、`README.md`，以及 `tools/test.mjs`、`smoke.mjs`、`worker-test.mjs`、`webp-fixture.mjs`、`photo-fixture.html`。既有 package.json／package-lock.json 未修改。

## 實際驗證

| 項目 | 實際結果 |
| --- | --- |
| `npm run build` | 成功；strict tsc 與 Vite production build 零錯誤 |
| `npx tsc -p worker/tsconfig.json` | 成功；Worker strict 型別檢查零錯誤 |
| `node --experimental-strip-types tools/test.mjs` | 成功；14 項測試，涵蓋 emoji 字數、欄位邊界、IG host、價格、slot、JWT 合法／假 token／錯 aud／錯 email／過期／錯演算法／錯 issuer、照片格式拒絕 |
| `node tools/worker-test.mjs` | 成功；使用同一份 Worker、Node SQLite 與記憶體 KV／Cache，驗證申請、待審不公開、核准、公開欄位白名單、照片回傳、管理 GET／PUT／DELETE、修改／退回保留舊版、換街、收攤清 D1／KV、正式 host 拒絕 dev 略過、只記 document 登入紀錄 |
| Wrangler 本機 D1 建表 | 失敗；macOS `SecItemCopyMatching failed -50`，另有預設 log 目錄寫入 EPERM；使用暫存設定／log 目錄仍無法啟動 |
| Wrangler 本機 8790 啟動 | 失敗；同一 Keychain 環境錯誤 |
| Vite 本機 5190 啟動 | 失敗；listen `EPERM ::1:5190`，沙箱拒絕開 port |
| `node tools/smoke.mjs` | 失敗；沒有本機 Worker 可連，`fetch failed`；因此 HTTP 生命週期未完成 |
| 375×667／桌面瀏覽器、Canvas 操作、照片前處理及 Turnstile widget | 沒跑；本機服務無法啟動，未聲稱畫面或互動已通過實測 |
| 真正 Cloudflare Access／D1／KV、GitHub Pages 部署 | 沒跑；本單環境無網路，沒有部署授權或資源綁定 |

## 偏離與額外工作

派工單一處指定固定 `ADMIN_EMAIL`，另一處禁止 email 寫死；採取後者，ADMIN_EMAIL 由環境綁定，README 說明本機 `.dev.vars` 與正式 secret 設定。為防止同時核准重疊，額外增加 live slot 唯一索引；為補足受限環境中的資料流程驗證，額外加離線 Worker 整合測試與自行產生的合法 WebP fixture。這些沒有新增產品功能或 npm 套件；測試中的信箱均為保留的 `example.invalid` 虛構地址。

畫面會在放不下完整街道時降整數倍率；375×667 因扣除頂欄及底部操作區，會降到 1×。沒有預先實作後期功能。沒有自動寄審核通知或遺失管理連結重發，因本單沒有指定郵件服務或相關 API；email 僅供站長另行通知。

## 已知問題／部署前事項

手機排版、Canvas 互動、照片前處理和完整 HTTP smoke 仍需在可開 port 的環境實測；離線測試不能代替 Wrangler runtime。需填入 D1／KV 資源 ID，設定 ADMIN_EMAIL、Access domain／AUD、TURNSTILE_SECRET、前台 site key 和公開檢舉信箱，並建表。WebP 會檢查容器、chunk 與尺寸，但沒有完整解碼器；快取失效只清目前 edge，其他 edge 最多保留 60 秒舊攤位資料。新品核准／退回採站長後台手動處理，通知由站長另行發出。
