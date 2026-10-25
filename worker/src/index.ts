import { validate, publicFields } from '../../src/validate.ts';
import type { Application, Stall } from '../../src/types.ts';
import { allocateSlot } from './slots.ts';
import { adminEmail } from './auth.ts';
import { logVisit } from './visits.ts';
import { webpSize } from './photos.ts';
import adminHTML from './admin.html';
interface Env {
    DB: D1Database;
    PHOTOS: KVNamespace;
    ALLOWED_ORIGINS: string;
    ADMIN_EMAIL?: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    TURNSTILE_SECRET?: string;
}
interface Row {
    id: string;
    region: string;
    market: string;
    status: string;
    live_json: string | null;
    draft_json: string | null;
    email: string;
    token_hash: string;
    reject_reason: string | null;
    created_at: string;
    updated_at: string;
    approved_at: string | null;
}
const json = (d: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
class Fault extends Error {
    constructor(message: string, public status = 400, public field?: string) { super(message); }
}
const hash = async (s: string | ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? new TextEncoder().encode(s) : s))).map(n => n.toString(16).padStart(2, '0')).join('');
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const token = () => btoa(String.fromCharCode(...random(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const id = () => Array.from(random(12), n => 'abcdefghijklmnopqrstuvwxyz234567'[n % 32]).join('');
const parse = (s: string | null) => s ? JSON.parse(s) : null;
async function owner(req: Request, env: Env): Promise<Row> { const t = req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]; if (!t)
    throw new Fault('管理連結無效', 401); const row = await env.DB.prepare('SELECT * FROM stalls WHERE token_hash = ?').bind(await hash(t)).first<Row>(); if (!row)
    throw new Fault('管理連結無效或攤位已收起', 401); return row; }
async function allLive(env: Env): Promise<Stall[]> { const r = await env.DB.prepare('SELECT live_json FROM stalls WHERE live_json IS NOT NULL AND region = ?').bind('hk').all<{
    live_json: string;
}>(); return r.results.map(x => JSON.parse(x.live_json)); }
async function purge(env: Env, stallId: string, keep: string[] = []) { let cursor: string | undefined; do {
    const l = await env.PHOTOS.list({ prefix: `p/${stallId}/`, cursor });
    await Promise.all(l.keys.filter(k => !keep.some(p => { try {
        return decodeURIComponent(new URL(p).pathname) === '/p/' + k.name;
    }
    catch {
        return false;
    } })).map(k => env.PHOTOS.delete(k.name)));
    cursor = l.list_complete ? undefined : l.cursor;
} while (cursor); }
async function invalidate(env: Env, req: Request) { const key = new Request(new URL('/api/stalls?region=hk', req.url)); await caches.default.delete(key); }
async function payload(req: Request, env: Env, stallId: string, row?: Row) {
    const size = Number(req.headers.get('Content-Length') || 0);
    if (size > 1100000)
        throw new Fault('照片檔案太大', 413, 'photos');
    let form: FormData;
    try {
        form = await req.formData();
    }
    catch {
        throw new Fault('表格格式不正確');
    }
    let d: Application;
    try {
        d = JSON.parse(String(form.get('data')));
    }
    catch {
        throw new Fault('資料格式不正確');
    }
    const keep = d?.keepPhotos ?? [];
    const old = [...(parse(row?.live_json ?? null)?.photos || []), ...(parse(row?.draft_json ?? null)?.photos || [])];
    if (!Array.isArray(keep) || new Set(keep).size !== keep.length || keep.some(p => typeof p !== 'string' || !old.includes(p)))
        throw new Fault('保留照片不正確', 400, 'photos');
    const files: File[] = [];
    for (let i = 0; i < 3; i++) {
        const p = form.get('photo' + i);
        if (p !== null) {
            if (typeof p === 'string')
                throw new Fault('照片格式不正確', 400, 'photos');
            files.push(p);
        }
    }
    const e = validate(d, keep.length + files.length);
    if (Object.keys(e).length) {
        const [field, message] = Object.entries(e)[0];
        return { errors: e, field, message } as const;
    }
    d.email = d.email.trim().toLowerCase();
    const bytes: ArrayBuffer[] = [];
    for (const f of files) {
        if (f.type !== 'image/webp' || f.size > 250 * 1024)
            throw new Fault('照片必須是 250KB 以下 WebP', 400, 'photos');
        const a = await f.arrayBuffer(), s = webpSize(new Uint8Array(a));
        if (!s || s[0] !== 800 || s[1] !== 800)
            throw new Fault('照片必須是有效的 800×800 WebP', 400, 'photos');
        bytes.push(a);
    }
    if (!row) {
        const origin = req.headers.get('Origin') || '';
        let local = false;
        try {
            local = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
        }
        catch { /* 來源不正確 */ }
        if (!env.TURNSTILE_SECRET) {
            if (!local)
                throw new Fault('驗證服務尚未設定', 403);
        }
        else {
            const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(form.get('turnstile') || ''), remoteip: req.headers.get('CF-Connecting-IP') || '' }) });
            const result = await r.json() as {
                success: boolean;
                hostname?: string;
            };
            if (!result.success)
                throw new Fault('請完成防機械人驗證', 403, 'turnstile');
        }
        const ip = req.headers.get('CF-Connecting-IP') || '本機';
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM apply_log WHERE ip=? AND at>?').bind(ip, new Date(Date.now() - 3600000).toISOString()).first<{
            n: number;
        }>();
        if ((count?.n || 0) >= 5)
            throw new Fault('申請次數太多，請一小時後再試', 429);
        await env.DB.prepare('INSERT INTO apply_log (ip,at) VALUES (?,?)').bind(ip, new Date().toISOString()).run();
    }
    const existing = await env.DB.prepare('SELECT id FROM stalls WHERE email=? AND id<>?').bind(d.email, stallId).first();
    if (existing)
        throw new Fault('這個 email 已經有攤位，請用管理連結修改', 409, 'email');
    const photos = [...keep];
    for (let n = 0; n < bytes.length; n++) {
        const key = `p/${stallId}/${n}-${(await hash(bytes[n])).slice(0, 8)}.webp`;
        await env.PHOTOS.put(key, bytes[n], { metadata: { type: 'image/webp' } });
        photos.push(new URL('/p/' + key, req.url).href);
    }
    const draft = { ...publicFields(d), id: stallId, slot: -1, photos, approvedAt: '' };
    return { draft, email: d.email } as const;
}
async function handle(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const u = new URL(req.url), path = u.pathname;
    if (path.startsWith('/p/')) {
        if (req.method !== 'GET')
            throw new Fault('不支援的操作', 405);
        const key = decodeURIComponent(path.slice(3));
        if (!/^p\/[a-z2-7]{12}\/[0-2]-[a-f0-9]{8}\.webp$/.test(key))
            throw new Fault('找不到照片', 404);
        const p = await env.PHOTOS.get(key, 'arrayBuffer');
        return p ? new Response(p, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } }) : json({ error: '找不到照片' }, 404);
    }
    if (path === '/admin' || path.startsWith('/api/admin/')) {
        const email = await adminEmail(req, env);
        if (!email)
            throw new Fault('只有站長可以進入', 403);
        if (path === '/admin' && req.method === 'GET') {
            ctx.waitUntil(logVisit(env.DB, req, email, path));
            return new Response(adminHTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; frame-ancestors 'none'", 'X-Frame-Options': 'DENY' } });
        }
        if (path === '/api/admin/visits' && req.method === 'GET') {
            const r = await env.DB.prepare('SELECT at,email,path,country FROM visits ORDER BY id DESC LIMIT 200').all();
            return json({ visits: r.results });
        }
        if (path === '/api/admin/list' && req.method === 'GET') {
            const status = u.searchParams.get('status') || 'pending';
            if (!['pending', 'live', 'rejected'].includes(status))
                throw new Fault('狀態不正確');
            const r = await env.DB.prepare('SELECT * FROM stalls WHERE status=? ORDER BY updated_at').bind(status).all<Row>();
            const live = await allLive(env);
            return json({ stalls: r.results.map(r => ({ id: r.id, status: r.status, email: r.email, live: parse(r.live_json), draft: parse(r.draft_json), rejectReason: r.reject_reason })), occupancy: ['ki-lung', 'yu-chau'].map(street => ({ street, count: live.filter(s => s.street === street).length })) });
        }
        if (req.method === 'POST' && ['/api/admin/approve', '/api/admin/reject', '/api/admin/takedown'].includes(path)) {
            const body = await req.json() as {
                id: string;
                reason?: string;
            };
            const r = await env.DB.prepare('SELECT * FROM stalls WHERE id=?').bind(body.id).first<Row>();
            if (!r)
                throw new Fault('找不到攤位', 404);
            const now = new Date().toISOString();
            if (path.endsWith('/approve')) {
                const draft = parse(r.draft_json) as Stall | null;
                if (!draft)
                    throw new Fault('沒有待審版本', 409);
                const old = parse(r.live_json) as Stall | null;
                const slot = old && old.street === draft.street ? { street: old.street, slot: old.slot } : allocateSlot(draft.street, (await allLive(env)).filter(s => s.id !== r.id));
                if (!slot)
                    throw new Fault('這個市集滿了', 409);
                const live = { ...draft, ...slot, approvedAt: now };
                try {
                    const changed = await env.DB.prepare('UPDATE stalls SET live_json=?,draft_json=NULL,status=\'live\',reject_reason=NULL,approved_at=?,updated_at=? WHERE id=? AND updated_at=?').bind(JSON.stringify(live), now, now, r.id, r.updated_at).run();
                    if (!changed.meta.changes)
                        throw new Fault('資料已更改，請重新整理', 409);
                }
                catch (e) {
                    if (e instanceof Fault)
                        throw e;
                    throw new Fault('攤位位置剛被使用，請重新核准', 409);
                }
                ctx.waitUntil(purge(env, r.id, live.photos));
            }
            else {
                if (!body.reason?.trim())
                    throw new Fault('請填寫原因', 400, 'reason');
                if (body.reason.length > 500)
                    throw new Fault('原因過長');
                if (path.endsWith('/takedown'))
                    await env.DB.prepare("UPDATE stalls SET live_json=NULL,status='rejected',reject_reason=?,updated_at=? WHERE id=?").bind(body.reason, now, r.id).run();
                else
                    await env.DB.prepare("UPDATE stalls SET status='rejected',reject_reason=?,updated_at=? WHERE id=?").bind(body.reason, now, r.id).run();
            }
            await invalidate(env, req);
            return json({ ok: true });
        }
        throw new Fault('找不到頁面', 404);
    }
    if (path === '/api/stalls' && req.method === 'GET') {
        if (u.searchParams.get('region') !== 'hk')
            throw new Fault('地區不正確');
        const key = new Request(new URL('/api/stalls?region=hk', req.url));
        const cached = await caches.default.match(key);
        if (cached)
            return cached;
        const r = json({ stalls: await allLive(env) }, 200, { 'Cache-Control': 'public, max-age=60' });
        ctx.waitUntil(caches.default.put(key, r.clone()));
        return r;
    }
    if (path === '/api/apply' && req.method === 'POST') {
        const stallId = id(), p = await payload(req, env, stallId);
        if ('errors' in p)
            return json({ error: p.message, field: p.field, errors: p.errors }, 400);
        const t = token(), now = new Date().toISOString();
        try {
            await env.DB.prepare("INSERT INTO stalls (id,region,market,status,draft_json,email,token_hash,created_at,updated_at) VALUES (?,'hk','ssp','pending',?,?,?,?,?)").bind(stallId, JSON.stringify(p.draft), p.email, await hash(t), now, now).run();
        }
        catch {
            ctx.waitUntil(purge(env, stallId));
            throw new Fault('這個 email 已經有攤位，請用管理連結修改', 409, 'email');
        }
        return json({ token: t }, 201);
    }
    if (path === '/api/manage') {
        const row = await owner(req, env);
        if (req.method === 'GET')
            return json({ status: row.status, live: row.live_json ? { ...parse(row.live_json), email: row.email } : null, draft: row.draft_json ? { ...parse(row.draft_json), email: row.email } : null, email: row.email, rejectReason: row.reject_reason });
        if (req.method === 'PUT') {
            const p = await payload(req, env, row.id, row);
            if ('errors' in p)
                return json({ error: p.message, field: p.field, errors: p.errors }, 400);
            const old = [...(parse(row.live_json)?.photos || []), ...p.draft.photos];
            await env.DB.prepare("UPDATE stalls SET draft_json=?,email=?,status='pending',reject_reason=NULL,updated_at=? WHERE id=?").bind(JSON.stringify(p.draft), p.email, new Date().toISOString(), row.id).run();
            ctx.waitUntil(purge(env, row.id, old));
            return json({ ok: true });
        }
        if (req.method === 'DELETE') {
            await env.DB.prepare('DELETE FROM stalls WHERE id=?').bind(row.id).run();
            await purge(env, row.id);
            await invalidate(env, req);
            return json({ ok: true });
        }
    }
    throw new Fault('找不到頁面', 404);
}
export default { async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const path = new URL(req.url).pathname, api = path.startsWith('/api/'), origin = req.headers.get('Origin'), allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
        const headers = new Headers({ 'Vary': 'Origin' });
        if (api) {
            headers.set('Cache-Control', 'no-store');
            if (origin && origin !== new URL(req.url).origin) {
                if (!allowed.includes(origin))
                    return json({ error: '不允許此來源' }, 403);
                headers.set('Access-Control-Allow-Origin', origin);
                headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
                headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
            }
        }
        if (api && req.method === 'OPTIONS')
            return new Response(null, { status: 204, headers });
        let r: Response;
        try {
            r = await handle(req, env, ctx);
        }
        catch (e) {
            r = e instanceof Fault ? json({ error: e.message, ...(e.field ? { field: e.field } : {}) }, e.status) : json({ error: '伺服器暫時未能處理，請稍後再試' }, 500);
        }
        const out = new Response(r.body, r);
        headers.forEach((v, k) => { if (k === 'Cache-Control' && r.headers.has(k))
            return; out.headers.set(k, v); });
        out.headers.set('X-Content-Type-Options', 'nosniff');
        return out;
    } };
