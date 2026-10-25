import zh from '../i18n/zh-HK.json';
import en from '../i18n/en.json';
export function read<T>(key: string, fallback: T): T { try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
}
catch {
    return fallback;
} }
export function write(key: string, value: unknown) { try {
    localStorage.setItem(key, JSON.stringify(value));
}
catch { /* 儲存不可用時繼續遊玩 */ } }
export let lang: 'zh-HK' | 'en' = read<string>('diy.lang', 'zh-HK') === 'en' ? 'en' : 'zh-HK';
export function toggleLang() { lang = lang === 'en' ? 'zh-HK' : 'en'; write('diy.lang', lang); document.documentElement.lang = lang; }
export const dict = () => lang === 'en' ? en : zh;
export const t = (key: Exclude<keyof typeof zh, 'categories' | 'hairs' | 'awayLines'>) => dict()[key];
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const button = (id: string, label: string) => `<button type="button" id="${id}">${esc(label)}</button>`;
export function modal(title: string, html: string) { const old = document.querySelector('#overlay'); old?.querySelector<HTMLButtonElement>('#close-modal')?.click(); const box = document.createElement('div'); box.id = 'overlay'; box.className = 'overlay'; box.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2>${button('close-modal', t('close'))}</header>${html}</section>`; document.body.append(box); const close = () => { box.remove(); document.removeEventListener('keydown', key); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape')
    close(); if (e.key === 'Tab') {
    const a = Array.from(box.querySelectorAll<HTMLElement>('button,a,input,select,textarea')).filter(x => !x.hasAttribute('disabled'));
    if (e.shiftKey && document.activeElement === a[0]) {
        e.preventDefault();
        a.at(-1)?.focus();
    }
    else if (!e.shiftKey && document.activeElement === a.at(-1)) {
        e.preventDefault();
        a[0]?.focus();
    }
} }; document.addEventListener('keydown', key); box.querySelector('#close-modal')!.addEventListener('click', close); box.addEventListener('click', e => { if (e.target === box)
    close(); }); box.querySelector<HTMLElement>('button')?.focus(); return box; }
