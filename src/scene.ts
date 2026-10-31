import type { Stall } from './types';
import { read, write, t } from './ui';
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
    private heads = new Map<string, number>();
    private ground?: HTMLImageElement;
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
    private zoom = 1;
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
            if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7)
                this.moved = true;
            if (this.moved) {
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
    private resize() { const dpr = Math.min(devicePixelRatio || 1, 2); this.canvas.width = Math.round(innerWidth * dpr); this.canvas.height = Math.round(innerHeight * dpr); this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px'; this.grade.width = Math.max(1, Math.ceil(innerWidth / 4)); this.grade.height = Math.max(1, Math.ceil(innerHeight / 4)); this.clampCamera(); }
    private async image(path: string, head = false) { const im = new Image(); await new Promise((ok, fail) => { im.onload = ok; im.onerror = () => fail(Error(path)); im.src = import.meta.env.BASE_URL + path; }); this.images.set(path, im); if (head) {
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
            await Promise.all([...paths.map(p => this.image(p.path, p.head)), this.image(`map/hk/ground_${this.season}.webp`).then(im => this.ground = im), this.image('map/hk/glow.webp').then(im => this.glow = im)]);
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
    private setZoom(z: number, anchor: Point) { const before = this.point(anchor.x, anchor.y); this.zoom = Math.max(.4, Math.min(1.6, z)); const after = this.point(anchor.x, anchor.y); this.cx += before.x - after.x; this.cy += before.y - after.y; this.following = false; this.clampCamera(); }
    fullMap() { if (!this.layout)
        return; this.zoom = Math.min(1.6, Math.min(innerWidth / this.layout.size[0], (innerHeight - 150) / this.layout.size[1])); this.cx = this.layout.size[0] / 2; this.cy = this.layout.size[1] / 2; this.following = false; this.clampCamera(); }
    private clampCamera() { if (!this.layout)
        return; const clamp = (v: number, size: number, view: number) => view >= size ? size / 2 : Math.max(view / 2, Math.min(size - view / 2, v)); this.cx = clamp(this.cx, this.layout.size[0], innerWidth / this.zoom); this.cy = clamp(this.cy, this.layout.size[1], innerHeight / this.zoom); }
    async cycleSeason() { const season = SEASONS[(SEASONS.indexOf(this.season) + 1) % 4]; try {
        const im = await this.image(`map/hk/ground_${season}.webp`);
        this.images.delete(`map/hk/ground_${this.season}.webp`);
        this.ground = im;
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
        this.following = true;
    }
    private slot(s: Stall) { this.assign(); return this.layout?.slots.find(a => a.stall?.id === s.id); }
    nearest() { const p = this.world(this.gx, this.gy); return this.layout?.slots.find(s => s.stall && Math.hypot(s.fx - p.x, s.fy - p.y) < 42)?.stall; }
    private open(s: Stall) { this.seen.add(s.id); write('diy.seen', [...this.seen]); this.path.length = 0; this.auto = null; this.keys.clear(); this.onSeen(); this.onOpen(s); }
    visit(s: Stall, open = false) { if (!this.ready) {
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
    private go(s: Stall) { const sl = this.slot(s); if (!sl)
        return; this.street = s.street === 'ki-lung' ? 0 : 1; this.onStreet(); this.route(this.grid(sl.fx, sl.fy)); this.auto = this.path.length ? s : null; if (!this.path.length && this.nearest()?.id === s.id)
        this.open(s); }
    setLook(look: Look) { if (ROLES.includes(look.role)) {
        this.look = { role: look.role };
        write('diy.look', this.look);
    } }
    private click(p: Point) { const hero = this.world(this.gx, this.gy); if (Math.abs(p.x - hero.x) < 18 && p.y < hero.y && p.y > hero.y - 44) {
        this.onLook();
        return;
    } this.assign(); const slots = this.layout!.slots; for (let i = slots.length - 1; i >= 0; i--) {
        const s = slots[i];
        if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
            if (s.stall)
                this.go(s.stall);
            else
                this.onApply(s.streetId!);
            return;
        }
    } this.auto = null; this.route(this.grid(p.x, p.y)); }
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
    private person(name: string, p: Point, dx: number, dy: number, distance: number, cycle: number, right: boolean, height = 44, still = false) { const facing = dy > 0 ? 'se' : 'ne'; let f = still ? 'b' : 'abcb'[Math.floor(distance / cycle * 4) % 4]; if (name === 'park_dogwalker' && facing === 'se' && f === 'c')
        f = 'a'; const path = `art/${name}_${facing}_${f}.webp`, im = this.images.get(path); if (!im)
        return; const width = im.width * height / im.height, flip = (dx > 0) !== (facing === 'se' ? right : true), head = this.heads.get(path)! * height / im.height, x = p.x - (flip ? width - head : head), y = p.y - height + 1; if (!this.visible(x, y, width, height))
        return; this.queue.push({ d: p.y, paint: () => { const c = this.ctx; c.fillStyle = 'rgba(60,45,35,.20)'; c.beginPath(); c.ellipse(p.x, p.y - 2, height * .24, height * .075, 0, 0, Math.PI * 2); c.fill(); c.save(); c.translate(x + (flip ? width : 0), y); c.scale(flip ? -1 : 1, 1); c.drawImage(im, 0, 0, width, height); c.restore(); } }); }
    private drawCast(a: Cast) {
        const p = this.castPoint(a), w = this.world(p.x, p.y);
        if (a.kind === 'chat') {
            const im = this.images.get(`art/park_chat${a.pick % 3}_${1 + Math.floor(a.age / 2.4) % 2}.webp`)!;
            const width = im.width * 44 / im.height;
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
        c.fillStyle = this.layout?.fill[this.season] || '#e8dfce';
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
        this.clampCamera();
        c.save();
        c.translate(innerWidth / 2, innerHeight / 2);
        c.scale(this.zoom, this.zoom);
        c.translate(-this.cx, -this.cy);
        c.drawImage(this.ground!, 0, 0, ...l.size as [
            number,
            number
        ]);
        this.queue.length = 0;
        for (const item of this.staticItems) {
            if (!this.visible(item.x, item.y, item.w, item.h))
                continue;
            const sl = item as Slot, n = sl.stall ? 'stall_' + ({ scent: 'candle', class: 'workshop' }[sl.stall.category as string] || sl.stall.category) : item.n.startsWith('@') ? `tree_${this.season}_${item.n.slice(1)}` : item.n;
            const im = this.images.get(`map/hk/sprites/${n}.webp`);
            if (im)
                this.queue.push({ d: item.d, paint: () => { const h = item.w * im.height / im.width; c.drawImage(im, item.x, item.y + item.h - h, item.w, h); } });
        }
        for (const a of this.cast)
            this.drawCast(a);
        this.person('walk2_' + this.look.role, p, this.dx, this.dy, this.distance, 1, false, 44, !this.walking);
        this.queue.sort((a, b) => a.d - b.d);
        for (const a of this.queue)
            a.paint();
        this.strings(false);
        c.restore();
        if (this.time !== 'day') {
            const g = this.grade.getContext('2d')!, sx = this.grade.width / innerWidth, sy = this.grade.height / innerHeight;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-over';
            g.fillStyle = this.time === 'night' ? 'rgb(48,59,107)' : 'rgb(153,117,120)';
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
            c.globalCompositeOperation = 'multiply';
            c.drawImage(this.grade, 0, 0, innerWidth, innerHeight);
            c.globalCompositeOperation = 'source-over';
        }
        c.save();
        c.translate(innerWidth / 2, innerHeight / 2);
        c.scale(this.zoom, this.zoom);
        c.translate(-this.cx, -this.cy);
        this.strings(true);
        for (const sl of l.slots)
            if (sl.stall && Math.hypot(sl.fx - p.x, sl.fy - p.y) < 190) {
                c.font = `${12 / this.zoom}px sans-serif`;
                c.textAlign = 'center';
                const text = sl.stall.name, w = c.measureText(text).width + 14 / this.zoom, x = sl.x + sl.w / 2, y = sl.y - 12 / this.zoom;
                c.fillStyle = '#fff6df';
                c.fillRect(x - w / 2, y - 13 / this.zoom, w, 20 / this.zoom);
                c.fillStyle = '#433b32';
                c.fillText(text, x, y + 2 / this.zoom);
            }
        c.restore();
    }
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
