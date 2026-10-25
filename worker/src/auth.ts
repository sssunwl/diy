export interface AccessEnv {
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    ADMIN_EMAIL?: string;
}
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function verifyJWT(token: string, aud: string, email: string, keys: JsonWebKey[], issuer?: string): Promise<boolean> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3 || !aud || !email)
            return false;
        const head = JSON.parse(new TextDecoder().decode(decode(parts[0]))), p = JSON.parse(new TextDecoder().decode(decode(parts[1])));
        if (head.alg !== 'RS256' || !head.kid || typeof p.exp !== 'number' || p.exp <= Date.now() / 1000 || (typeof p.nbf === 'number' && p.nbf > Date.now() / 1000) || p.email !== email || !(Array.isArray(p.aud) ? p.aud : [p.aud]).includes(aud) || (issuer && p.iss !== issuer))
            return false;
        const jwk = keys.find(k => (k as JsonWebKey & {
            kid?: string;
        }).kid === head.kid);
        if (!jwk)
            return false;
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    }
    catch {
        return false;
    }
}
let cached: {
    domain: string;
    until: number;
    keys: JsonWebKey[];
} | undefined;
export async function adminEmail(request: Request, env: AccessEnv): Promise<string | null> {
    const host = new URL(request.url).hostname;
    if (!env.ACCESS_AUD && ['localhost', '127.0.0.1'].includes(host))
        return env.ADMIN_EMAIL || '本機站長';
    if (!env.ADMIN_EMAIL || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)
        return null;
    try {
        const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//, '').replace(/\/$/, '');
        if (!/^[a-z0-9.-]+$/i.test(domain))
            return null;
        if (!cached || cached.domain !== domain || cached.until < Date.now()) {
            const r = await fetch(`https://${domain}/cdn-cgi/access/certs`);
            if (!r.ok)
                return null;
            const d = await r.json() as {
                keys: JsonWebKey[];
            };
            cached = { domain, until: Date.now() + 3600000, keys: d.keys };
        }
        return await verifyJWT(request.headers.get('Cf-Access-Jwt-Assertion') || '', env.ACCESS_AUD, env.ADMIN_EMAIL, cached.keys, `https://${domain}`) ? env.ADMIN_EMAIL : null;
    }
    catch {
        return null;
    }
}
