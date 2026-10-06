// WHOIS Lookup functionality
// Handles WHOIS domain information lookup using Tenten API

class WhoisHandler {
    constructor(elements) {
        this.elements = elements;
        this.isLoading = false;
    }

    async handleLookup(domain = null) {
        // Get domain from parameter or from input (for backward compatibility)
        const targetDomain = domain || (this.elements.whoisDomainInput ? this.elements.whoisDomainInput.value.trim() : '');

        if (!targetDomain) {
            this.showError('Vui lòng nhập tên miền');
            return;
        }

        if (this.isLoading) {
            
            return;
        }

        // No need to show right panel - it's already shown
        // Just update the container with loading state
        
        this.elements.whoisContainer.innerHTML = '<div class="whois-loading">🔍 Đang tra cứu thông tin WHOIS...</div>';
        
        // Set loading state
        this.setLoadingState(true);

        try {
            // Clean domain name (remove http/https, www, etc.)
            const cleanDomain = this.cleanDomainName(targetDomain);

            // Call background script for WHOIS
            
            const response = await this.sendMessage({ action: 'whoisLookup', domain: cleanDomain });

            if (response && response.success) {
                
                this.displayWhoisData(response.data, response.warning, response.source);
            } else {
                console.error('WHOIS API error:', response);
                this.elements.whoisContainer.innerHTML = `<div class="whois-error">❌ Lỗi: ${response?.error || 'Không thể tra cứu thông tin WHOIS'}</div>`;
            }
        } catch (error) {
            console.error('WHOIS error:', error);
            this.elements.whoisContainer.innerHTML = `<div class="whois-error">❌ Lỗi: ${error.message}</div>`;
        } finally {
            this.setLoadingState(false);
        }
    }

    setLoadingState(loading) {
        this.isLoading = loading;
        if (this.elements.whoisLookupBtn) {
            if (loading) {
                this.elements.whoisLookupBtn.classList.add('loading');
                this.elements.whoisLookupBtn.style.pointerEvents = 'none';
            } else {
                this.elements.whoisLookupBtn.classList.remove('loading');
                this.elements.whoisLookupBtn.style.pointerEvents = 'auto';
            }
        }
    }

    async sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        error: 'Lỗi kết nối với background script: ' + chrome.runtime.lastError.message
                    });
                } else {
                    resolve(response);
                }
            });
        });
    }

    cleanDomainName(domain) {
        // Remove protocol
        domain = domain.replace(/^https?:\/\//, '');
        
        // Remove www
        domain = domain.replace(/^www\./, '');
        
        // Remove path
        domain = domain.split('/')[0];
        
        // Remove port
        domain = domain.split(':')[0];
        
        return domain.toLowerCase().trim();
    }

    displayWhoisData(data, warning, source) {
        let html = '';
        
        if (warning) {
            html += `<div class="whois-warning">${warning}</div>`;
        }
        
        // Create WHOIS fields
        const fields = [
            { label: 'Tên miền:', value: data.domainName, highlight: true },
            { label: 'Ngày đăng ký:', value: data.creationDate },
            { label: 'Ngày hết hạn:', value: data.expirationDate, highlight: true },
            { label: 'Ngày cập nhật:', value: data.updatedDate },
            { label: 'Chủ sở hữu:', value: data.registrantName },
            { label: 'Tổ chức:', value: data.registrantOrganization },
            { label: 'Email:', value: data.registrantEmail },
            { label: 'Điện thoại:', value: data.registrantPhone },
            { label: 'Địa chỉ:', value: data.registrantAddress },
            { label: 'Thành phố:', value: data.registrantCity },
            { label: 'Quốc gia:', value: data.registrantCountry },
            { label: 'Nhà đăng ký:', value: data.registrarName },
            { label: 'Trạng thái:', value: data.status },
            { label: 'Name Servers:', value: data.nameServers }
        ];
        
        // Filter out empty fields and create HTML
        const validFields = fields.filter(field => field.value && field.value.trim() !== '');
        
        if (validFields.length === 0) {
            html += '<div class="whois-empty">❌ Không tìm thấy thông tin WHOIS cho domain này</div>';
        } else {
            validFields.forEach(field => {
                const highlightClass = field.highlight ? ' highlight' : '';
                html += `<div class="whois-field${highlightClass}">
                    <div class="whois-label">${field.label}</div>
                    <div class="whois-value">${field.value}</div>
                </div>`;
            });
        }
        
        // Source info
        if (source) {
            html += `<div class="whois-source">📡 Nguồn: ${source}</div>`;
        }
        
        this.elements.whoisContainer.innerHTML = html;
    }

    showError(message) {
        if (window.uiManager && window.uiManager.showError) {
            window.uiManager.showError(message);
        } else {
            alert(message);
        }
    }
}

// Export for use in main popup.js
window.WhoisHandler = WhoisHandler;
