import { toCanvas } from './pixelkit/core.js';
import { makeCharacter, randomLook, DEFAULT } from './pixelkit/character.js';
import { stallSprite, landmarkSprite, streetProp, groundTile } from './pixelkit/market.js';
import type { Stall } from './types';
import { dict, t, read, write, lang } from './ui';
import region from '../data/regions/hk.json';
export type Look = typeof DEFAULT;
export class Scene {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    stalls: Stall[] = [];
    street = 0;
    x = 180;
    y = 211;
    camera = 0;
    scale = 3;
    dir = 0;
    walking = false;
    target: {
        x: number;
        y: number;
    } | null = null;
    keys = new Set<string>();
    look: Look;
    seen: Set<string>;
    onOpen: (s: Stall) => void;
    onApply: (s: string) => void;
    onLook: () => void;
    onStreet: () => void;
    onSeen: () => void;
    active = true;
    private last = 0;
    private drag = false;
    private down = { x: 0, y: 0 };
    private moved = false;
    private pointer = { x: 0, y: 0 };
    private pointerClient = { x: 0, y: 0 };
    private auto: Stall | null = null;
    private sprites = new Map<string, HTMLCanvasElement>();
    private npcs = Array.from({ length: 4 }, (_, i) => ({ x: 250 + i * 190, y: 181 + i % 2 * 65, tx: 250 + i * 190, ty: 190, sheet: toCanvas(makeCharacter(randomLook(i + 20))) }));
    constructor(canvas: HTMLCanvasElement, open: (s: Stall) => void, apply: (s: string) => void, look: () => void, street: () => void, seen: () => void) { this.canvas = canvas; this.ctx = canvas.getContext('2d')!; this.onOpen = open; this.onApply = apply; this.onLook = look; this.onStreet = street; this.onSeen = seen; const stored = read<Look>('diy.look', DEFAULT); this.look = stored && Object.values(stored).every(v => typeof v === 'string') ? stored : DEFAULT; const ids = read<unknown>('diy.seen', []); this.seen = new Set(Array.isArray(ids) ? ids.filter(v => typeof v === 'string') : []); window.addEventListener('resize', () => this.resize()); this.resize(); window.addEventListener('keydown', e => { if (!this.available())
        return; const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter', 'w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
        this.keys.add(k);
        this.target = null;
        if (k === ' ' || k === 'enter') {
            const s = this.nearest();
            if (s)
                this.open(s);
        }
    } }); window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase())); window.addEventListener('blur', () => { this.keys.clear(); this.drag = false; }); canvas.onpointerdown = e => { if (!this.available())
        return; canvas.setPointerCapture(e.pointerId); this.down = { x: e.clientX, y: e.clientY }; this.pointer = this.point(e); this.pointerClient = { x: e.clientX, y: e.clientY }; this.drag = true; this.moved = false; }; canvas.onpointermove = e => { if (this.drag) {
        if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7)
            this.moved = true;
        this.pointer = this.point(e);
        this.pointerClient = { x: e.clientX, y: e.clientY };
    } }; canvas.onpointerup = e => { this.drag = false; if (!this.available())
        return; const p = this.point(e); if (!this.moved) {
        if (Math.abs(p.x - this.x) < 14 && Math.abs(p.y - (this.y - 16)) < 20) {
            this.onLook();
            return;
        }
        const slot = this.hit(p.x, p.y);
        if (slot !== null) {
            const s = this.current.find(s => s.slot === slot);
            if (s)
                this.open(s);
            else
                this.onApply(this.streetId);
            return;
        }
        if (p.x < 92 || p.x > 1080) {
            this.change(p.x < 92 ? -1 : 1);
            return;
        }
    } this.target = { x: p.x, y: Math.max(169, Math.min(275, p.y)) }; }; canvas.onpointercancel = () => this.drag = false; requestAnimationFrame(n => this.frame(n)); }
    get streetId() { return region.markets[0].streets[this.street].id; }
    get current() { return this.stalls.filter(s => s.street === this.streetId); }
    private available() { return this.active && !document.querySelector('#overlay'); }
    resize() { this.scale = window.innerWidth < 700 ? 2 : 3; while (this.scale > 1 && ((innerHeight - 180) / this.scale < 330 || innerWidth / this.scale < 155))
        this.scale--; this.scale = Math.max(1, this.scale); this.canvas.width = Math.ceil(innerWidth / this.scale); this.canvas.height = Math.ceil(innerHeight / this.scale); this.canvas.style.width = `${this.canvas.width * this.scale}px`; this.canvas.style.height = `${this.canvas.height * this.scale}px`; this.ctx.imageSmoothingEnabled = false; }
    point(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.scale + this.camera, y: (e.clientY - r.top) / this.scale - this.offset }; }
    get offset() { const top = (innerWidth <= 600 ? 112 : 85) / this.scale; const bottom = 85 / this.scale; return Math.round(top + (this.canvas.height - top - bottom - 375) / 2); }
    position(slot: number) { return { x: 158 + (slot % 6) * 160, y: slot < 6 ? 65 : 284 }; }
    front(s: Stall) { const p = this.position(s.slot); return { x: p.x + 56, y: s.slot < 6 ? 177 : 272 }; }
    hit(x: number, y: number) { for (let i = 11; i >= 0; i--) {
        const p = this.position(i);
        if (x >= p.x && x <= p.x + 112 && y >= p.y && y <= p.y + 90)
            return i;
    } return null; }
    nearest() { return this.current.find(s => { const p = this.front(s); return Math.hypot(p.x - this.x, p.y - this.y) <= 24; }); }
    open(s: Stall) { this.seen.add(s.id); write('diy.seen', [...this.seen]); this.target = null; this.auto = null; this.keys.clear(); this.onSeen(); this.onOpen(s); }
    change(delta: number) { this.street = (this.street + delta + 2) % 2; this.x = delta > 0 ? 130 : 1040; this.y = 220; this.target = null; this.auto = null; this.onStreet(); }
    visit(s: Stall, open = false) { this.street = s.street === 'ki-lung' ? 0 : 1; const p = this.front(s); this.x = p.x; this.y = p.y; this.target = null; this.onStreet(); if (open)
        this.open(s); }
    next() { const ordered = [...this.current].sort((a, b) => a.slot - b.slot); const s = ordered.find(s => !this.seen.has(s.id)) || ordered[0]; if (s) {
        const p = this.front(s);
        this.target = p;
        this.auto = s;
    } }
    setLook(look: Look) { this.look = look; write('diy.look', look); }
    private image(key: string, fn: () => ReturnType<typeof stallSprite>) { let c = this.sprites.get(key); if (!c) {
        c = toCanvas(fn())!;
        this.sprites.set(key, c!);
    } return c!; }
    private frame(now: number) { const dt = Math.min((now - this.last) / 1000, .05) || 0; this.last = now; if (this.available())
        this.update(dt); this.draw(now); requestAnimationFrame(n => this.frame(n)); }
    private update(dt: number) {
        if (this.drag)
            this.pointer = { x: this.pointerClient.x / this.scale + this.camera, y: this.pointerClient.y / this.scale - this.offset };
        let dx = 0, dy = 0;
        if (this.keys.size) {
            dx = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
            dy = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
            this.auto = null;
        }
        else {
            const dest = this.drag && this.moved ? this.pointer : this.target;
            if (dest) {
                dx = dest.x - this.x;
                dy = dest.y - this.y;
                if (Math.hypot(dx, dy) < 3) {
                    dx = dy = 0;
                    this.target = null;
                    if (this.auto) {
                        const s = this.auto;
                        this.auto = null;
                        this.open(s);
                    }
                }
            }
        }
        const len = Math.hypot(dx, dy);
        this.walking = len > 0;
        if (len) {
            const step = Math.min(90 * dt, len);
            this.x = Math.max(60, Math.min(1110, this.x + dx / len * step));
            this.y = Math.max(169, Math.min(275, this.y + dy / len * step));
            this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
            if (this.x <= 65)
                this.change(-1);
            if (this.x >= 1105)
                this.change(1);
        }
        for (const n of this.npcs) {
            if (Math.hypot(n.tx - n.x, n.ty - n.y) < 4) {
                n.tx = 140 + Math.random() * 880;
                n.ty = 184 + Math.random() * 70;
            }
            const l = Math.hypot(n.tx - n.x, n.ty - n.y);
            n.x += (n.tx - n.x) / l * 12 * dt;
            n.y += (n.ty - n.y) / l * 12 * dt;
        }
    }
    private draw(now: number) {
        const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
        this.camera = Math.max(0, Math.min(1168 - w, this.x - w / 2));
        if (w > 1168)
            this.camera = (1168 - w) / 2;
        c.fillStyle = '#f4dfc0';
        c.fillRect(0, 0, w, h);
        c.save();
        c.translate(-Math.round(this.camera), this.offset);
        const tile = this.image('ground', groundTile);
        for (let x = 0; x < 1168; x += 32)
            for (let y = -256; y < 650; y += 32)
                c.drawImage(tile, x, y);
        c.fillStyle = '#b8d4be';
        c.fillRect(0, 0, 1168, 61);
        c.fillStyle = '#87b4a3';
        c.fillRect(0, 49, 1168, 12);
        for (let x = 12; x < 1168; x += 40) {
            c.strokeStyle = '#63988c';
            c.strokeRect(x, 7, 32, 34);
            c.fillStyle = '#e7e5bb';
            c.fillRect(x + 5, 13, 20, 21);
        }
        c.fillStyle = '#e8c9b0';
        c.fillRect(0, 164, 1168, 116);
        c.fillStyle = '#f6e6ca';
        c.fillRect(0, 176, 1168, 2);
        c.fillRect(0, 267, 1168, 2);
        c.drawImage(this.image('landmark' + this.street, () => landmarkSprite(this.street === 0 ? 'fabric' : 'buttons')), 20, 59);
        ['post', 'lamp', 'sign'].forEach((k, i) => c.drawImage(this.image(k, () => streetProp(k)), 38 + i * 450, 292));
        const drawStall = (i: number) => { const p = this.position(i), s = this.current.find(s => s.slot === i); const key = s ? `${s.color}:${s.category}` : 'empty'; c.drawImage(this.image(key, () => stallSprite(s?.color, s?.category, i)), p.x, p.y); c.textAlign = 'center'; c.fillStyle = '#433b32'; c.font = '8px -apple-system,"PingFang HK",sans-serif'; c.fillText(s ? s.name : t('recruit'), p.x + 56, p.y + 9, 92); c.font = '6px -apple-system,"PingFang HK",sans-serif'; if (s) {
            const seed = [...s.id].reduce((a, v) => a + v.charCodeAt(0), 0);
            c.fillStyle = '#fff5de';
            c.fillRect(p.x + 1, p.y + 88, 110, 15);
            c.fillStyle = '#63513c';
            c.fillText(dict().awayLines[seed % 4] + (s.sign ? ' · ' + s.sign : ''), p.x + 56, p.y + 98, 106);
        }
        else {
            c.fillText(t('apply'), p.x + 82, p.y + 69, 28);
        } if (s && this.nearest()?.id === s.id) {
            c.fillStyle = '#fff8e4';
            c.fillRect(p.x + 35, p.y - 17, 42, 15);
            c.fillStyle = '#805744';
            c.font = '8px sans-serif';
            c.fillText(t('tap'), p.x + 56, p.y - 6);
        } };
        for (let i = 0; i < 6; i++)
            drawStall(i);
        const frame = this.walking ? 2 + Math.floor(now / 125) % 4 : Math.floor(now / 1600) % 2;
        const people = [...this.npcs.map(n => ({ x: n.x, y: n.y, sheet: n.sheet, dir: n.tx < n.x ? 1 : 2, frame: 2 + Math.floor(now / 180) % 4 })), { x: this.x, y: this.y, sheet: toCanvas(makeCharacter(this.look)), dir: this.dir, frame }].sort((a, b) => a.y - b.y);
        for (const p of people)
            c.drawImage(p.sheet, p.frame * 24, p.dir * 32, 24, 32, Math.round(p.x) - 12, Math.round(p.y) - 30, 24, 32);
        for (let i = 6; i < 12; i++)
            drawStall(i);
        c.font = '9px sans-serif';
        c.textAlign = 'center';
        for (const x of [65, 1100]) {
            c.fillStyle = '#8b6d4f';
            c.fillRect(x - 2, 204, 4, 40);
            c.fillStyle = '#fff1c9';
            c.fillRect(x - 29, 189, 58, 21);
            c.fillStyle = '#6a5144';
            c.fillText(x < 100 ? '←' : '→', x, 203);
        }
        c.fillStyle = '#fff4d9';
        c.fillRect(25, 5, 145, 28);
        c.fillStyle = '#6f5641';
        c.font = '10px sans-serif';
        c.fillText(region.markets[0].streets[this.street].name[lang], 97, 23, 135);
        c.restore();
    }
}
