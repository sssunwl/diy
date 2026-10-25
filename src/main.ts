import './style.css';
import { getStalls } from './api';
import { Scene, type Look } from './scene';
import type { Stall, Category } from './types';
import { CATEGORIES } from './types';
import { SKINS, HAIRS, HAIR_COLORS, CLOTH_COLORS } from './pixelkit/character.js';
import { productPlaceholder } from './pixelkit/market.js';
import { toCanvas } from './pixelkit/core.js';
import { esc, t, dict, lang, toggleLang, modal, button, read, write } from './ui';
import { renderForm, cleanupForm, copyText } from './form';
import region from '../data/regions/hk.json';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="street-canvas" aria-label="${esc(region.brand.en)}" tabindex="0"></canvas><header id="topbar"></header><div id="street-label"></div><div id="seen"></div><main id="content" hidden></main><footer id="controls"></footer>`;
const content = document.querySelector<HTMLElement>('#content')!, canvas = document.querySelector<HTMLCanvasElement>('#street-canvas')!;
let mode: 'walk' | 'wall' | 'form' = 'walk', stalls: Stall[] = [], query = '', filter: Category | '' = '';
const scene = new Scene(canvas, s => showStall(s, false), street => { location.hash = 'apply&street=' + street; }, showLook, updateStreet, updateSeen);
function updateStreet() { document.querySelector('#street-label')!.textContent = region.markets[0].streets[scene.street].name[lang]; updateSeen(); }
function updateSeen() { document.querySelector('#seen')!.textContent = `${t('seen')} ${scene.current.filter(s => scene.seen.has(s.id)).length}/12`; }
function navigation() {
    document.querySelector('#topbar')!.innerHTML = `<a class="logo" href="#"><strong>趁墟<span class="logo-dot">✳</span></strong><small>${lang === 'en' ? 'Hong Kong Handmade Market' : region.brand.tagline}</small></a><nav>${button('walk', t('walk'))}${button('wall', t('wall'))}</nav><nav>${button('apply', t('apply'))}${button('about', t('about'))}${button('language', '中 / EN')}</nav>`;
    document.querySelector('#controls')!.innerHTML = `${button('next', t('next'))}<div>${button('prev-street', '← ' + t('prevStreet'))}${button('next-street', t('nextStreet') + ' →')}</div>${button('find', t('find'))}`;
    document.querySelector('#walk')!.addEventListener('click', () => setMode('walk'));
    document.querySelector('#wall')!.addEventListener('click', () => setMode('wall'));
    document.querySelector('#find')!.addEventListener('click', () => setMode('wall'));
    document.querySelector('#apply')!.addEventListener('click', () => location.hash = 'apply');
    document.querySelector('#about')!.addEventListener('click', showAbout);
    document.querySelector('#next')!.addEventListener('click', () => scene.next());
    document.querySelector('#prev-street')!.addEventListener('click', () => scene.change(-1));
    document.querySelector('#next-street')!.addEventListener('click', () => scene.change(1));
    document.querySelector('#language')!.addEventListener('click', () => { toggleLang(); document.querySelector<HTMLButtonElement>('#close-modal')?.click(); navigation(); updateStreet(); if (mode === 'wall')
        renderWall(); if (mode === 'form')
        route(); });
    updateSeen();
}
function setMode(next: 'walk' | 'wall' | 'form') { mode = next; scene.active = next === 'walk'; document.body.dataset.mode = next; content.hidden = next === 'walk'; canvas.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#controls')!.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#street-label')!.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#seen')!.hidden = next !== 'walk'; if (next !== 'form') {
    cleanupForm();
    if (location.hash.startsWith('#apply'))
        history.replaceState(null, '', location.pathname + location.search);
} if (next === 'wall')
    renderWall(); document.querySelectorAll('#topbar nav button').forEach(b => b.classList.toggle('selected', b.id === next)); }
function photo(s: Stall, index = 0) { if (s.demo && s.photos.length === 0) {
    const seed = [...s.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return toCanvas(productPlaceholder(s.category, seed)).toDataURL();
} return s.photos[index] || ''; }
function renderWall() { content.innerHTML = `<div class="wall-heading"><div><p class="eyebrow">SHAM SHUI PO · HONG KONG</p><h1>${t('wall')}</h1></div><label class="search"><span class="sr">${t('search')}</span><input id="search" placeholder="${t('search')}" value="${esc(query)}"></label></div><div id="filters" class="chips"><button data-cat="" class="${filter === '' ? 'selected' : ''}">${t('all')}</button>${CATEGORIES.map(c => `<button data-cat="${c}" class="${filter === c ? 'selected' : ''}">${dict().categories[c]}</button>`).join('')}</div><div id="cards" class="cards"></div>`; const draw = () => { const list = stalls.filter(s => (!filter || s.category === filter) && [s.name, s.by, ...s.items.map(i => i.name)].some(v => v.toLowerCase().includes(query.toLowerCase()))); content.querySelector('#cards')!.innerHTML = list.length ? list.map(s => `<button class="brand-card" data-id="${s.id}"><div class="card-image"><img src="${esc(photo(s))}" alt="${esc(s.items[0]?.name || s.name)}" class="${s.demo ? 'pixel' : ''}">${s.demo ? `<span class="badge">${t('demo')}</span>` : ''}</div><span class="card-text"><strong>${esc(s.name)}</strong><span>${esc(dict().categories[s.category])}</span><small>${esc(region.markets[0].streets.find(a => a.id === s.street)?.name[lang])}</small></span></button>`).join('') : `<p>${t('empty')}</p>`; }; draw(); content.querySelector('#search')!.addEventListener('input', e => { query = (e.target as HTMLInputElement).value; draw(); }); content.querySelector('#filters')!.addEventListener('click', e => { const el = e.target as HTMLElement; if (el.dataset.cat !== undefined) {
    filter = el.dataset.cat as Category | '';
    renderWall();
} }); content.querySelector('#cards')!.addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); if (el) {
    const s = stalls.find(s => s.id === el.dataset.id);
    if (s) {
        scene.seen.add(s.id);
        write('diy.seen', [...scene.seen]);
        updateSeen();
        showStall(s, true);
    }
} }); }
function showStall(s: Stall, wall = mode === 'wall') { let index = 0; const report = import.meta.env.VITE_REPORT_EMAIL; const box = modal(s.name, `<div class="stall-panel"><button class="photo-button" id="zoom-photo" aria-label="${t('zoom')}"><img id="stall-photo" class="${s.demo ? 'pixel' : ''}" src="${esc(photo(s))}" alt="${esc(s.items[0]?.name || s.name)}"></button>${s.photos.length > 1 ? `<div class="photo-nav">${button('photo-prev', t('photoPrevious'))}<span id="photo-count">1 / ${s.photos.length}</span>${button('photo-next', t('photoNext'))}</div>` : ''}<div class="tags">${s.demo ? `<span class="badge">${t('demo')}</span>` : ''}<span class="tag">${dict().categories[s.category]}</span></div><h3>${esc(s.name)}</h3><p class="muted">${t('by')} · ${esc(s.by)}</p><ul class="products">${s.items.map(i => `<li><span>${esc(i.name)}</span><strong>HK$ ${i.price.toLocaleString('en-HK')}</strong></li>`).join('')}</ul><div class="maker-note"><h4>${t('note')}</h4><p>${esc(s.note)}</p></div><div class="panel-actions"><a class="primary" href="${esc(s.igUrl)}" target="_blank" rel="noopener noreferrer">${t('ig')} ↗</a>${s.shopUrl ? `<a href="${esc(s.shopUrl)}" target="_blank" rel="noopener noreferrer">${t('shop')} ↗</a>` : ''}${button('share-stall', t('share'))}${wall ? button('go-stall', t('go')) : ''}</div><p class="fine">${t('disclaimer')}</p>${report ? `<a class="fine" href="mailto:${esc(report)}?subject=${encodeURIComponent('趁墟 ' + s.id)}">${t('report')}</a>` : ''}</div>`); box.classList.add('stall-overlay'); const photoImg = box.querySelector<HTMLImageElement>('#stall-photo')!; const move = (d: number) => { index = (index + d + s.photos.length) % s.photos.length; photoImg.src = photo(s, index); box.querySelector('#photo-count')!.textContent = `${index + 1} / ${s.photos.length}`; }; box.querySelector('#photo-prev')?.addEventListener('click', () => move(-1)); box.querySelector('#photo-next')?.addEventListener('click', () => move(1)); box.querySelector('#zoom-photo')!.addEventListener('click', () => { const dialog = document.createElement('dialog'); dialog.className = 'lightbox'; dialog.innerHTML = `${button('close-zoom', t('close'))}<img src="${esc(photo(s, index))}" class="${s.demo ? 'pixel' : ''}" alt="${esc(s.name)}">`; document.body.append(dialog); dialog.querySelector('button')!.onclick = () => { dialog.close(); dialog.remove(); }; dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); }); box.querySelector('#share-stall')!.addEventListener('click', async () => { const url = new URL(location.href); url.hash = 'stall=' + s.id; try {
    if (navigator.share)
        await navigator.share({ title: s.name, url: url.href });
    else {
        await copyText(url.href);
        box.querySelector('#share-stall')!.textContent = t('copied');
    }
}
catch { /* 使用者取消分享 */ } }); box.querySelector('#go-stall')?.addEventListener('click', () => { box.querySelector<HTMLButtonElement>('#close-modal')!.click(); setMode('walk'); scene.visit(s); }); }
function showLook() { const groups: {
    key: keyof Look;
    values: string[];
    label: string;
}[] = [{ key: 'skin', values: SKINS, label: t('skin') }, { key: 'hair', values: HAIRS, label: t('hair') }, { key: 'hairColor', values: HAIR_COLORS, label: t('hairColor') }, { key: 'cloth', values: CLOTH_COLORS, label: t('cloth') }]; const box = modal(t('look'), groups.map(g => `<fieldset><legend>${g.label}</legend><div class="${g.key === 'hair' ? 'chips' : 'swatches'}">${g.values.map((v, i) => `<button type="button" data-look="${g.key}" data-value="${v}" ${g.key !== 'hair' ? `style="--swatch:${v};background:${v}"` : ''} aria-label="${g.label} ${i + 1}" aria-pressed="${scene.look[g.key] === v}" class="${scene.look[g.key] === v ? 'selected' : ''}">${g.key === 'hair' ? dict().hairs[i] : '<span class="sr">' + g.label + ' ' + (i + 1) + '</span>'}</button>`).join('')}</div></fieldset>`).join('')); box.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-look]'); if (b) {
    const k = b.dataset.look as keyof Look;
    scene.setLook({ ...scene.look, [k]: b.dataset.value! });
    box.querySelectorAll(`[data-look="${k}"]`).forEach(el => { const selected = (el as HTMLElement).dataset.value === b.dataset.value; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
} }); }
function showAbout() { modal(t('about'), `<p>${t('aboutText')}</p><p>${t('disclaimer')}</p><p>${t('banned')}</p><p>${import.meta.env.VITE_REPORT_EMAIL ? t('reportText') : t('reportUnset')}</p>`); }
let managementToken: string | undefined;
async function route() { const hash = location.hash.slice(1); if (hash.startsWith('manage=')) {
    managementToken = hash.slice(7);
    history.replaceState(null, '', location.pathname + location.search);
    try {
        sessionStorage.setItem('diy.manage', managementToken);
    }
    catch { /* 仍可在此頁管理 */ }
    setMode('form');
    await renderForm(content, 'ki-lung', managementToken);
    return;
} if (hash.startsWith('apply')) {
    setMode('form');
    await renderForm(content, new URLSearchParams(hash.replace(/^apply&?/, '')).get('street') || 'ki-lung');
    return;
} if (hash.startsWith('stall=')) {
    const s = stalls.find(s => s.id === hash.slice(6));
    if (s) {
        setMode('walk');
        scene.visit(s, true);
    }
    return;
} setMode('walk'); }
window.addEventListener('hashchange', () => void route());
navigation();
updateStreet();
// 先移除私人管理 token，避免載入其他資源時仍留在網址。
if (location.hash.startsWith('#manage='))
    void route();
stalls = await getStalls();
scene.stalls = stalls;
updateSeen();
if (!managementToken) {
    if (!location.hash) {
        try {
            managementToken = sessionStorage.getItem('diy.manage') || undefined;
        }
        catch { /* 不支援儲存時正常逛街 */ }
        if (managementToken) {
            setMode('form');
            await renderForm(content, 'ki-lung', managementToken);
        }
        else
            await route();
    }
    else
        await route();
}
if (mode === 'walk' && !location.hash && !read('diy.tutorial', false)) {
    const box = modal(t('tutorial'), `<div class="tutorial-art">✳</div><p>${t('step1')}</p><p>${t('step2')}</p><p>${t('step3')}</p>${button('start', t('start'))}`);
    box.querySelector('#close-modal')!.addEventListener('click', () => write('diy.tutorial', true));
    box.querySelector('#start')!.addEventListener('click', () => { write('diy.tutorial', true); box.querySelector<HTMLButtonElement>('#close-modal')!.click(); });
}
