// Injected only when explicitly opened from the popup.
(function () {
    if (globalThis.tentenIpWidgetInjected || !document.body) return;
    globalThis.tentenIpWidgetInjected = true;
    const host = document.createElement('div');
    host.id = 'tenten-ip-widget';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
        :host { all: initial; position: fixed; bottom: 18px; right: 18px; z-index: 2147483647; }
        .widget { width: 235px; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px #0002; color: #333; font: 12px/1.5 system-ui; overflow: hidden; }
        header { background: #667eea; padding: 8px; color: white; display: flex; gap: 6px; align-items: center; }
        header span { flex: 1; } button { cursor: pointer; } main { padding: 10px; } .value { overflow-wrap: anywhere; }
    </style><div class="widget"><header><span>IP & Server</span><button id="refresh" title="Làm mới">↻</button><button id="close" title="Đóng">×</button></header>
        <main><div>IP: <span id="ip" class="value">...</span></div><div>Quốc gia: <span id="country">...</span></div><div>Server: <span id="server" class="value">...</span></div><div id="error"></div></main></div>`;
    document.body.append(host);
    const el = id => shadow.getElementById(id);
    let closed = false;
    let loading = false;
    let headController;
    let generation = 0;
    function close() {
        closed = true;
        generation++;
        headController?.abort();
        host.remove();
        window.removeEventListener('pagehide', close);
        globalThis.tentenIpWidgetInjected = false;
    }
    el('close').addEventListener('click', close);
    window.addEventListener('pagehide', close, { once: true });
    el('refresh').addEventListener('click', () => update(true));
    async function serverInfo() {
        headController = new AbortController();
        const timer = setTimeout(() => headController.abort(), 8000);
        try {
            const response = await fetch(location.origin, { method: 'HEAD', signal: headController.signal });
            return response.headers.get('Server') || 'Không công khai';
        } catch (_) { return 'Không đọc được'; }
        finally { clearTimeout(timer); }
    }
    async function update(refresh = false) {
        if (loading || closed) return;
        loading = true;
        const id = ++generation;
        el('refresh').disabled = true;
        el('error').textContent = '';
        try {
            const [info, server] = await Promise.all([
                chrome.runtime.sendMessage({ action: 'widgetIpInfo', host: location.hostname, refresh }), serverInfo()
            ]);
            if (closed || generation !== id) return;
            if (!info?.success) throw new Error(info?.error || 'Không nhận được kết quả');
            el('ip').textContent = info.data.ip || 'Không tìm thấy';
            el('country').textContent = info.data.country || 'Không xác định';
            el('server').textContent = server;
        } catch (error) {
            if (!closed && generation === id) el('error').textContent = error.message;
        } finally {
            loading = false;
            if (!closed) el('refresh').disabled = false;
        }
    }
    void update();
})();
