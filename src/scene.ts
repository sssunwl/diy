import type { Stall } from './types';
import { read, write, t, esc, dict } from './ui';
import { photo } from './stall-photo';
import region from '../data/regions/hk.json';
export const ROLES = ['hero', 'cap', 'camera', 'student', 'potter', 'leather'] as const;
export type Look = {
    role: typeof ROLES[number];
};
type Point = {
    x: number;
    y: number;
};
type Item = Point & {
    n: string;
    w: number;
    h: number;
    d: number;
};
type Slot = Item & {
    gx: number;
    gy: number;
    fx: number;
    fy: number;
    kind: string;
    stall?: Stall;
    streetId?: string;
};
type Layout = {
    size: number[];
    transform: {
        a1: number;
        a2: number;
        b1: number;
        b2: number;
        ox: number;
        oy: number;
    };
    fill: Record<string, string>;
    items: Item[];
    slots: Slot[];
    mask: {
        lo: number;
        step: number;
        rows: string[];
    };
    start: number[];
    hub: number[];
    trail: number[][];
    trailWidth: number;
    aisles: number[][];
    strings: number[][][];
};
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const TIMES = ['day', 'dusk', 'night'] as const;
const KINDS = {
    jogger: { names: ['park_jogger_f', 'park_jogger_m'], speed: 3.4, cycle: 1.7, right: true },
    stroll: { names: ROLES.map(r => 'walk2_' + r), speed: 1.5, cycle: 1, right: false },
    elders: { names: ['park_grandpa', 'park_grandma'], speed: 1, cycle: .8, right: true },
    dogwalk: { names: ['park_dogwalker'], speed: 1.4, cycle: 1, right: true },
    cyclist: { names: ['park_cyclist'], speed: 7.5, cycle: 5, right: false },
};
type Cast = {
    kind: keyof typeof KINDS | 'chat';
    s: number;
    way: number;
    lane: number;
    pick: number;
    dog: string;
    age: number;
    life: number;
    aisle: number;
    distance: number;
};
type Draw = {
    d: number;
    paint: () => void;
};
export class Scene {
    stalls: Stall[] = [];
    street = 0;
    active = true;
    look: Look;
    seen: Set<string>;
    season: typeof SEASONS[number];
    time: typeof TIMES[number];
    private ctx: CanvasRenderingContext2D;
    private layout?: Layout;
    private images = new Map<string, HTMLImageElement>();
    private hits = new Map<string, { width: number; height: number; alpha: Uint8ClampedArray }>();
    private lights = new Map<string, HTMLCanvasElement>();
    private peopleHits: { path: string; x: number; y: number; w: number; h: number; flip: boolean; d: number; hero: boolean }[] = [];
    private preview?: { slot: Slot; box: HTMLElement };
    private labelAlpha = new Map<Slot, number>();
    private full = false;
    private focusSlot?: Slot;
    private marker?: Point & { age: number };
    private heads = new Map<string, number>();
    private ground?: HTMLImageElement;
    private outside = '';
    private glow?: HTMLImageElement;
    private grade = document.createElement('canvas');
    private warm = document.createElement('canvas');
    private staticItems: Item[] = [];
    private assignedStalls?: Stall[];
    private ready = false;
    private failed = false;
    private progress = 0;
    private total = 1;
    private gx = 0;
    private gy = 0;
    private cx = 0;
    private cy = 0;
    private zoom = innerWidth <= 699 ? .8 : 1;
    private following = true;
    private keys = new Set<string>();
    private path: Point[] = [];
    private auto: Stall | null = null;
    private pointers = new Map<number, Point>();
    private down: Point = { x: 0, y: 0 };
    private moved = false;
    private pinch = 0;
    private last = 0;
    private distance = 0;
    private dx = -1;
    private dy = 1;
    private walking = false;
    private cast: Cast[] = [];
    private lengths: number[] = [0];
    private trailLength = 0;
    private queue: Draw[] = [];
    private pending?: {
        stall: Stall;
        open: boolean;
    };
    constructor(public canvas: HTMLCanvasElement, private onOpen: (s: Stall) => void, private onApply: (s: string) => void, private onLook: () => void, private onStreet: () => void, private onSeen: () => void) {
        this.ctx = canvas.getContext('2d')!;
        document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
        document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
        const saved = read<Partial<Look> | null>('diy.look', null);
        this.look = saved && ROLES.includes(saved.role!) ? { role: saved.role! } : { role: 'hero' };
        const seen = read<unknown>('diy.seen', []);
        this.seen = new Set(Array.isArray(seen) ? seen.filter(x => typeof x === 'string') : []);
        const now = new Date(), q = new URLSearchParams(location.search), hour = now.getHours() + now.getMinutes() / 60;
        this.season = SEASONS.includes(q.get('season') as typeof this.season) ? q.get('season') as typeof this.season : SEASONS[Math.floor((now.getMonth() + 10) % 12 / 3)];
        this.time = TIMES.includes(q.get('time') as typeof this.time) ? q.get('time') as typeof this.time : hour >= 6 && hour < 16 ? 'day' : hour >= 16 && hour < 18.5 ? 'dusk' : 'night';
        window.addEventListener('resize', () => this.resize());
        this.resize();
        window.addEventListener('keydown', e => { if (!this.available() || /INPUT|TEXTAREA|SELECT|BUTTON/.test((e.target as HTMLElement).tagName))
            return; const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'enter'].includes(k)) {
            e.preventDefault();
            if (k === ' ' || k === 'enter') {
                const s = this.nearest();
                if (s)
                    this.open(s);
            }
            else {
                this.closePreview();
                this.keys.add(k);
                this.path.length = 0;
                this.auto = null;
            }
        } });
        window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
        window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
        canvas.onpointerdown = e => { if (!this.available())
            return; canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.down = { x: e.clientX, y: e.clientY }; this.moved = this.pointers.size > 1; if (this.pointers.size === 2) {
            this.pinch = this.pinchDistance();
            this.moved = true;
        } };
        canvas.onpointermove = e => { const prev = this.pointers.get(e.pointerId); if (!prev)
            return; this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pointers.size > 1) {
            const d = this.pinchDistance();
            this.setZoom(this.zoom * d / this.pinch, this.midpoint());
            this.pinch = d;
            this.moved = true;
        }
        else {
            if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > (e.pointerType === 'touch' ? 10 : 7))
                this.moved = true;
            if (this.moved) {
                this.full = false;
                this.following = false;
                this.cx -= (e.clientX - prev.x) / this.zoom;
                this.cy -= (e.clientY - prev.y) / this.zoom;
                this.clampCamera();
            }
        } };
        canvas.onpointerup = e => { this.pointers.delete(e.pointerId); if (!this.moved && this.available())
            this.click(this.point(e.clientX, e.clientY)); if (this.pointers.size)
            this.moved = true; };
        canvas.onpointercancel = e => { this.pointers.delete(e.pointerId); this.moved = true; };
        canvas.addEventListener('wheel', e => { if (!this.available())
            return; e.preventDefault(); this.setZoom(this.zoom * Math.exp(-e.deltaY * .001), { x: e.clientX, y: e.clientY }); }, { passive: false });
        void this.load();
        requestAnimationFrame(n => this.frame(n));
    }
    get streetId() { return region.markets[0].streets[this.street].id; }
    get current() { return this.stalls.filter(s => s.street === this.streetId); }
    private available() { return this.ready && this.active && !document.querySelector('#overlay'); }
    private resize() { const dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = Math.round(innerWidth * dpr); this.canvas.height = Math.round(innerHeight * dpr); this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px'; this.grade.width = Math.max(1, Math.ceil(innerWidth / 2)); this.grade.height = Math.max(1, Math.ceil(innerHeight / 2)); if (this.full) this.fitMap(); this.clampCamera(); }
    private async image(path: string, head = false) { const im = new Image(); await new Promise((ok, fail) => { im.onload = ok; im.onerror = () => fail(Error(path)); im.src = import.meta.env.BASE_URL + path; }); this.images.set(path, im);
        if (head || path.includes('/sprites/')) {
            const mask = document.createElement('canvas');
            mask.width = Math.max(1, Math.ceil(im.width / 2));
            mask.height = Math.max(1, Math.ceil(im.height / 2));
            const m = mask.getContext('2d', { willReadFrequently: true })!;
            m.drawImage(im, 0, 0, mask.width, mask.height);
            const data = m.getImageData(0, 0, mask.width, mask.height);
            this.hits.set(path, { width: mask.width, height: mask.height, alpha: data.data.slice() });
            if (path.includes('/stall_')) {
                for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
                    const i = (y * mask.width + x) * 4;
                    data.data[i] = 224; data.data[i + 1] = 194; data.data[i + 2] = 128;
                    data.data[i + 3] *= Math.min(1, .45 + y / mask.height * 1.9);
                }
                m.putImageData(data, 0, 0);
                this.lights.set(path, mask);
            }
        }
        if (head) {
        const c = document.createElement('canvas');
        c.width = im.width;
        c.height = Math.max(1, Math.floor(im.height * .45));
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(im, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let sum = 0, weight = 0;
        for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++) {
                const a = data[(y * c.width + x) * 4 + 3];
                sum += a;
                weight += a * x;
            }
        this.heads.set(path, sum ? weight / sum : im.width / 2);
    } this.progress++; return im; }
    private async load() {
        try {
            const r = await fetch(import.meta.env.BASE_URL + 'map/hk/layout.json');
            if (!r.ok)
                throw Error('layout ' + r.status);
            this.layout = await r.json();
            const l = this.layout!;
            this.staticItems = l.items.concat(l.slots);
            const names = new Set(l.items.concat(l.slots).filter(i => !i.n.startsWith('@')).map(i => i.n));
            for (const s of SEASONS)
                for (const size of ['big', 'small'])
                    names.add(`tree_${s}_${size}`);
            for (const n of ['accessory', 'textile', 'leather', 'ceramic', 'wood', 'paper', 'candle', 'art', 'food', 'workshop', 'other', 'empty'])
                names.add('stall_' + n);
            const people = [...new Set(Object.values(KINDS).flatMap(k => k.names).concat(['park_shiba', 'park_poodle']))];
            const paths = [...names].map(n => ({ path: `map/hk/sprites/${n}.webp`, head: false }));
            for (const n of people)
                for (const way of ['se', 'ne'])
                    for (const f of ['a', 'b', 'c'])
                        paths.push({ path: `art/${n}_${way}_${f}.webp`, head: true });
            for (let i = 0; i < 3; i++)
                for (let f = 1; f <= 2; f++)
                    paths.push({ path: `art/park_chat${i}_${f}.webp`, head: true });
            this.total = paths.length + 2;
            await Promise.all([...paths.map(p => this.image(p.path, p.head)), this.image(`map/hk/ground_${this.season}.webp`).then(im => this.setGround(im)), this.image('map/hk/glow.webp').then(im => this.glow = im)]);
            this.tintGlow();
            [this.gx, this.gy] = l.start;
            const start = this.closest(this.gx, this.gy);
            this.gx = start.x;
            this.gy = start.y;
            const p = this.world(this.gx, this.gy);
            this.cx = p.x;
            this.cy = p.y;
            for (let i = 0; i < l.trail.length; i++) {
                const a = l.trail[i], b = l.trail[(i + 1) % l.trail.length];
                this.lengths.push(this.lengths[i] + Math.hypot(a[0] - b[0], a[1] - b[1]));
            }
            this.trailLength = this.lengths.at(-1)!;
            for (let i = 0; i < 24; i++)
                this.cast.push(this.newCast(i < 12 ? i % l.aisles.length : -1, i));
            this.assign();
            this.ready = true;
            if (this.pending) {
                const p = this.pending;
                this.pending = undefined;
                this.visit(p.stall, p.open);
            }
        }
        catch (e) {
            this.failed = true;
            console.error('Map loading failed', e);
        }
    }
    private assign() { const l = this.layout; if (!l || this.assignedStalls === this.stalls)
        return; this.assignedStalls = this.stalls; for (const slot of l.slots) {
        slot.stall = undefined;
        slot.streetId = slot.gy < 43 ? 'ki-lung' : 'yu-chau';
    } for (const [street, rows] of [['ki-lung', [30, 37]], ['yu-chau', [55, 62]]] as const) {
        const slots = l.slots.filter(s => rows.includes(s.gy as never)).sort((a, b) => Math.hypot(a.gx - l.hub[0], a.gy - l.hub[1]) - Math.hypot(b.gx - l.hub[0], b.gy - l.hub[1]) || a.gx - b.gx);
        for (const s of this.stalls.filter(s => s.street === street))
            if (slots[s.slot])
                slots[s.slot].stall = s;
    } }
    private world(x: number, y: number): Point { const a = this.layout!.transform; return { x: x * a.a1 - y * a.a2 + a.ox, y: x * a.b1 + y * a.b2 + a.oy }; }
    private grid(x: number, y: number): Point { const a = this.layout!.transform, det = a.a1 * a.b2 + a.a2 * a.b1; x -= a.ox; y -= a.oy; return { x: (x * a.b2 + y * a.a2) / det, y: (y * a.a1 - x * a.b1) / det }; }
    private point(x: number, y: number): Point { const r = this.canvas.getBoundingClientRect(); return { x: (x - r.left - innerWidth / 2) / this.zoom + this.cx, y: (y - r.top - innerHeight / 2) / this.zoom + this.cy }; }
    private pinchDistance() { const a = [...this.pointers.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    private midpoint() { const a = [...this.pointers.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
    private setZoom(z: number, anchor: Point) { this.full = false; const before = this.point(anchor.x, anchor.y); this.zoom = Math.max(.4, Math.min(1.6, z)); const after = this.point(anchor.x, anchor.y); this.cx += before.x - after.x; this.cy += before.y - after.y; this.following = false; this.clampCamera(); }
    private defaultZoom() { return innerWidth <= 699 ? .8 : 1; }
    private insets() {
        return { top: (document.querySelector('#topbar')?.getBoundingClientRect().bottom || 60) + 48,
            bottom: innerHeight - (document.querySelector('#controls')?.getBoundingClientRect().top || innerHeight - 70) + 8 };
    }
    fullMap() {
        if (!this.layout) return;
        this.full = !this.full;
        this.closePreview();
        if (this.full) this.fitMap();
        else { this.zoom = this.defaultZoom(); this.following = true; }
    }
    private setGround(im: HTMLImageElement) {
        this.ground = im;
        const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        probe.canvas.width = im.width; probe.canvas.height = 1;
        probe.drawImage(im, 0, 0);
        const d = probe.getImageData(0, 0, im.width, 1).data, sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
        this.outside = `rgb(${sum.map(v => Math.round(v / im.width)).join()})`;
    }
    private fitMap() {
        if (!this.layout) return;
        const { top, bottom } = this.insets();
        this.zoom = Math.min(1.6, innerWidth / this.layout.size[0], Math.max(1, innerHeight - top - bottom) / this.layout.size[1]);
        this.cx = this.layout.size[0] / 2;
        this.cy = this.layout.size[1] / 2 - (top - bottom) / (2 * this.zoom);
        this.following = false;
    }
    focus(s: Stall) { this.focusSlot = this.slot(s); this.following = false; }
    private clampCamera() { if (!this.layout || this.full || this.focusSlot && document.querySelector('.stall-overlay'))
        return; const clamp = (v: number, size: number, view: number) => view >= size ? size / 2 : Math.max(view / 2, Math.min(size - view / 2, v)); this.cx = clamp(this.cx, this.layout.size[0], innerWidth / this.zoom); this.cy = clamp(this.cy, this.layout.size[1], innerHeight / this.zoom); }
    async cycleSeason() { const season = SEASONS[(SEASONS.indexOf(this.season) + 1) % 4]; try {
        const im = await this.image(`map/hk/ground_${season}.webp`);
        this.images.delete(`map/hk/ground_${this.season}.webp`);
        this.setGround(im);
        this.season = season;
    }
    catch (e) {
        console.error(e);
    } }
    cycleTime() { this.time = TIMES[(TIMES.indexOf(this.time) + 1) % 3]; this.tintGlow(); }
    private tintGlow() { if (!this.glow)
        return; this.warm.width = this.glow.width; this.warm.height = this.glow.height; const c = this.warm.getContext('2d')!; c.drawImage(this.glow, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = this.time === 'night' ? 'rgb(224,194,128)' : 'rgb(133,117,77)'; c.fillRect(0, 0, this.warm.width, this.warm.height); }
    private walkable(x: number, y: number) { const m = this.layout!.mask; return m.rows[Math.round((y - m.lo) / m.step)]?.[Math.round((x - m.lo) / m.step)] === '1'; }
    private closest(x: number, y: number): Point { const m = this.layout!.mask; let best = Infinity, p = { x, y }; for (let j = 0; j < m.rows.length; j++)
        for (let i = 0; i < m.rows[j].length; i++)
            if (m.rows[j][i] === '1') {
                const gx = m.lo + i * m.step, gy = m.lo + j * m.step, d = (gx - x) ** 2 + (gy - y) ** 2;
                if (d < best) {
                    best = d;
                    p = { x: gx, y: gy };
                }
            } return p; }
    // Breadth-first search on the exported half-grid prevents click routes cutting through stalls.
    private route(dest: Point) {
        const m = this.layout!.mask, w = m.rows[0].length, h = m.rows.length, target = this.closest(dest.x, dest.y), start = this.closest(this.gx, this.gy);
        const index = (p: Point) => Math.round((p.y - m.lo) / m.step) * w + Math.round((p.x - m.lo) / m.step);
        const from = index(start), to = index(target), prev = new Int32Array(w * h).fill(-1), queue = new Int32Array(w * h);
        let head = 0, tail = 1;
        queue[0] = from;
        prev[from] = from;
        while (head < tail && prev[to] === -1) {
            const n = queue[head++], x = n % w, y = Math.floor(n / w);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy, k = ny * w + nx;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h && prev[k] === -1 && m.rows[ny][nx] === '1') {
                    prev[k] = n;
                    queue[tail++] = k;
                }
            }
        }
        this.path.length = 0;
        if (prev[to] === -1)
            return;
        for (let n = to; n !== from; n = prev[n])
            this.path.push({ x: m.lo + n % w * m.step, y: m.lo + Math.floor(n / w) * m.step });
        this.path.reverse();
        const raw = this.path.slice();
        this.path.length = 0;
        let anchor = { x: this.gx, y: this.gy }, i = 0;
        while (i < raw.length) {
            let far = i;
            for (let j = i; j < raw.length; j++) {
                if (!this.lineClear(anchor, raw[j])) break;
                far = j;
            }
            this.path.push(raw[far]); anchor = raw[far]; i = far + 1;
        }
        this.full = false;
        this.following = true;
    }
    private lineClear(a: Point, b: Point) {
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (this.layout!.mask.step / 4)));
        for (let i = 0; i <= steps; i++) {
            const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
            // Check the footprint as well, so diagonal shortcuts cannot clip a blocked corner.
            for (const [dx, dy] of [[0, 0], [.12, .12], [-.12, .12], [.12, -.12], [-.12, -.12]])
                if (!this.walkable(x + dx, y + dy)) return false;
        }
        return true;
    }
    private slot(s: Stall) { this.assign(); return this.layout?.slots.find(a => a.stall?.id === s.id); }
    nearest() { const p = this.world(this.gx, this.gy); return this.layout?.slots.find(s => s.stall && Math.hypot(s.fx - p.x, s.fy - p.y) < 42)?.stall; }
    private open(s: Stall) { this.closePreview(); this.seen.add(s.id); write('diy.seen', [...this.seen]); this.path.length = 0; this.auto = null; this.keys.clear(); this.onSeen(); this.onOpen(s); }
    visit(s: Stall, open = false) { this.closePreview(); this.full = false; if (!this.ready) {
        this.pending = { stall: s, open };
        return;
    } this.street = s.street === 'ki-lung' ? 0 : 1; const sl = this.slot(s); if (sl) {
        const p = this.grid(sl.fx, sl.fy), q = this.closest(p.x, p.y);
        this.gx = q.x;
        this.gy = q.y;
        this.following = true;
        this.path.length = 0;
        this.auto = null;
    } this.onStreet(); if (open)
        this.open(s); }
    next() { const ordered = this.current.slice().sort((a, b) => a.slot - b.slot); const s = ordered.find(s => !this.seen.has(s.id)) || ordered[0]; if (s)
        this.go(s); }
    change(delta: number) { this.street = (this.street + delta + 2) % 2; this.onStreet(); const s = this.current.slice().sort((a, b) => a.slot - b.slot)[0]; if (s)
        this.go(s); }
    private go(s: Stall) { this.closePreview(); const sl = this.slot(s); if (!sl)
        return; this.showPreview(sl); this.street = s.street === 'ki-lung' ? 0 : 1; this.onStreet(); this.route(this.grid(sl.fx, sl.fy)); this.auto = this.path.length ? s : null; if (!this.path.length && this.nearest()?.id === s.id)
        this.open(s); }
    setLook(look: Look) { if (ROLES.includes(look.role)) {
        this.look = { role: look.role };
        write('diy.look', this.look);
    } }
    closePreview() {
        this.preview?.box.remove(); this.preview = undefined;
        this.auto = null; this.path.length = 0;
    }
    private spritePath(item: Item) {
        const sl = item as Slot;
        const n = sl.stall ? 'stall_' + ({ scent: 'candle', class: 'workshop' }[sl.stall.category as string] || sl.stall.category)
            : item.n.startsWith('@') ? `tree_${this.season}_${item.n.slice(1)}` : item.n;
        return `map/hk/sprites/${n}.webp`;
    }
    private alphaHit(path: string, p: Point, x: number, y: number, w: number, h: number, flip = false) {
        const m = this.hits.get(path);
        if (!m || p.x < x || p.y < y || p.x >= x + w || p.y >= y + h) return false;
        const mx = Math.min(m.width - 1, Math.floor((flip ? 1 - (p.x - x) / w : (p.x - x) / w) * m.width));
        const my = Math.floor((p.y - y) / h * m.height);
        return m.alpha[(my * m.width + mx) * 4 + 3] > 24;
    }
    private showPreview(slot: Slot) {
        this.closePreview();
        const box = document.createElement('aside'), s = slot.stall;
        box.className = 'stall-preview'; box.setAttribute('aria-label', t('stallPreview')); box.setAttribute('aria-live', 'polite');
        box.innerHTML = `<button class="preview-close" aria-label="${esc(t('close'))}">×</button>${s
            ? `<img src="${esc(photo(s))}" alt="${esc(s.items[0]?.name || s.name)}"><strong>${esc(s.name)}</strong><small>${esc(dict().categories[s.category])}</small><p>${esc(s.sign)}</p>`
            : `<p>${t('vacantStall')}</p><button class="preview-apply">${t('apply')}</button>`}`;
        box.querySelector('.preview-close')!.addEventListener('click', () => this.closePreview());
        box.querySelector('.preview-apply')?.addEventListener('click', () => { this.closePreview(); this.onApply(slot.streetId!); });
        document.body.append(box); this.preview = { slot, box }; this.positionPreview();
    }
    private positionPreview() {
        if (!this.preview) return;
        const { slot, box } = this.preview;
        box.hidden = !this.active;
        const x = (slot.x + slot.w / 2 - this.cx) * this.zoom + innerWidth / 2;
        const y = (slot.y - this.cy) * this.zoom + innerHeight / 2;
        const top = (document.querySelector('#topbar')?.getBoundingClientRect().bottom || 60) + 8;
        const bottom = document.querySelector('#controls')?.getBoundingClientRect().top || innerHeight;
        const left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, x - box.offsetWidth / 2));
        box.style.left = left + 'px';
        box.style.top = Math.max(top, Math.min(bottom - box.offsetHeight - 12, y - box.offsetHeight - 12)) + 'px';
        box.style.setProperty('--tail-x', Math.max(12, Math.min(box.offsetWidth - 12, x - left)) + 'px');
    }
    private click(p: Point) {
        this.assign();
        const targets: { d: number; act: () => void }[] = [];
        for (const a of this.peopleHits) if (this.alphaHit(a.path, p, a.x, a.y, a.w, a.h, a.flip))
            targets.push({ d: a.d, act: () => { this.closePreview(); if (a.hero) this.onLook(); } });
        for (const item of this.staticItems) {
            const path = this.spritePath(item), im = this.images.get(path);
            if (!im) continue;
            const h = item.w * im.height / im.width;
            if (this.alphaHit(path, p, item.x, item.y + item.h - h, item.w, h)) {
                const sl = item as Slot;
                targets.push({ d: item.d, act: () => {
                    if (this.layout!.slots.includes(sl)) {
                        if (sl.stall) this.go(sl.stall);
                        else this.showPreview(sl);
                    } else this.walkTo(p);
                } });
            }
        }
        targets.sort((a, b) => b.d - a.d);
        if (targets.length) targets[0].act(); else this.walkTo(p);
    }
    private walkTo(p: Point) {
        this.closePreview(); this.marker = { ...p, age: 0 }; this.route(this.grid(p.x, p.y));
    }
    private newCast(aisle: number, pick: number): Cast { const plan: Cast['kind'][] = ['jogger', 'stroll', 'dogwalk', 'chat', 'elders', 'cyclist', 'stroll', 'jogger', 'dogwalk', 'chat']; const way = Math.random() < .5 ? -1 : 1; return { kind: aisle >= 0 ? 'stroll' : plan[pick % 10], s: Math.random() * (aisle >= 0 ? 1 : this.trailLength), way, lane: way * (.8 + Math.random() * .6), pick: Math.floor(Math.random() * 6), dog: Math.random() < .5 ? 'park_shiba' : 'park_poodle', age: 0, life: 20 + Math.random() * 20, aisle, distance: 0 }; }
    private trail(s: number, lane: number): Point { s = (s % this.trailLength + this.trailLength) % this.trailLength; let lo = 0, hi = this.lengths.length - 1; while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (this.lengths[mid] <= s)
            lo = mid;
        else
            hi = mid;
    } const a = this.layout!.trail[lo], b = this.layout!.trail[(lo + 1) % this.layout!.trail.length], f = (s - this.lengths[lo]) / (this.lengths[lo + 1] - this.lengths[lo]); return { x: a[0] + (b[0] - a[0]) * f + a[2] * lane, y: a[1] + (b[1] - a[1]) * f + a[3] * lane }; }
    private castPoint(a: Cast, s = a.s, lane = a.lane) { if (a.aisle < 0)
        return this.trail(s, lane); const [x, y, xx, yy] = this.layout!.aisles[a.aisle], len = Math.hypot(xx - x, yy - y); return { x: x + (xx - x) * s - (yy - y) / len * lane, y: y + (yy - y) * s + (xx - x) / len * lane }; }
    private update(dt: number) {
        if (this.marker && (this.marker.age += dt) > 1) this.marker = undefined;
        let vx = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a')), vy = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
        const target = this.path[0];
        if (!vx && !vy && target) {
            vx = target.x - this.gx;
            vy = target.y - this.gy;
        }
        const len = Math.hypot(vx, vy);
        this.walking = false;
        if (len) {
            const step = Math.min(6 * dt, len), x = vx / len * step, y = vy / len * step, old = this.world(this.gx, this.gy), ox = this.gx, oy = this.gy;
            if (this.walkable(this.gx + x, this.gy + y)) {
                this.gx += x;
                this.gy += y;
            }
            else {
                if (this.walkable(this.gx + x, this.gy))
                    this.gx += x;
                if (this.walkable(this.gx, this.gy + y))
                    this.gy += y;
            }
            const p = this.world(this.gx, this.gy);
            this.walking = ox !== this.gx || oy !== this.gy;
            if (this.walking) {
                this.distance += Math.hypot(this.gx - ox, this.gy - oy);
                this.dx = p.x - old.x;
                this.dy = p.y - old.y;
                this.following = true;
            }
            if (target && Math.hypot(target.x - this.gx, target.y - this.gy) < .02)
                this.path.shift();
        }
        if (!this.path.length && this.auto) {
            const s = this.auto;
            this.auto = null;
            if (this.nearest()?.id === s.id)
                this.open(s);
        }
        for (let i = 0; i < this.cast.length; i++) {
            const a = this.cast[i];
            a.age += dt;
            if (a.kind === 'chat' && a.age > a.life) {
                a.kind = 'stroll';
                a.distance = 0;
            }
            const speed = a.kind === 'chat' ? 0 : KINDS[a.kind].speed;
            if (a.aisle >= 0) {
                const l = this.layout!.aisles[a.aisle], length = Math.hypot(l[2] - l[0], l[3] - l[1]);
                a.s += a.way * speed * dt / length;
                if (a.s < 0 || a.s > 1) {
                    a.s = Math.max(0, Math.min(1, a.s));
                    a.way *= -1;
                }
            }
            else {
                a.s += a.way * speed * dt;
                let lane = a.way * (a.kind === 'cyclist' ? .28 : 1.1);
                for (const b of this.cast) {
                    if (b === a || b.aisle >= 0 || b.way !== a.way || b.kind === 'chat')
                        continue;
                    const gap = ((b.s - a.s) * a.way + this.trailLength) % this.trailLength;
                    if (gap > 0 && gap < 5 && speed > KINDS[b.kind].speed)
                        lane = -a.way * 1.3;
                }
                a.lane += (lane - a.lane) * Math.min(1, dt * 3);
            }
            a.distance += speed * dt;
            const p = this.castPoint(a), w = this.world(p.x, p.y);
            if (a.aisle < 0 && a.age > Math.max(45, a.life + 12) && !this.visible(w.x - 60, w.y - 60, 120, 120))
                this.cast[i] = this.newCast(-1, Math.floor(Math.random() * 10));
        }
    }
    private visible(x: number, y: number, w: number, h: number) { return x + w > this.cx - innerWidth / this.zoom / 2 && x < this.cx + innerWidth / this.zoom / 2 && y + h > this.cy - innerHeight / this.zoom / 2 && y < this.cy + innerHeight / this.zoom / 2; }
    private person(name: string, p: Point, dx: number, dy: number, distance: number, cycle: number, right: boolean, height = 44, still = false, hero = false) { const facing = dy > 0 ? 'se' : 'ne'; let f = still ? 'b' : 'abcb'[Math.floor(distance / cycle * 4) % 4]; if (name === 'park_dogwalker' && facing === 'se' && f === 'c')
        f = 'a'; const path = `art/${name}_${facing}_${f}.webp`, im = this.images.get(path); if (!im)
        return; const width = im.width * height / im.height, flip = (dx > 0) !== (facing === 'se' ? right : true), head = this.heads.get(path)! * height / im.height, x = p.x - (flip ? width - head : head), y = p.y - height + 1; if (!this.visible(x, y, width, height))
        return; this.peopleHits.push({ path, x, y, w: width, h: height, flip, d: p.y, hero }); this.queue.push({ d: p.y, paint: () => { const c = this.ctx; c.fillStyle = 'rgba(60,45,35,.20)'; c.beginPath(); c.ellipse(p.x, p.y - 2, height * .24, height * .075, 0, 0, Math.PI * 2); c.fill(); c.save(); c.translate(x + (flip ? width : 0), y); c.scale(flip ? -1 : 1, 1); c.drawImage(im, 0, 0, width, height); c.restore(); } }); }
    private drawCast(a: Cast) {
        const p = this.castPoint(a), w = this.world(p.x, p.y);
        if (a.kind === 'chat') {
            const im = this.images.get(`art/park_chat${a.pick % 3}_${1 + Math.floor(a.age / 2.4) % 2}.webp`)!;
            const width = im.width * 44 / im.height;
            const path = `art/park_chat${a.pick % 3}_${1 + Math.floor(a.age / 2.4) % 2}.webp`;
            this.peopleHits.push({ path, x: w.x - width / 2, y: w.y - 43, w: width, h: 44, flip: false, d: w.y, hero: false });
            if (this.visible(w.x - width / 2, w.y - 44, width, 44))
                this.queue.push({ d: w.y, paint: () => { this.ctx.fillStyle = 'rgba(60,45,35,.2)'; this.ctx.beginPath(); this.ctx.ellipse(w.x, w.y - 2, width * .4, 3, 0, 0, 7); this.ctx.fill(); this.ctx.drawImage(im, w.x - width / 2, w.y - 43, width, 44); } });
            return;
        }
        const k = KINDS[a.kind], q = this.castPoint(a, a.s + a.way * (a.aisle >= 0 ? .001 : 1)), v = this.world(q.x, q.y), dx = v.x - w.x, dy = v.y - w.y;
        if (a.kind === 'elders') {
            for (const [i, off] of [-.55, .55].entries()) {
                const p = this.castPoint(a, a.s + off * .2, a.lane + off);
                this.person(k.names[i], this.world(p.x, p.y), dx, dy, a.distance, k.cycle, k.right);
            }
            return;
        }
        this.person(k.names[a.pick % k.names.length], w, dx, dy, a.distance, k.cycle, k.right);
        if (a.kind === 'dogwalk') {
            const p = this.castPoint(a, a.s + a.way * (1.9 + .25 * Math.sin(a.s * 1.3)), a.lane + .5 * Math.sin(a.s * .7)), dog = this.world(p.x, p.y);
            this.person(a.dog, dog, dx, dy, a.distance, .7, false, 20);
            if (this.visible(w.x - 90, w.y - 70, 180, 140))
                this.queue.push({ d: Math.max(w.y, dog.y) + .1, paint: () => { const c = this.ctx, hx = w.x + Math.sign(dx) * 10, hy = w.y - 16; c.strokeStyle = '#462d23'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo((hx + dog.x) / 2, (hy + dog.y - 13) / 2 + 10, dog.x, dog.y - 13); c.stroke(); } });
        }
    }
    private frame(now: number) { const dt = Math.min((now - this.last) / 1000, .05) || 0; this.last = now; requestAnimationFrame(n => this.frame(n)); if (this.available())
        this.update(dt); this.draw(); }
    private draw() {
        const c = this.ctx, dpr = Math.min(devicePixelRatio || 1, 2);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.imageSmoothingEnabled = true;
        c.fillStyle = this.outside || this.layout?.fill[this.season] || '#e8dfce';
        c.fillRect(0, 0, innerWidth, innerHeight);
        if (!this.ready) {
            c.fillStyle = '#433b32';
            c.font = '16px sans-serif';
            c.textAlign = 'center';
            c.fillText(this.failed ? t('mapError') : `${t('loading')} ${Math.floor(this.progress / this.total * 100)}%`, innerWidth / 2, innerHeight / 2);
            return;
        }
        this.assign();
        const l = this.layout!, p = this.world(this.gx, this.gy);
        if (this.following) {
            this.cx = p.x;
            this.cy = p.y;
        }
        if (this.focusSlot) {
            const dialog = document.querySelector<HTMLElement>('.stall-overlay .dialog');
            if (dialog) {
                const sl = this.focusSlot, r = dialog.getBoundingClientRect();
                const mobile = innerWidth <= 699;
                const top = document.querySelector('#topbar')?.getBoundingClientRect().bottom || 60;
                const targetX = mobile ? innerWidth / 2 : r.left / 2;
                const targetY = mobile ? top + (r.top - top) / 2 : innerHeight / 2;
                this.cx = sl.x + sl.w / 2 - (targetX - innerWidth / 2) / this.zoom;
                this.cy = sl.y + sl.h / 2 - (targetY - innerHeight / 2) / this.zoom;
            } else { this.focusSlot = undefined; this.following = true; }
        }
        this.clampCamera();
        this.positionPreview();
        c.save();
        c.translate(innerWidth / 2, innerHeight / 2);
        c.scale(this.zoom, this.zoom);
        c.translate(-this.cx, -this.cy);
        c.drawImage(this.ground!, 0, 0, ...l.size as [
            number,
            number
        ]);
        this.queue.length = 0;
        this.peopleHits.length = 0;
        for (const item of this.staticItems) {
            if (!this.visible(item.x, item.y, item.w, item.h))
                continue;
            const im = this.images.get(this.spritePath(item));
            if (im)
                this.queue.push({ d: item.d, paint: () => { const h = item.w * im.height / im.width; c.drawImage(im, item.x, item.y + item.h - h, item.w, h); } });
        }
        for (const a of this.cast)
            this.drawCast(a);
        this.person('walk2_' + this.look.role, p, this.dx, this.dy, this.distance, 1, false, 44, !this.walking, true);
        this.queue.sort((a, b) => a.d - b.d);
        for (const a of this.queue)
            a.paint();
        this.strings(false);
        c.restore();
        if (this.time !== 'day') {
            const g = this.grade.getContext('2d')!, sx = this.grade.width / innerWidth, sy = this.grade.height / innerHeight;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-over';
            g.fillStyle = this.time === 'night' ? 'rgb(69,77,122)' : 'rgb(153,117,120)';
            g.fillRect(0, 0, this.grade.width, this.grade.height);
            g.globalCompositeOperation = 'lighter';
            g.setTransform(sx * this.zoom, 0, 0, sy * this.zoom, (innerWidth / 2 - this.cx * this.zoom) * sx, (innerHeight / 2 - this.cy * this.zoom) * sy);
            g.drawImage(this.warm, 0, 0, ...l.size as [
                number,
                number
            ]);
            g.drawImage(this.warm, 0, 0, ...l.size as [
                number,
                number
            ]);
            for (const sl of l.slots) {
                const path = this.spritePath(sl), light = this.lights.get(path), im = this.images.get(path);
                if (!light || !im) continue;
                const h = sl.w * im.height / im.width, y = sl.y + sl.h - h;
                if (!this.visible(sl.x, y, sl.w, h)) continue;
                g.globalAlpha = (sl.stall || sl.kind !== 'empty' && sl.n !== 'stall_empty') ? 1 : .12;
                if (this.time === 'dusk') g.globalAlpha *= .59;
                g.drawImage(light, sl.x, y, sl.w, h);
            }
            g.globalAlpha = 1;
            c.globalCompositeOperation = 'multiply';
            c.drawImage(this.grade, 0, 0, innerWidth, innerHeight);
            c.globalCompositeOperation = 'source-over';
        }
        c.save();
        c.translate(innerWidth / 2, innerHeight / 2);
        c.scale(this.zoom, this.zoom);
        c.translate(-this.cx, -this.cy);
        this.strings(true);
        if (this.marker) {
            c.strokeStyle = `rgba(81,66,56,${1 - this.marker.age})`; c.lineWidth = 2 / this.zoom;
            c.beginPath(); c.ellipse(this.marker.x, this.marker.y, (8 + 15 * this.marker.age) / this.zoom, (4 + 7 * this.marker.age) / this.zoom, 0, 0, Math.PI * 2); c.stroke();
        }
        c.restore();
        this.drawLabels(p);
    }
    private drawLabels(player: Point) {
        const c = this.ctx, slots = this.layout!.slots.filter(s => s.stall).sort((a, b) => Math.hypot(a.fx - player.x, a.fy - player.y) - Math.hypot(b.fx - player.x, b.fy - player.y));
        const selected = new Set(this.zoom < .6 ? [] : slots.slice(0, 3));
        if (this.zoom >= .6 && this.preview?.slot.stall) selected.add(this.preview.slot);
        const occupied: { x: number; y: number; w: number; h: number }[] = [];
        c.font = `12px ${getComputedStyle(document.body).fontFamily}`; c.textAlign = 'center';
        for (const sl of slots) {
            const x = (sl.x + sl.w / 2 - this.cx) * this.zoom + innerWidth / 2, roof = (sl.y - this.cy) * this.zoom + innerHeight / 2;
            const w = c.measureText(sl.stall!.name).width + 16, y = roof - 30;
            const rect = { x: x - w / 2, y, w, h: 24 };
            const overlap = occupied.some(r => rect.x < r.x + r.w && rect.x + w > r.x && y < r.y + r.h && y + 24 > r.y);
            const show = selected.has(sl) && !overlap;
            if (show) occupied.push(rect);
            const old = this.labelAlpha.get(sl) || 0, step = (performance.now() - this.labelTime) / 150;
            const alpha = this.zoom < .6 ? 0 : Math.max(0, Math.min(1, old + (show ? step : -step)));
            this.labelAlpha.set(sl, alpha);
            if (!alpha || overlap) continue;
            c.save(); c.globalAlpha = alpha; c.strokeStyle = '#514238'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(x, y + 24); c.lineTo(x, roof); c.stroke();
            c.fillStyle = '#fff8e9'; c.beginPath(); c.roundRect(rect.x, y, w, 24, 3); c.fill(); c.stroke();
            c.fillStyle = '#514238'; c.fillText(sl.stall!.name, x, y + 16); c.restore();
        }
        this.labelTime = performance.now();
    }
    private labelTime = performance.now();
    private strings(bulbs: boolean) { const c = this.ctx; for (const line of this.layout!.strings) {
        if (!bulbs) {
            c.strokeStyle = '#62513e';
            c.lineWidth = .8;
            c.beginPath();
            line.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
            c.stroke();
        }
        else
            for (const [x, y] of line.slice(2, -1).filter((_, i) => i % 3 === 0)) {
                c.fillStyle = this.time === 'day' ? '#f6dd87' : '#ffed9b';
                c.shadowColor = '#ffd170';
                c.shadowBlur = this.time === 'day' ? 0 : 7;
                c.beginPath();
                c.arc(x, y + 2, 2, 0, 7);
                c.fill();
            }
        c.shadowBlur = 0;
    } }
}
