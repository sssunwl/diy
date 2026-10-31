import './style.css';
import { getStalls } from './api';
import { Scene, ROLES, type Look } from './scene';
import type { Stall, Category } from './types';
import { CATEGORIES } from './types';
import { photo } from './stall-photo';
import { esc, t, dict, lang, toggleLang, modal, button, read, write } from './ui';
import { renderForm, cleanupForm, copyText } from './form';
import region from '../data/regions/hk.json';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="street-canvas" aria-label="${esc(region.brand.en)}" tabindex="0"></canvas><header id="topbar"></header><button id="street-label"><span id="street-name"></span><span id="seen"></span></button><main id="content" hidden></main><footer id="controls"></footer>`;
const content = document.querySelector<HTMLElement>('#content')!, canvas = document.querySelector<HTMLCanvasElement>('#street-canvas')!;
let mode: 'walk' | 'wall' | 'form' = 'walk', stalls: Stall[] = [], query = '', filter: Category | '' = '';
const scene = new Scene(canvas, s => showStall(s, false), street => { location.hash = 'apply&street=' + street; }, showLook, updateStreet, updateSeen);
function updateStreet() { document.querySelector('#street-name')!.textContent = region.markets[0].streets[scene.street].name[lang]; updateSeen(); }
function updateSeen() { document.querySelector('#seen')!.textContent = `${t('seen')} ${scene.current.filter(s => scene.seen.has(s.id)).length}/${scene.current.length}`; }
document.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('.top-actions')) {
        const menu = document.querySelector<HTMLElement>('#more-menu');
        if (menu) menu.hidden = true;
        document.querySelector('#more')?.setAttribute('aria-expanded', 'false');
    }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const menu = document.querySelector<HTMLElement>('#more-menu');
        if (menu && !menu.hidden) { menu.hidden = true; document.querySelector<HTMLButtonElement>('#more')?.focus(); }
        document.querySelector('#more')?.setAttribute('aria-expanded', 'false');
    }
});
function navigation() {
    document.querySelector('#topbar')!.innerHTML = `<a class="logo" href="#"><strong>趁墟<span class="logo-dot">✳</span></strong><small>${lang === 'en' ? 'Hong Kong Handmade Market' : region.brand.tagline}</small></a><nav>${button('walk', t('walk'))}${button('wall', t('wall'))}</nav><div class="top-actions"><button type="button" id="apply"><span class="desktop-apply">${t('apply')}</span><span class="mobile-apply">${t('applyShort')}</span></button><button type="button" id="more" aria-label="${t('more')}" aria-expanded="false" aria-controls="more-menu">⋯</button><div id="more-menu" hidden>${button('about', t('about'))}${button('language', '中 / EN')}${button('season', t('season') + ' · ' + t(scene.season))}${button('time', t('time') + ' · ' + t(scene.time))}${button('full-map', t('fullMap'))}</div></div>`;
    document.querySelector('#controls')!.innerHTML = `${button('next', t('next'))}<div>${button('controls-map', t('fullMap'))}</div>${button('find', t('find'))}`;
    document.querySelector('#walk')!.addEventListener('click', () => setMode('walk'));
    document.querySelector('#wall')!.addEventListener('click', () => setMode('wall'));
    document.querySelector('#find')!.addEventListener('click', () => setMode('wall'));
    document.querySelector('#apply')!.addEventListener('click', () => location.hash = 'apply');
    const menu = document.querySelector<HTMLElement>('#more-menu')!;
    const more = document.querySelector<HTMLButtonElement>('#more')!;
    more.addEventListener('click', () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.querySelector('#about')!.addEventListener('click', () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); showAbout(); });
    document.querySelector('#next')!.addEventListener('click', () => scene.next());
    document.querySelector('#controls-map')!.addEventListener('click', () => scene.fullMap());
    document.querySelector('#language')!.addEventListener('click', () => { scene.closePreview(); toggleLang(); document.querySelector<HTMLButtonElement>('#close-modal')?.click(); navigation(); updateStreet(); if (mode === 'wall')
        renderWall(); if (mode === 'form')
        route(); });
    document.querySelector('#season')!.addEventListener('click', async () => { await scene.cycleSeason(); navigation(); });
    document.querySelector('#time')!.addEventListener('click', () => { scene.cycleTime(); navigation(); });
    document.querySelector('#full-map')!.addEventListener('click', () => scene.fullMap());
    updateSeen();
}
document.querySelector('#street-label')!.addEventListener('click', () => scene.change(1));
function setMode(next: 'walk' | 'wall' | 'form') { mode = next; scene.closePreview(); scene.active = next === 'walk'; document.body.dataset.mode = next; content.hidden = next === 'walk'; canvas.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#controls')!.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#street-label')!.hidden = next !== 'walk'; document.querySelector<HTMLElement>('#seen')!.hidden = next !== 'walk'; if (next !== 'form') {
    cleanupForm();
    if (location.hash.startsWith('#apply'))
        history.replaceState(null, '', location.pathname + location.search);
} if (next === 'wall')
    renderWall(); document.querySelectorAll('#topbar nav button').forEach(b => b.classList.toggle('selected', b.id === next)); }
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
function showStall(s: Stall, wall = mode === 'wall') { let index = 0; const report = import.meta.env.VITE_REPORT_EMAIL; const box = modal(s.name, `<div class="stall-panel"><button class="photo-button" id="zoom-photo" aria-label="${t('zoom')}"><img id="stall-photo" class="${s.demo ? 'pixel' : ''}" src="${esc(photo(s))}" alt="${esc(s.items[0]?.name || s.name)}"></button>${s.photos.length > 1 ? `<div class="photo-nav">${button('photo-prev', t('photoPrevious'))}<span id="photo-count">1 / ${s.photos.length}</span>${button('photo-next', t('photoNext'))}</div>` : ''}<div class="tags">${s.demo ? `<span class="badge">${t('demo')}</span>` : ''}<span class="tag">${dict().categories[s.category]}</span></div><h3>${esc(s.name)}</h3><p class="muted">${t('by')} · ${esc(s.by)}</p><ul class="products">${s.items.map(i => `<li><span>${esc(i.name)}</span><strong>HK$ ${i.price.toLocaleString('en-HK')}</strong></li>`).join('')}</ul><div class="maker-note"><h4>${t('note')}</h4><p>${esc(s.note)}</p></div><div class="panel-actions"><a class="primary" href="${esc(s.igUrl)}" target="_blank" rel="noopener noreferrer">${t('ig')} ↗</a>${s.shopUrl ? `<a href="${esc(s.shopUrl)}" target="_blank" rel="noopener noreferrer">${t('shop')} ↗</a>` : ''}${button('share-stall', t('share'))}${wall ? button('go-stall', t('go')) : ''}</div><p class="fine">${t('disclaimer')}</p>${report ? `<a class="fine" href="mailto:${esc(report)}?subject=${encodeURIComponent('趁墟 ' + s.id)}">${t('report')}</a>` : ''}</div>`); box.classList.add('stall-overlay');
    if (!wall) scene.focus(s);
    const header = box.querySelector<HTMLElement>('.dialog header')!;
    let drag: { id: number; y: number } | undefined;
    header.addEventListener('pointerdown', e => {
        if (innerWidth > 699 || (e.target as HTMLElement).closest('button')) return;
        drag = { id: e.pointerId, y: e.clientY }; header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', e => {
        if (drag?.id !== e.pointerId) return;
        const dy = Math.max(0, e.clientY - drag.y);
        box.querySelector<HTMLElement>('.dialog')!.style.transform = `translateY(${dy}px)`;
    });
    const release = (e: PointerEvent) => {
        if (drag?.id !== e.pointerId) return;
        const dy = e.clientY - drag.y; drag = undefined;
        box.querySelector<HTMLElement>('.dialog')!.style.transform = '';
        if (e.type !== 'pointercancel' && dy > 65) box.querySelector<HTMLButtonElement>('#close-modal')!.click();
    };
    header.addEventListener('pointerup', release); header.addEventListener('pointercancel', release);
    const photoImg = box.querySelector<HTMLImageElement>('#stall-photo')!; const move = (d: number) => { index = (index + d + s.photos.length) % s.photos.length; photoImg.src = photo(s, index); box.querySelector('#photo-count')!.textContent = `${index + 1} / ${s.photos.length}`; }; box.querySelector('#photo-prev')?.addEventListener('click', () => move(-1)); box.querySelector('#photo-next')?.addEventListener('click', () => move(1)); box.querySelector('#zoom-photo')!.addEventListener('click', () => { const dialog = document.createElement('dialog'); dialog.className = 'lightbox'; dialog.innerHTML = `${button('close-zoom', t('close'))}<img src="${esc(photo(s, index))}" class="${s.demo ? 'pixel' : ''}" alt="${esc(s.name)}">`; document.body.append(dialog); dialog.querySelector('button')!.onclick = () => { dialog.close(); dialog.remove(); }; dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); }); box.querySelector('#share-stall')!.addEventListener('click', async () => { const url = new URL(location.href); url.hash = 'stall=' + s.id; try {
    if (navigator.share)
        await navigator.share({ title: s.name, url: url.href });
    else {
        await copyText(url.href);
        box.querySelector('#share-stall')!.textContent = t('copied');
    }
}
catch { /* 使用者取消分享 */ } }); box.querySelector('#go-stall')?.addEventListener('click', () => { box.querySelector<HTMLButtonElement>('#close-modal')!.click(); setMode('walk'); scene.visit(s); }); }
function showLook() { const box = modal(t('look'), `<div class="role-picker">${ROLES.map((role, i) => `<button type="button" data-role="${role}" aria-label="${t('look')} ${i + 1}" aria-pressed="${scene.look.role === role}" class="${scene.look.role === role ? 'selected' : ''}"><img src="${import.meta.env.BASE_URL}art/walk2_${role}_se_b.webp" alt=""></button>`).join('')}</div>`); box.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-role]'); if (!b) return; scene.setLook({ role: b.dataset.role as Look['role'] }); box.querySelectorAll<HTMLElement>('[data-role]').forEach(el => { const selected = el.dataset.role === scene.look.role; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); }); }); }
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
