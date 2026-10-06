document.addEventListener('DOMContentLoaded', async () => {
    const ids = ['statusIndicator', 'statusText', 'whoisSection', 'whoisContainer', 'whoisDomainInput', 'whoisSubmitBtn',
        'ipInfoSection', 'ipInfoContainer', 'ipinfoDomainInput', 'ipinfoSubmitBtn', 'dnsSection', 'dnsContainer', 'dnsDomainInput', 'dnsSubmitBtn',
        'autoLadipage', 'ladipageSection', 'ladipageContainer', 'ladipageDomainInput', 'ladipageSubmitBtn', 'ladipageProgress', 'ladipageProgressFill',
        'ladipageProgressText', 'ladipageStopBtn', 'rightPanel', 'rightPanelTitle', 'rightPanelContent', 'closePanelBtn', 'helpSection'];
    const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    Object.assign(elements, { body: document.body, menuSection: document.querySelector('.menu-section'),
        whoisLookupBtn: document.getElementById('whoisLookup'), ipInfoBtn: document.getElementById('ipInfo'),
        dnsRecordsBtn: document.getElementById('dnsRecords'), recordTypeSelect: document.getElementById('recordType') });
    window.uiManager = new UIManager(elements);
    window.whoisHandler = new WhoisHandler(elements);
    window.ipInfoHandler = new IpInfoHandler(elements);
    window.dnsRecordsHandler = new DnsRecordsHandler(elements);
    window.ladipageHandler = new LadipageHandler(elements);
    const lookups = [
        ['whoisLookup', 'whois', 'Thông tin WHOIS', 'whoisDomainInput', 'whoisSubmitBtn', window.whoisHandler],
        ['ipInfo', 'ipinfo', 'Thông tin IP/Domain', 'ipinfoDomainInput', 'ipinfoSubmitBtn', window.ipInfoHandler],
        ['dnsRecords', 'dns', 'Bản ghi DNS', 'dnsDomainInput', 'dnsSubmitBtn', window.dnsRecordsHandler]
    ];
    lookups.forEach(([menu, section, title, input, submit, handler]) => {
        document.getElementById(menu).addEventListener('click', () => {
            window.uiManager.showRightPanel(title, section);
            elements[input].focus();
        });
        elements[submit].addEventListener('click', () => handler.handleLookup(elements[input].value.trim()));
        elements[input].addEventListener('keydown', event => { if (event.key === 'Enter') elements[submit].click(); });
    });
    elements.closePanelBtn.addEventListener('click', () => window.uiManager.closeRightPanel());
    document.getElementById('helpLink').addEventListener('click', event => {
        event.preventDefault();
        window.uiManager.showRightPanel('Hướng dẫn', 'help');
    });
    document.getElementById('openIpWidget').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !/^https?:\/\//.test(tab.url)) throw new Error('Mở một website HTTP/HTTPS trước');
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['ip-widget-content.js'] });
            window.uiManager.updateStatus(true, 'Đã mở widget trên tab hiện tại');
        } catch (error) { window.uiManager.updateStatus(false, error.message); }
    });
    chrome.runtime.onMessage.addListener((message, sender) => {
        window.ladipageHandler.handleMessage(message, sender);
        return false;
    });
    try {
        const saved = await DomainUtils.loadSavedDomain();
        if (saved) lookups.forEach(([, , , input]) => { elements[input].value = saved; });
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const connected = tab?.url && new URL(tab.url).origin === 'https://domain.tenten.vn';
        window.uiManager.updateStatus(connected, connected ? 'Tab TENTEN sẵn sàng' : 'Tra cứu sẵn sàng; mở TENTEN để import');
    } catch (_) { window.uiManager.updateStatus(false, 'Tra cứu sẵn sàng'); }
    window.uiManager.initializeScrolling();
});
