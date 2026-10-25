import type { Stall } from '../../src/types.ts';
export function allocateSlot(street: string, occupied: Pick<Stall, 'street' | 'slot'>[]): {
    street: string;
    slot: number;
} | null {
    const streets = ['ki-lung', 'yu-chau'];
    const start = streets.indexOf(street);
    if (start < 0)
        return null;
    for (let i = 0; i < streets.length; i++) {
        const s = streets[(start + i) % streets.length];
        for (let slot = 0; slot < 12; slot++)
            if (!occupied.some(o => o.street === s && o.slot === slot))
                return { street: s, slot };
    }
    return null;
}
