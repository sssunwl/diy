import type { Stall } from './types';
import { productPlaceholder } from './pixelkit/market.js';
import { toCanvas } from './pixelkit/core.js';
export function photo(s: Stall, index = 0) { if (s.demo && s.photos.length === 0) {
    const seed = [...s.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return toCanvas(productPlaceholder(s.category, seed)).toDataURL();
} return s.photos[index] || ''; }
