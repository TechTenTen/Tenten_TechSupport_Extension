// Shared popup controller for Webcake, Ladipage, and editable DNS imports.
class LadipageHandler {
    constructor(elements) {
        this.elements = elements;
        this.currentTabId = null;
        this.jobId = null;
        this.revision = -1;
        this.busy = false;
        this.savedRecords = DnsConfig.webcake();
        this.profile = document.getElementById('dnsPreset');
        this.editor = document.getElementById('dnsRecordEditor');
        this.ready = this.loadSettings();
        elements.autoLadipage.addEventListener('click', () => this.open('ladipage'));
        document.getElementById('autoWebcake').addEventListener('click', () => this.open('webcake'));
        document.getElementById('customRecords').addEventListener('click', () => this.open('custom'));
        this.profile.addEventListener('change', () => this.setPreset(this.profile.value));
        elements.ladipageDomainInput.addEventListener('change', () => {
            if (this.profile.value.startsWith('ladipage')) this.setPreset(this.profile.value);
        });
        document.getElementById('addDnsRow').addEventListener('click', () => {
            if (this.editor.children.length >= DnsConfig.MAX_RECORDS) return this.addLog('Tối đa 50 bản ghi', 'error');
            this.addRow({ type: 'A', name: '@', value: '' });
        });
        document.getElementById('saveDnsTemplate').addEventListener('click', () => this.saveTemplate());
        document.getElementById('exportDnsTemplate').addEventListener('click', () => this.exportTemplate());
        document.getElementById('importDnsFile').addEventListener('change', event => this.importTemplate(event));
        elements.ladipageSubmitBtn.addEventListener('click', () => this.start());
        elements.ladipageStopBtn.addEventListener('click', () => this.stop());
    }
    async loadSettings() {
        try {
            const { customDnsRecords, dnsImportDomain } = await chrome.storage.local.get(['customDnsRecords', 'dnsImportDomain']);
            if (customDnsRecords) this.savedRecords = DnsConfig.validateRecords(customDnsRecords);
            if (dnsImportDomain) this.elements.ladipageDomainInput.value = dnsImportDomain;
        } catch (error) { this.addLog(`Không đọc được mẫu đã lưu: ${error.message}`, 'warning'); }
        this.setPreset('webcake');
    }
    async open(preset) {
        await this.ready;
        window.uiManager.showRightPanel('🚀 Import bản ghi DNS', 'ladipage');
        if (!this.busy) this.setPreset(preset);
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && new URL(tab.url).origin === 'https://domain.tenten.vn') {
                this.currentTabId = tab.id;
                const state = await this.send({ action: 'getAutomationState' });
                if (state.jobId) this.restore(state);
            }
        } catch (_) { /* A tab opened before reloading the extension may not have the runner yet. */ }
    }
    setPreset(preset) {
        this.profile.value = preset;
        document.getElementById('ladipageDomainSettings').hidden = !preset.startsWith('ladipage');
        let records = preset === 'custom' ? this.savedRecords : DnsConfig.webcake();
        const domain = this.elements.ladipageDomainInput.value.trim().toLowerCase();
        if (preset === 'ladipage') records = [
            { type: 'CNAME', name: 'www', value: 'dns.ladipage.com' },
            { type: 'REDIRECT', name: '@', value: domain ? `http://www.${domain}/` : '' }
        ];
        if (preset === 'ladipage-sub') records = [{ type: 'CNAME', name: domain.split('.')[0] || 'sub', value: 'dns.ladipage.com' }];
        this.render(records);
    }
    render(records) {
        this.editor.replaceChildren();
        records.forEach(record => this.addRow(record));
    }
    addRow(record) {
        const row = document.createElement('div');
        row.className = 'dns-edit-row';
        // Markup is fixed; values from imported files are only assigned as DOM properties.
        row.innerHTML = `<div class="dns-row-top"><select data-field="type" aria-label="Type"></select><input data-field="name" aria-label="Name" placeholder="@ hoặc www"><button type="button" class="remove-record" aria-label="Xóa bản ghi">×</button></div>
            <input data-field="value" aria-label="Value" placeholder="Value">
            <div class="dns-extra-fields"></div>`;
        const type = row.querySelector('select');
        DnsConfig.TYPES.forEach(value => type.add(new Option(value, value)));
        type.value = record.type;
        row.querySelector('[data-field="name"]').value = record.name;
        row.querySelector('[data-field="value"]').value = record.value;
        const extras = () => {
            const container = row.querySelector('.dns-extra-fields');
            container.replaceChildren();
            const fields = type.value === 'MX' ? ['priority'] : type.value === 'SRV' ? ['priority', 'weight', 'port'] : type.value === 'CAA' ? ['flag', 'tag'] : [];
            fields.forEach(field => {
                const label = document.createElement('label');
                label.textContent = field;
                const input = document.createElement('input');
                input.dataset.field = field;
                input.setAttribute('aria-label', field);
                input.value = record[field] ?? (field === 'tag' ? 'issue' : '0');
                if (field !== 'tag') { input.type = 'number'; input.min = '0'; input.max = field === 'flag' ? '255' : '65535'; }
                label.append(input);
                container.append(label);
            });
        };
        type.addEventListener('change', extras);
        row.querySelector('button').addEventListener('click', () => row.remove());
        extras();
        this.editor.append(row);
    }
    readRecords() {
        return DnsConfig.validateRecords([...this.editor.children].map(row => Object.fromEntries(
            [...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value])
        )));
    }
    async saveTemplate() {
        try {
            const records = this.readRecords();
            await chrome.storage.local.set({ customDnsRecords: records });
            this.savedRecords = records;
            this.addLog('Đã lưu mẫu. Chọn Tùy chỉnh để dùng lại.', 'success');
        } catch (error) { this.addLog(error.message, 'error'); }
    }
    exportTemplate() {
        try {
            const records = this.readRecords();
            const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, records }, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url; link.download = 'tenten-dns-template.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { this.addLog(error.message, 'error'); }
    }
    async importTemplate(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 65536) throw new Error('File JSON tối đa 64 KB');
            const data = JSON.parse(await file.text());
            const records = DnsConfig.validateRecords(Array.isArray(data) ? data : data.records);
            this.profile.value = 'custom';
            document.getElementById('ladipageDomainSettings').hidden = true;
            this.render(records);
            this.addLog('Đã đọc cấu hình. Kiểm tra danh sách rồi bấm Lưu mẫu hoặc Import vào TENTEN.', 'info');
        } catch (error) { this.addLog(error.message, 'error'); }
        finally { event.target.value = ''; }
    }
    async start() {
        if (this.busy) return;
        this.setBusy(true);
        try {
            const records = this.readRecords();
            const preset = this.profile.value;
            const domain = this.elements.ladipageDomainInput.value.trim().toLowerCase();
            if (preset.startsWith('ladipage') && (!DnsConfig.hostname(domain) || !domain.includes('.'))) throw new Error('Nhập tên miền Ladipage hợp lệ');
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || new URL(tab.url).origin !== 'https://domain.tenten.vn') throw new Error('Mở DNS Settings của tên miền cần cấu hình trên domain.tenten.vn');
            this.currentTabId = tab.id;
            try { await this.send({ action: 'ping' }); }
            catch (_) {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/dns-config.js', 'content.js'] });
                await this.send({ action: 'ping' });
            }
            // Read state before starting to prevent competing popup sessions.
            const previous = await this.send({ action: 'getAutomationState' });
            if (previous.running) { this.restore(previous); return; }
            await chrome.storage.local.set({ dnsImportDomain: domain });
            this.jobId = crypto.randomUUID();
            this.revision = -1;
            this.elements.ladipageContainer.replaceChildren();
            const response = await this.send({ action: 'importDnsRecords', jobId: this.jobId, records });
            if (!response?.accepted) {
                if (response?.state?.running) { this.restore(response.state); return; }
                throw new Error(response?.error || 'Không nhận được xác nhận từ tab');
            }
            // Fetch the latest state: even a fast run may finish before the acceptance callback.
            this.restore(await this.send({ action: 'getAutomationState' }));
        } catch (error) { this.addLog(error.message, 'error'); this.setBusy(false); this.updateProgress(0, error.message); }
    }
    async stop() {
        try {
            const state = await this.send({ action: 'stopAutomation', jobId: this.jobId });
            this.addLog('Đã gửi lệnh dừng; đang chờ yêu cầu hiện tại kết thúc.', 'warning');
            this.restore(state);
        } catch (error) { this.addLog(error.message, 'error'); }
    }
    send(message) { return chrome.tabs.sendMessage(this.currentTabId, message); }
    restore(state) {
        if (state.jobId === this.jobId && state.revision < this.revision) return;
        this.revision = state.revision;
        this.jobId = state.jobId;
        this.setBusy(state.running);
        this.elements.ladipageContainer.replaceChildren();
        state.logs.forEach(entry => this.addLog(entry.message, entry.type));
        this.updateProgress(state.percent, state.message);
    }
    setBusy(busy) {
        this.busy = busy;
        document.getElementById('dnsImportSettings').disabled = busy;
        this.elements.ladipageSubmitBtn.disabled = busy;
        this.elements.ladipageSubmitBtn.textContent = busy ? 'Đang import...' : 'Import vào TENTEN';
        this.elements.ladipageStopBtn.disabled = !busy;
        this.elements.ladipageProgress.style.display = 'block';
    }
    updateProgress(percent, message) {
        this.elements.ladipageProgressFill.style.width = `${percent}%`;
        this.elements.ladipageProgressText.textContent = message;
    }
    addLog(message, type = 'info') {
        const container = this.elements.ladipageContainer;
        const entry = document.createElement('div');
        entry.className = `log-entry ${['info', 'success', 'error', 'warning'].includes(type) ? type : 'info'}`;
        entry.textContent = message;
        container.append(entry);
        while (container.children.length > 100) container.firstChild.remove();
        container.scrollTop = container.scrollHeight;
    }
    handleMessage(message, sender) {
        if (sender.tab?.id !== this.currentTabId || message.jobId !== this.jobId || message.revision < this.revision) return;
        this.revision = message.revision;
        if (message.action === 'addLog') this.addLog(message.message, message.type);
        if (message.action === 'updateProgress') this.updateProgress(message.percent, message.message);
        if (message.action === 'automationComplete') this.restore(message.state);
    }
}
window.LadipageHandler = LadipageHandler;
