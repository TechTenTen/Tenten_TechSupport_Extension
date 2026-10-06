// Timeouts also cover response-body reads. Requests never retry implicitly.
function boundedFetch(url, options = {}) {
    return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(12000) });
}
