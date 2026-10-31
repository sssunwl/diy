# Codex 工單：新畫風大地圖接進遊戲

讀 `CLAUDE.md`、`docs/SPEC.md` §3／§4.1／§10 最後幾條。目標：線上逛街畫面從舊像素單條街換成新的等角大地圖。**只做這張工單**：不做主題包切換、不做攤主自選、不改 Worker、不碰 `form.ts`、不加帳號／留言／金流，不要 commit。

## 素材（已備好，不要重生）
- `public/map/hk/layout.json`：`tools/mock_map.py export` 產生，欄位看 `export()`
  - `size` 世界尺寸；`transform` 格點→世界：`X = gx*a1 - gy*a2 + ox`、`Y = gx*b1 + gy*b2 + oy`
  - `ground` 地面圖縮放（世界尺寸 × ground ＝圖片尺寸）；`fill[季節]` 地圖外填色
  - `items`／`slots`：`n` 素材名、`x y w h` 世界座標與顯示尺寸、`d` 深度。`@big`／`@small` 代表 `tree_<季節>_big|small`。`slots` 另有 `gx gy kind fx fy`（`fx fy` 是攤前站位的世界座標）
  - `mask`：可走範圍，`rows[y][x]==='1'` 可走，格點＝`lo + index*step`
  - `trail`：小徑中線 `[gx, gy, nx, ny]`，頭尾相接，法線朝外；`trailWidth`
  - `aisles`：市集通道線段 `[gx0, gy0, gx1, gy1]`；`hub`、`start`（格點）；`strings` 燈串折線（世界座標）
- `public/map/hk/ground_<spring|summer|autumn|winter>.webp`、`glow.webp`（白色＋透明度＝燈光，縮到 1/4 且與 `size` 同範圍）、`sprites/*.webp`（2 倍解析度）
- 走路幀 `public/art/<名>_<se|ne>_<a|b|c>.webp`（96px 高，遊戲裡畫成 44px 高）。人物 `walk2_{hero,cap,camera,student,potter,leather}`，路人 `park_{jogger_f,jogger_m,dogwalker,grandpa,grandma,cyclist}`，狗 `park_{shiba,poodle}`（畫成 20px 高），聊天 `park_chat{0,1,2}_{1,2}`。尺寸在 `public/art/park_manifest.json`
- 路徑一律用 `import.meta.env.BASE_URL` 開頭，repo 有 base `/tekuteku/`

## 動畫規則：照搬 `tools/mock_map.py` 的 `KINDS`、`walker`、`cast_items`、`leash`、`frame`
- 循環 a-b-c-b，換格看走過的距離（`cycle`），不是看時間，腳才不打滑
- 方向：行進方向在畫面 dy>0 用 `se`，否則 `ne`；`se` 原圖朝左下的有 `walk2_*`、`park_cyclist`、狗，朝右下的有其餘路人；`ne` 一律朝右上；要往另一邊就水平翻轉
- **以頭部中心對位**：取圖上半 45% 的 alpha 重心當 x 錨點，載入時算好快取，否則身體會抖
- 遛狗的人 `se` 不用 c 格；狗走前面約 1.9 格，畫一條略下垂的牽繩
- 腳下畫淡橢圓陰影
- 位置用浮點累積，不四捨五入速度

## Scene（重寫 `src/scene.ts`，對外介面不變）
`main.ts` 用到的都要保留：`stalls street streetId current seen look active visit() next() change() setLook()` 與建構子 6 個 callback。
- **攝影機**：跟著玩家、可拖動平移（拖動後玩家一走就回到跟隨）、限制在地面範圍內。電腦滾輪、手機雙指縮放，範圍約 0.4–1.6；預設 1（手機也是 1），並提供「全圖」縮放按鈕
- **玩家**：點地面走過去；鍵盤方向鍵／WASD。依 `mask` 碰撞，撞到時沿牆滑動，點到不可走處就走到最近的可走點。速度約 4 格/秒。方向鍵上下左右對應兩條等角軸
- **遮擋**：`items`、`slots`、所有人物按 `d`（腳底世界 y）排序畫，只畫視窗內的
- **攤位對應**：`stalls` 的 `street + slot` 對應到地圖：`ki-lung` 放主街北側兩排、`yu-chau` 放主街南側兩排，由最靠近 `hub` 的 slot 開始依序分配（`kind` 非 `empty` 也可被覆蓋）。有資料的攤換成該類別素材：`scent→candle`、`class→workshop`，其餘同名。在玩家附近時，頭上顯示品牌名標籤
- **沒資料的 slot**：照 layout 的 `kind` 畫（是佈景），點了呼叫 `onApply(streetId)`
- **點擊**：點到攤位 sprite 範圍（深度前面的優先）→ 有資料走到 `fx fy` 再 `onOpen`；`nearest()`／空白鍵照舊
- **`next()`**：走到下一個沒看過的攤。**`change()`**：切到另一條街的第一攤
- **路人**：市集通道 10–14 人沿 `aisles` 來回；小徑隨機出現，同時約 8–14 組，種類比例照 `park_cast`，走到視窗外且夠久就換新一組，聊天組站 20–40 秒後離開。不要常駐。人物彼此不用碰撞，但同向快者經過慢者時換到另一側 lane
- **季節**：依月份（3–5 春、6–8 夏、9–11 秋、12–2 冬）。**時段**：依本機時間（6–16 白天、16–18:30 傍晚、其他夜晚）。網址 `?season=winter&time=night` 可覆寫；`#more-menu` 加兩個循環按鈕「季節」「時段」，文字進 `i18n/*.json`
- **夜晚／傍晚調光**：照 `grade()` 的公式 `base*(ambient + light*warm)`：開一張低解析度 offscreen，填 ambient 色，以 `lighter` 疊上染成 warm 色的 `glow.webp`，再用 `multiply` 蓋到主畫面。傍晚 ambient(.60,.46,.47)＋warm(.52,.46,.30)、夜晚 ambient(.19,.23,.42)＋warm(.88,.76,.50)。fill 物件要畫在 multiply 之前；燈串 `strings` 也畫，燈泡畫在 multiply 之後才會亮
- **效能**：地面只載當季一張；sprite 預載但有 loading 畫面；固定 `imageSmoothingEnabled=true`；每幀不重新配置大陣列；dpr 上限 2

## main.ts
- 角色外觀改成選 6 個角色（`Look` 改 `{ role }`），舊 localStorage 格式要能退回預設，不可崩潰。選擇器顯示 `walk2_<role>_se_b.webp`
- `#seen` 的分母改用目前街道實際攤數
- `src/pixelkit/` 只移除不再用到的部分；`productPlaceholder` 還在用就留著
- 教學文字如果還說舊操作，改 i18n

## 驗收
- `npm run build` 通過
- 手機 375 寬、電腦 1440 寬都能走動、拖動、點攤位開面板、點佈景攤去申請、品牌牆、`#stall=<id>` 深連結
- 四季＋三時段都正確顯示
- 主控台無錯誤、無 404
完成後回報改了哪些檔、沒做到什麼。
