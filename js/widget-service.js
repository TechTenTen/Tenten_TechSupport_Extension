// Fixed API endpoints, bounded cache, and coalesced requests for repeated domains.
const widgetCache = new Map();
const widgetPending = new Map();
async function widgetIpInfo(host, refresh = false) {
    if (typeof host !== 'string' || !DnsConfig.hostname(host) || !host.includes('.')) throw new Error('Hostname không hợp lệ');
    host = host.toLowerCase();
    const cached = widgetCache.get(host);
    if (!refresh && cached && cached.expires > Date.now()) return cached.data;
    if (widgetPending.has(host)) return widgetPending.get(host);
    const task = (async () => {
        const response = await boundedFetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
        if (!response.ok) throw new Error(`DNS HTTP ${response.status}`);
        const dns = await response.json();
        const ip = dns.Answer?.find(record => record.type === 1)?.data || null;
        let country = null;
        if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            try {
                const geoResponse = await boundedFetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
                if (geoResponse.ok) {
                    const geo = await geoResponse.json();
                    country = geo.country_name || geo.country_code || null;
                }
            } catch (_) { /* IP lookup is still useful when geolocation is unavailable. */ }
        }
        const data = { ip, country };
        if (widgetCache.size >= 100) widgetCache.delete(widgetCache.keys().next().value);
        widgetCache.set(host, { data, expires: Date.now() + 300000 });
        return data;
    })();
    widgetPending.set(host, task);
    try { return await task; } finally { widgetPending.delete(host); }
}
