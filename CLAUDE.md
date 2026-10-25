# DIY 網上手作市集

2026-10-25 開。邀請手作人進駐、訪客用小人逛的網上手作市集；香港版＋日本／沖繩版。
品牌：香港「趁墟｜香港手作墟」、日本「てくてく市 TekuTeku」（SPEC §1）；「DIY」只是資料夾／repo 名。

## 真相來源
- **`docs/SPEC.md` 是唯一真相來源**（品牌、分期、地區、審核、技術、美術版權）。改方向先改 SPEC
- 派工單 `docs/CODEX_P*.md`；實作派給 Codex，Claude 寫規格＋審查＋瀏覽器實測（含手機 375 寬）

## 分期（細節看 SPEC §3）
1. 手作人資料庫＋可用角色逛的市集＋自助申請頁與審核後台，攤位連到攤主自己的 IG／賣場——**不碰錢**
2. 攤主帳號＋自己佈置攤位；日本版てくてく市
3. 站內真的能賣（Stripe Connect，抽成或月費）
不要提前做下一期的東西（帳號登入、佈置編輯器、留言、聊天、金流），Codex 容易過度延伸，審查時專門查

## 紅線
- repo `sssunwl/diy` 是 **public**：攤主 email／申請表回應、參考站截圖（`_ref/`）、付費素材原檔，絕不進 repo
- 憑證放 `~/.config/diy/`
- 美術全部自己程式畫（角色沿用 `han/shared/pixelkit/` 的複本）或 Codex 生圖，不抄參考站「老闆不在」的畫風與用語
- 不擅自放真實手作人的 IG／照片；示範攤要標「示範攤」
- 有 Cloudflare Access 後台時，照 `Knowledge/30_方法與SOP/登入紀錄/` 加登入紀錄

## 技術
前台 Vite + TypeScript 無框架、Canvas 2D，GitHub Pages（Actions 部署）→ https://sssunwl.github.io/diy/
後端 Cloudflare Worker＋D1＋KV（照片；R2 未開通）→ diy.sssuni.com，`/admin` 走 Access＋登入紀錄
