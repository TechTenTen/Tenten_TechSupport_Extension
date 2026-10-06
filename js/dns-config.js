// Shared validation and TENTEN form mapping (popup + isolated content script).
(function (root) {
    'use strict';
    const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'REDIRECT'];
    const MAX_RECORDS = 50;
    const webcake = () => [
        { type: 'A', name: '@', value: '113.20.119.17' },
        { type: 'CNAME', name: 'www', value: 'dns.webcake.io' }
    ];
    const hostname = value => value.length <= 253 && value.replace(/\.$/, '').split('.').every(label =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
    function uint(value, max, field) {
        if (!/^\d+$/.test(String(value ?? '')) || Number(value) > max) throw new Error(`${field} phải từ 0 đến ${max}`);
        return String(Number(value));
    }
    function ipv6(value) {
        if (!/^[\da-f:]+$/i.test(value) || !value.includes(':')) return false;
        const halves = value.split('::');
        if (halves.length > 2) return false;
        const groups = halves.flatMap(h => h ? h.split(':') : []);
        return groups.every(g => /^[\da-f]{1,4}$/i.test(g)) &&
            (halves.length === 2 ? groups.length < 8 : groups.length === 8);
    }
    function validateRecords(input) {
        if (!Array.isArray(input) || !input.length || input.length > MAX_RECORDS) throw new Error(`Cần 1–${MAX_RECORDS} bản ghi`);
        const seen = new Set();
        const names = new Map();
        return input.map((raw, i) => {
            try {
                if (!raw || typeof raw !== 'object') throw new Error('Bản ghi không hợp lệ');
                const type = String(raw.type || '').toUpperCase();
                const name = String(raw.name ?? '').trim().toLowerCase().replace(/\.$/, '');
                const value = String(raw.value ?? '').trim();
                if (!TYPES.includes(type)) throw new Error('Loại bản ghi chưa hỗ trợ');
                if (!name || name.length > 253 || !(name === '@' || /^(?:\*\.)?[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?$|^\*$/i.test(name))) throw new Error('Name không hợp lệ');
                if (!value || value.length > 4096 || /[\r\n\0]/.test(value)) throw new Error('Value không hợp lệ');
                const record = { type, name, value };
                if (type === 'A' && !(value.split('.').length === 4 && value.split('.').every(p => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255))) throw new Error('Value phải là IPv4 hợp lệ');
                if (type === 'AAAA' && !ipv6(value)) throw new Error('Value phải là IPv6 hợp lệ');
                if (['CNAME', 'MX', 'NS', 'SRV'].includes(type) && !hostname(value)) throw new Error('Value phải là hostname, không có http:// hoặc đường dẫn');
                if (type === 'REDIRECT') {
                    const url = new URL(value);
                    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REDIRECT phải là URL http/https');
                }
                if (type === 'MX') record.priority = uint(raw.priority, 65535, 'Priority');
                if (type === 'SRV') {
                    record.priority = uint(raw.priority, 65535, 'Priority');
                    record.weight = uint(raw.weight, 65535, 'Weight');
                    record.port = uint(raw.port, 65535, 'Port');
                }
                if (type === 'CAA') {
                    record.flag = uint(raw.flag, 255, 'Flag');
                    record.tag = String(raw.tag || '').toLowerCase();
                    if (!['issue', 'issuewild', 'iodef'].includes(record.tag)) throw new Error('Tag CAA: issue, issuewild hoặc iodef');
                }
                const key = JSON.stringify(record);
                if (seen.has(key)) throw new Error('Bản ghi bị trùng trong danh sách');
                seen.add(key);
                const existing = names.get(name) || [];
                if (existing.length && (type === 'CNAME' || existing.includes('CNAME'))) throw new Error('CNAME không thể dùng chung Name với bản ghi khác');
                names.set(name, [...existing, type]);
                return record;
            } catch (error) { throw new Error(`Bản ghi ${i + 1}: ${error.message}`); }
        });
    }
    function formData(record, token) {
        const data = {
            'data[name]': record.name, 'data[type]': record.type, 'data[value]': record.value,
            'data[priority]': record.type === 'MX' ? record.priority : '',
            'data[priority_srv]': record.type === 'SRV' ? record.priority : '',
            'data[weight_srv]': record.weight || '', 'data[port_srv]': record.port || '',
            'data[value_srv]': record.type === 'SRV' ? record.value : '',
            'data[tag_caa]': record.tag || '', 'data[flag_caa]': record.flag || '',
            'data[value_caa]': record.type === 'CAA' ? record.value : '',
            dev_token_csrf: token, data_init: ''
        };
        return new URLSearchParams(data).toString();
    }
    function checkResponse(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('API trả dữ liệu không hợp lệ; kiểm tra DNS Settings trước khi chạy lại');
        const flags = [data.success, data.status, data.result].filter(v => v !== undefined);
        const failure = v => v === false || v === 0 || /^(false|0|error|failed|fail)$/i.test(String(v));
        if (data.error || flags.some(failure)) throw new Error(String(data.message || data.msg || data.error || 'API từ chối bản ghi').slice(0, 300));
        if (!flags.some(v => v === true || v === 1 || /^(true|1|success|ok)$/i.test(String(v)))) {
            throw new Error('Chưa xác định được trạng thái từ API TENTEN; kiểm tra bản ghi trên trang trước khi chạy lại');
        }
    }
    const api = { TYPES, MAX_RECORDS, webcake, hostname, validateRecords, formData, checkResponse };
    root.DnsConfig = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
