export function webpSize(a: Uint8Array): [
    number,
    number
] | null {
    const text = (n: number, l: number) => String.fromCharCode(...a.slice(n, n + l));
    if (a.length < 30 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP')
        return null;
    const v = new DataView(a.buffer, a.byteOffset, a.byteLength);
    if (v.getUint32(4, true) + 8 !== a.length)
        return null;
    let size: [
        number,
        number
    ] | null = null, image = false;
    for (let p = 12; p + 8 <= a.length;) {
        const kind = text(p, 4), len = v.getUint32(p + 4, true), s = p + 8;
        if (s + len > a.length)
            return null;
        if (kind === 'VP8X' && len >= 10) {
            if (a[s] & 2)
                return null;
            size = [1 + a[s + 4] + (a[s + 5] << 8) + (a[s + 6] << 16), 1 + a[s + 7] + (a[s + 8] << 8) + (a[s + 9] << 16)];
        }
        if (kind === 'VP8 ' && len >= 10 && text(s + 3, 3) === '\x9d\x01\x2a') {
            const d: [
                number,
                number
            ] = [v.getUint16(s + 6, true) & 16383, v.getUint16(s + 8, true) & 16383];
            if (size && (size[0] !== d[0] || size[1] !== d[1]))
                return null;
            size = d;
            image = true;
        }
        if (kind === 'VP8L' && len >= 5 && a[s] === 47) {
            const bits = v.getUint32(s + 1, true);
            const d: [
                number,
                number
            ] = [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1];
            if (size && (size[0] !== d[0] || size[1] !== d[1]))
                return null;
            size = d;
            image = true;
        }
        p = s + len + (len % 2);
    }
    return image ? size : null;
}
