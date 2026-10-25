import demo from '../data/demo/hk.json';
import type { Stall } from './types';
export const API_BASE = (import.meta.env.VITE_API_BASE || 'https://diy.sssuni.com').replace(/\/$/, '');
export async function getStalls(): Promise<Stall[]> {
    let real: Stall[] = [];
    try {
        const r = await fetch(`${API_BASE}/api/stalls?region=hk`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok)
            throw Error();
        const d = await r.json();
        if (!Array.isArray(d.stalls))
            throw Error();
        real = d.stalls;
    }
    catch {
        return demo as Stall[];
    }
    if (real.length >= 10)
        return real;
    return [...real, ...(demo as Stall[]).filter(d => !real.some(r => r.street === d.street && r.slot === d.slot))];
}
