// 登入紀錄(Worker 端):誰(Cloudflare Access email)喺幾時睇咗邊頁,存 D1。
// 只記頁面(唔記圖片/CSS/API),保留 KEEP_DAYS 日。
// 正本:Knowledge/30_方法與SOP/登入紀錄/visits.js(改正本再抄去各站)
export const KEEP_DAYS = 365;

export function isPageView(request, path) {
  if (request.method !== 'GET' || path.includes('/api/')) return false;
  const dest = request.headers.get('sec-fetch-dest');
  if (dest) return dest === 'document';
  return !/\.[a-z0-9]+$/i.test(path) || /\.html?$/i.test(path);
}

// 用 ctx.waitUntil(logVisit(...)) 叫,唔會拖慢頁面;出錯(例如未建表)都唔影響網站
export async function logVisit(db, table, request, email, path) {
  try {
    await db.prepare(`INSERT INTO ${table} (ts, email, path, country) VALUES (?, ?, ?, ?)`)
      .bind(new Date().toISOString(), String(email).toLowerCase(), path.slice(0, 300), (request.cf && request.cf.country) || '').run();
    if (Math.random() < 0.02) {
      await db.prepare(`DELETE FROM ${table} WHERE ts < ?`).bind(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString()).run();
    }
  } catch (e) {}
}

export async function visitsResponse(db, table) {
  const [summary, recent] = await Promise.all([
    db.prepare(`SELECT email, COUNT(*) AS views, MIN(ts) AS first, MAX(ts) AS last FROM ${table} GROUP BY email ORDER BY last DESC`).all(),
    db.prepare(`SELECT ts, email, path, country FROM ${table} ORDER BY id DESC LIMIT 500`).all(),
  ]);
  return new Response(JSON.stringify({ keepDays: KEEP_DAYS, summary: summary.results || [], recent: recent.results || [] }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
