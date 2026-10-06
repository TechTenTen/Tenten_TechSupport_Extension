// One runner per document. No observers, polling, or network activity while idle.
(function () {
    'use strict';
    if (globalThis.tentenDnsRunner) return;
    const state = { revision: 0, jobId: null, running: false, completed: 0, total: 0, percent: 0, message: 'Sẵn sàng', logs: [] };
    let controller = null;
    let stopped = false;
    function snapshot() { return { ...state, logs: state.logs.slice() }; }
    function notify(action, extra = {}) {
        try { chrome.runtime.sendMessage({ action, jobId: state.jobId, revision: state.revision, ...extra }, () => { void chrome.runtime.lastError; }); } catch (_) { /* Popup can be closed. */ }
    }
    function log(message, type = 'info') {
        state.revision++;
        state.logs.push({ message, type });
        if (state.logs.length > 100) state.logs.shift();
        notify('addLog', { message, type });
    }
    function progress(message) {
        state.revision++;
        state.message = message;
        state.percent = Math.round(state.completed / state.total * 100) || 0;
        notify('updateProgress', { percent: state.percent, message });
    }
    async function run(records) {
        try {
            for (const record of records) {
                if (stopped) throw new Error('Đã yêu cầu dừng');
                const token = document.querySelector("input[name='dev_token_csrf']")?.value;
                if (!token) throw new Error('Không tìm thấy CSRF token. Mở DNS Settings và đăng nhập lại.');
                progress(`Đang thêm ${record.type} ${record.name} (${state.completed + 1}/${state.total})`);
                controller = new AbortController();
                const timer = setTimeout(() => controller?.abort(), 15000);
                try {
                    const response = await fetch('https://domain.tenten.vn/ApiDnsSetting/addDns/', {
                        method: 'POST', credentials: 'same-origin', signal: controller.signal,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                        body: DnsConfig.formData(record, token)
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    if (response.redirected) throw new Error('Phiên đăng nhập có thể đã hết hạn');
                    const data = await response.json();
                    DnsConfig.checkResponse(data);
                    state.completed++;
                    log(`Đã thêm ${record.type} ${record.name} → ${record.value}`, 'success');
                } finally { clearTimeout(timer); controller = null; }
            }
            if (stopped) throw new Error('Đã yêu cầu dừng');
            state.success = true;
            progress(`Hoàn thành ${state.completed}/${state.total} bản ghi. Làm mới DNS Settings để kiểm tra.`);
        } catch (error) {
            state.success = false;
            const detail = error.name === 'AbortError' ? 'Yêu cầu bị hủy hoặc quá 15 giây.' : error.message;
            progress(`${stopped ? 'Đã dừng' : 'Dừng do lỗi'}; đã xác nhận ${state.completed}/${state.total}. ${detail}`);
            log(state.message, 'error');
            log('Yêu cầu đang gửi có thể đã được máy chủ xử lý. Kiểm tra DNS Settings trước khi chạy lại; extension không tự thử lại.', 'warning');
        } finally {
            state.revision++;
            state.running = false;
            state.stopped = stopped;
            notify('automationComplete', { success: state.success, stopped, state: snapshot() });
        }
    }
    globalThis.tentenDnsRunner = { snapshot };
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id) return false;
        if (message.action === 'ping') { sendResponse({ status: 'ready' }); return false; }
        if (message.action === 'getAutomationState') { sendResponse(snapshot()); return false; }
        if (message.action === 'stopAutomation') {
            if (state.running && (!message.jobId || message.jobId === state.jobId)) { stopped = true; controller?.abort(); }
            sendResponse(snapshot()); return false;
        }
        if (message.action !== 'importDnsRecords') return false;
        try {
            if (state.running) throw new Error('Đã có một tác vụ đang chạy trên tab này');
            if (location.origin !== 'https://domain.tenten.vn') throw new Error('Sai trang DNS TENTEN');
            const records = DnsConfig.validateRecords(message.records);
            if (!document.querySelector("input[name='dev_token_csrf']")?.value) throw new Error('Mở trang DNS Settings của tên miền cần cấu hình trước');
            if (typeof message.jobId !== 'string' || message.jobId.length > 100) throw new Error('Mã tác vụ không hợp lệ');
            Object.assign(state, { revision: 0, jobId: message.jobId, running: true, completed: 0, total: records.length, percent: 0, message: 'Bắt đầu import', logs: [], success: false, stopped: false });
            stopped = false;
            sendResponse({ accepted: true, state: snapshot() });
            void run(records);
        } catch (error) { sendResponse({ accepted: false, error: error.message, state: snapshot() }); }
        return false;
    });
})();
