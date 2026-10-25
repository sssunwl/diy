import { COLORS, CATEGORIES, type Application, type Stall } from './types';
import { validate } from './validate';
import { API_BASE } from './api';
import { esc, t, dict, lang, button } from './ui';
import region from '../data/regions/hk.json';
import { stallSprite } from './pixelkit/market.js';
import { toCanvas } from './pixelkit/core.js';
type Managed = Stall & {
    email: string;
};
interface Management {
    status: string;
    live: Managed | null;
    draft: Managed | null;
    email: string;
    rejectReason?: string;
}
declare global {
    interface Window {
        turnstile?: {
            render: (el: HTMLElement, options: {
                sitekey: string;
                callback: (token: string) => void;
                'expired-callback': () => void;
            }) => string;
            remove: (id: string) => void;
            reset: (id: string) => void;
        };
    }
}
let widget: string | undefined;
export function cleanupForm() { if (widget && window.turnstile)
    window.turnstile.remove(widget); widget = undefined; }
async function compress(file: File): Promise<File> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw Error(t('photoError'));
    let image: ImageBitmap;
    try {
        image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    catch {
        throw Error(t('photoError'));
    }
    const c = document.createElement('canvas');
    c.width = c.height = 800;
    const ctx = c.getContext('2d')!, s = Math.min(image.width, image.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 800);
    ctx.drawImage(image, (image.width - s) / 2, (image.height - s) / 2, s, s, 0, 0, 800, 800);
    image.close();
    for (const q of [.82, .75, .68, .6]) {
        const b = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', q));
        if (b && b.type === 'image/webp' && b.size <= 200 * 1024)
            return new File([b], 'photo.webp', { type: 'image/webp' });
    }
    throw Error(t('photoLarge'));
}
export async function request(path: string, options: RequestInit = {}) { const r = await fetch(API_BASE + path, { ...options, signal: options.signal ?? AbortSignal.timeout(20000) }); const d = await r.json(); if (!r.ok)
    throw Object.assign(Error(d.error || t('error')), { field: d.field, errors: d.errors }); return d; }
export async function copyText(value: string) { try {
    await navigator.clipboard.writeText(value);
}
catch {
    const a = document.createElement('textarea');
    a.value = value;
    document.body.append(a);
    a.select();
    document.execCommand('copy');
    a.remove();
} }
export async function renderForm(host: HTMLElement, street = 'ki-lung', token?: string) {
    cleanupForm();
    let management: Management | undefined;
    if (token) {
        host.innerHTML = `<p>${t('loading')}</p>`;
        try {
            management = await request('/api/manage', { headers: { Authorization: 'Bearer ' + token } });
        }
        catch (e) {
            host.innerHTML = `<p role="alert">${esc((e as Error).message)}</p>`;
            return;
        }
    }
    const initial = management?.draft || management?.live;
    let items = initial?.items.map(i => ({ ...i })) || [{ name: '', price: 0 }], files: File[] = [], keep = [...(initial?.photos || [])], turnstile = '';
    let processing = false;
    const field = (key: string, label: string, type = 'text', value = '', hint = '', max?: number) => `<label class="field">${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}" ${max ? `data-max="${max}"` : ''} ${['name', 'by', 'igUrl', 'email'].includes(key) ? 'required' : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}<span class="error" data-error="${key}"></span></label>`;
    host.innerHTML = `<h1>${t(token ? 'manage' : 'apply')}</h1>${management ? `<p class="notice">${t('status')}：${t(management.status === 'pending' ? (management.live ? 'revision' : 'pending') : management.status === 'live' ? 'live' : 'rejected')}${management.rejectReason ? `<br>${esc(management.rejectReason)}` : ''}</p>` : ''}<div class="application"><aside class="preview"><h2>${t('preview')}</h2><canvas id="preview" width="224" height="180"></canvas><p id="preview-name"></p><p id="preview-sign"></p></aside><form novalidate><div class="fields">${field('name', t('name'), 'text', initial?.name || '', '', 20)}${field('by', t('nickname'), 'text', initial?.by || '', '', 12)}<label class="field">${t('street')}<select name="street">${region.markets[0].streets.map(s => `<option value="${s.id}" ${(initial?.street || street) === s.id ? 'selected' : ''}>${esc(s.name[lang])}</option>`).join('')}</select><span class="error" data-error="street"></span></label><label class="field">${t('category')}<select name="category">${CATEGORIES.map(c => `<option value="${c}" ${initial?.category === c ? 'selected' : ''}>${esc(dict().categories[c])}</option>`).join('')}</select><span class="error" data-error="category"></span></label>${field('igUrl', t('igUrl'), 'url', initial?.igUrl || '')}${field('shopUrl', t('shopUrl'), 'url', initial?.shopUrl || '')}${field('sign', t('sign'), 'text', initial?.sign || '', '', 6)}<label class="field">${t('customerNote')}<textarea name="note" rows="3" data-max="40">${esc(initial?.note || '')}</textarea><span class="error" data-error="note"></span></label></div><fieldset><legend>${t('color')}</legend><div class="swatches">${COLORS.map((c, i) => `<label style="--swatch:${c}"><input type="radio" name="color" value="${c}" ${(initial?.color || COLORS[0]) === c ? 'checked' : ''}><span class="sr">${t('color')} ${i + 1}</span></label>`).join('')}</div><span class="error" data-error="color"></span></fieldset><fieldset><legend>${t('items')}</legend><div id="items"></div>${button('add-item', t('addItem'))}<span class="error" data-error="items"></span></fieldset><fieldset><legend>${t('photos')}</legend><p>${t('photoHint')}</p><div id="keep-photos"></div><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="${t('photos')}"><div id="new-photos"></div><span class="error" data-error="photos"></span></fieldset>${field('email', t('email'), 'email', initial?.email || management?.email || '', t('emailHint'))}<label class="check"><input name="own" type="checkbox">${t('own')}</label><span class="error" data-error="own"></span><label class="check"><input name="consent" type="checkbox">${t('consent')}</label><span class="error" data-error="consent"></span><div id="turnstile-box"></div><span class="error" data-error="turnstile"></span><p id="form-error" class="error" role="alert"></p><button class="primary" type="submit">${t(token ? 'save' : 'submit')}</button>${token ? button('delete-stall', t('delete')) : ''}</form></div>`;
    const form = host.querySelector('form')!, errors = (e: Record<string, string>) => { form.querySelectorAll<HTMLElement>('[data-error]').forEach(el => { el.textContent = e[el.dataset.error!] ? (lang === 'en' ? t('invalid') : e[el.dataset.error!]) : ''; }); };
    const preview = () => { const fd = new FormData(form), c = host.querySelector<HTMLCanvasElement>('#preview')!, ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 224, 180); ctx.drawImage(toCanvas(stallSprite(String(fd.get('color')), String(fd.get('category')), 1)), 0, 0, 224, 180); ctx.fillStyle = '#514238'; ctx.textAlign = 'center'; ctx.font = '16px -apple-system, sans-serif'; ctx.fillText(String(fd.get('name') || t('name')), 112, 18, 150); ctx.font = '12px -apple-system, sans-serif'; ctx.fillText(String(fd.get('sign') || ''), 166, 138, 52); host.querySelector('#preview-name')!.textContent = String(fd.get('name') || t('name')); host.querySelector('#preview-sign')!.textContent = String(fd.get('sign') || ''); };
    form.addEventListener('input', preview);
    preview();
    const drawItems = () => { host.querySelector('#items')!.innerHTML = items.map((p, i) => `<div class="item-row"><label>${t('itemName')}<input data-item="${i}" data-prop="name" value="${esc(p.name)}"><span class="error" data-error="items.${i}.name"></span></label><label>${t('price')}<input data-item="${i}" data-prop="price" type="number" min="0" max="99999" step="1" value="${p.price}"><span class="error" data-error="items.${i}.price"></span></label><button type="button" data-remove-item="${i}">${t('remove')}</button></div>`).join(''); (host.querySelector('#add-item') as HTMLButtonElement).disabled = items.length >= 3; };
    drawItems();
    host.querySelector('#add-item')!.addEventListener('click', () => { if (items.length < 3) {
        items.push({ name: '', price: 0 });
        drawItems();
    } });
    form.addEventListener('input', e => { const el = e.target as HTMLInputElement; if (el.dataset.item !== undefined) {
        const i = Number(el.dataset.item);
        if (el.dataset.prop === 'name')
            items[i].name = el.value;
        else
            items[i].price = el.value === '' ? NaN : Number(el.value);
    } });
    const drawKeep = () => { host.querySelector('#keep-photos')!.innerHTML = keep.map((p, i) => `<div class="photo-thumb"><img src="${esc(p)}" alt="${t('photos')}"><button type="button" data-remove-photo="${i}">${t('remove')}</button></div>`).join(''); };
    drawKeep();
    form.addEventListener('click', e => { const el = e.target as HTMLElement; if (el.dataset.removeItem !== undefined && items.length > 1) {
        items.splice(Number(el.dataset.removeItem), 1);
        drawItems();
    } if (el.dataset.removePhoto !== undefined) {
        keep.splice(Number(el.dataset.removePhoto), 1);
        drawKeep();
    } });
    const photoInput = host.querySelector<HTMLInputElement>('#photos')!;
    photoInput.onchange = async () => { const err = host.querySelector<HTMLElement>('[data-error="photos"]')!; err.textContent = ''; processing = true; const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!; submit.disabled = true; try {
        const selected = [...(photoInput.files || [])];
        if (selected.length + keep.length < 1 || selected.length + keep.length > 3)
            throw Error(lang === 'en' ? t('photos') : '請提供 1–3 張照片');
        files = await Promise.all(selected.map(compress));
        const box = host.querySelector('#new-photos')!;
        box.replaceChildren();
        for (const f of files) {
            const image = document.createElement('img');
            image.className = 'upload-thumb';
            image.alt = t('photos');
            const url = URL.createObjectURL(f);
            image.src = url;
            image.onload = () => URL.revokeObjectURL(url);
            box.append(image);
        }
    }
    catch (e) {
        files = [];
        photoInput.value = '';
        err.textContent = (e as Error).message;
    }
    finally {
        processing = false;
        submit.disabled = false;
    } };
    const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY;
    if (sitekey && !token) {
        const render = () => { const el = host.querySelector<HTMLElement>('#turnstile-box'); if (el?.isConnected && window.turnstile)
            widget = window.turnstile.render(el, { sitekey, callback: t => turnstile = t, 'expired-callback': () => turnstile = '' }); };
        if (window.turnstile)
            render();
        else {
            let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
            if (!script) {
                script = document.createElement('script');
                script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                script.dataset.turnstile = '';
                script.async = true;
                document.head.append(script);
            }
            script.addEventListener('load', render, { once: true });
        }
    }
    form.onsubmit = async (e) => { e.preventDefault(); if (processing)
        return; const fd = new FormData(form), get = (k: string) => String(fd.get(k) || ''); const data: Application = { region: 'hk', market: 'ssp', name: get('name'), by: get('by'), street: get('street'), category: get('category') as Application['category'], igUrl: get('igUrl'), shopUrl: get('shopUrl'), sign: get('sign'), note: get('note'), color: get('color'), email: get('email').trim(), items, own: fd.get('own') === 'on', consent: fd.get('consent') === 'on', keepPhotos: keep }; const result = validate(data, keep.length + files.length); if (sitekey && !token && !turnstile)
        result.turnstile = t('turnstile'); errors(result); if (Object.keys(result).length) {
        form.querySelector<HTMLElement>(`[name="${Object.keys(result)[0]}"]`)?.focus();
        return;
    } const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!, message = host.querySelector<HTMLElement>('#form-error')!; submit.disabled = true; submit.textContent = t('processing'); message.textContent = ''; try {
        const body = new FormData();
        body.set('data', JSON.stringify(data));
        files.forEach((f, i) => body.set('photo' + i, f));
        body.set('turnstile', turnstile);
        const response = await request(token ? '/api/manage' : '/api/apply', { method: token ? 'PUT' : 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body });
        if (token) {
            await renderForm(host, street, token);
            host.querySelector('h1')!.insertAdjacentHTML('afterend', `<p class="notice">${t('saved')}</p>`);
        }
        else {
            const link = location.origin + import.meta.env.BASE_URL + '#manage=' + response.token;
            host.innerHTML = `<section class="success"><h1>${t('success')}</h1><h2>${t('privateLink')}</h2><p class="private-link">${esc(link)}</p>${button('copy-link', t('copy'))}<p class="notice">${t('linkWarning')}</p></section>`;
            host.querySelector('#copy-link')!.addEventListener('click', async () => { await copyText(link); host.querySelector('#copy-link')!.textContent = t('copied'); });
        }
    }
    catch (e) {
        const err = e as Error & {
            field?: string;
            errors?: Record<string, string>;
        };
        if (err.errors)
            errors(err.errors);
        else if (err.field)
            errors({ [err.field]: err.message });
        message.textContent = err.message;
        if (widget)
            window.turnstile?.reset(widget);
    }
    finally {
        submit.disabled = false;
        submit.textContent = t(token ? 'save' : 'submit');
    } };
    host.querySelector('#delete-stall')?.addEventListener('click', async () => { if (!confirm(t('deleteConfirm')))
        return; if (prompt(t('deleteName')) !== initial?.name)
        return; try {
        await request('/api/manage', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
        try {
            sessionStorage.removeItem('diy.manage');
        }
        catch { /* 繼續收攤 */ }
        host.innerHTML = `<h1>${t('deleted')}</h1>`;
    }
    catch (e) {
        host.querySelector('#form-error')!.textContent = (e as Error).message;
    } });
}
