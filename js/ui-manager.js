class UIManager {
    constructor(elements) { this.elements = elements; this.currentPanel = null; }
    showRightPanel(title, content) {
        this.elements.rightPanelTitle.textContent = title;
        this.currentPanel = content;
        this.elements.body.classList.add('expanded');
        this.elements.rightPanel.classList.add('active');
        this.hideAllSections();
        const sections = { whois: 'whoisSection', ipinfo: 'ipInfoSection', dns: 'dnsSection', ladipage: 'ladipageSection', help: 'helpSection' };
        if (sections[content]) this.elements[sections[content]].style.display = 'block';
    }
    closeRightPanel() {
        this.elements.rightPanel.classList.remove('active');
        this.elements.body.classList.remove('expanded');
        this.hideAllSections();
        this.currentPanel = null;
    }
    hideAllSections() {
        ['whoisSection', 'ipInfoSection', 'dnsSection', 'ladipageSection', 'helpSection'].forEach(id => {
            if (this.elements[id]) this.elements[id].style.display = 'none';
        });
    }
    updateStatus(online, message) {
        this.elements.statusIndicator.className = `status-indicator ${online ? 'online' : 'offline'}`;
        this.elements.statusText.textContent = message;
    }
    showError(message) { this.updateStatus(false, message); }
    showSuccess(message) { this.updateStatus(true, message); }
    initializeScrolling() {
        const menu = this.elements.menuSection;
        if (!menu) return;
        const update = () => {
            menu.classList.toggle('scrolled-top', menu.scrollTop > 0);
            menu.classList.toggle('scrolled-bottom', menu.scrollTop + menu.clientHeight < menu.scrollHeight - 5);
        };
        menu.addEventListener('scroll', update, { passive: true });
        update();
    }
}
window.UIManager = UIManager;
