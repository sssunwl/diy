import { CATEGORIES, COLORS, type Application } from './types.ts';
export type Errors = Record<string, string>;
export function validate(value: unknown, photoCount: number): Errors {
    const d = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>, e: Errors = {};
    const length = (key: string, min: number, max: number) => { const s = d[key]; if (typeof s !== 'string' || [...s.trim()].length < min || [...s].length > max)
        e[key] = `請填寫 ${min}–${max} 字`; };
    length('name', 1, 20);
    length('by', 1, 12);
    length('note', 0, 40);
    length('sign', 0, 6);
    if (d.region !== 'hk' || d.market !== 'ssp')
        e.region = '地區不正確';
    if (!['ki-lung', 'yu-chau'].includes(String(d.street)))
        e.street = '請選擇街道';
    if (!CATEGORIES.includes(d.category as Application['category']))
        e.category = '請選擇類別';
    if (!COLORS.includes(String(d.color)))
        e.color = '請選擇遮雨棚顏色';
    const https = (v: unknown, ig = false) => { try {
        const u = new URL(String(v));
        return u.protocol === 'https:' && !u.username && !u.password && (!ig || ['instagram.com', 'www.instagram.com'].includes(u.hostname));
    }
    catch {
        return false;
    } };
    if (!https(d.igUrl, true))
        e.igUrl = '請填寫 https://instagram.com/ 或 https://www.instagram.com/ 網址';
    if (d.shopUrl && !https(d.shopUrl))
        e.shopUrl = '賣場網址必須使用 HTTPS';
    if (typeof d.email !== 'string' || d.email.length > 254 || !/^\S+@[^\s@]+\.[^\s@]+$/.test(d.email))
        e.email = '請填寫有效 email';
    if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 3)
        e.items = '請填寫 1–3 件商品';
    else
        d.items.forEach((item: unknown, i: number) => { const p = item as Record<string, unknown> | null; if (!p || typeof p.name !== 'string' || [...p.name.trim()].length < 1 || [...p.name].length > 20)
            e[`items.${i}.name`] = '商品名稱須為 1–20 字'; if (!p || typeof p.price !== 'number' || !Number.isInteger(p.price) || p.price < 0 || p.price > 99999)
            e[`items.${i}.price`] = '價格須為 0–99999 整數'; });
    if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > 3)
        e.photos = '請提供 1–3 張照片';
    if (d.own !== true)
        e.own = '請確認作品和照片由你製作';
    if (d.consent !== true)
        e.consent = '請同意公開展示';
    return e;
}
export function publicFields(d: Application) {
    return { region: 'hk' as const, market: 'ssp', street: d.street, name: d.name.trim(), by: d.by.trim(), category: d.category, color: d.color, sign: d.sign, note: d.note, items: d.items.map(i => ({ name: i.name, price: i.price })), igUrl: d.igUrl, ...(d.shopUrl ? { shopUrl: d.shopUrl } : {}) };
}
