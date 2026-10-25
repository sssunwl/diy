export async function logVisit(db: D1Database, request: Request, email: string, path: string) {
    if (request.method !== 'GET' || request.headers.get('Sec-Fetch-Dest') !== 'document')
        return;
    try {
        await db.prepare('INSERT INTO visits (at,email,path,country) VALUES (?,?,?,?)').bind(new Date().toISOString(), email, path.slice(0, 300), request.cf?.country || '').run();
        if (Math.random() < .02)
            await db.prepare('DELETE FROM visits WHERE at < ?').bind(new Date(Date.now() - 365 * 864e5).toISOString()).run();
    }
    catch { /* 紀錄失敗不影響後台 */ }
}
