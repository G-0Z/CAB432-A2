// public/js/upload.js
(() => {
    'use strict';

    // ---- DOM ----
    const els = {
        file:      document.getElementById('fileInput'),
        btnOne:    document.getElementById('btnOneShot'),
        btnPre:    document.getElementById('btnPresign'),
        btnPut:    document.getElementById('btnUpload'),
        btnDirect: document.getElementById('btnDirect'),
        btnLink:   document.getElementById('btnGetLink'),
        result:    document.getElementById('result'),
        keyOut:    document.getElementById('keyOut'),
        linkOut:   document.getElementById('linkOut'),
    };

    // ---- State ----
    const state = {
        file: null,          // File object
        key: null,           // S3 object key
        upload: null,        // { url, headers, method }
    };

    // ---- Helpers ----
    const pretty = (v) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };
    const setMsg = (s) => { if (els.result) els.result.textContent = s; console.log(s); };
    const setKey = (k) => { state.key = k || null; if (els.keyOut) els.keyOut.textContent = state.key || '—'; };
    const setLink = (href, text) => {
        if (!els.linkOut) return;
        if (!href) { els.linkOut.innerHTML = ''; return; }
        els.linkOut.innerHTML = `<a href="${href}" target="_blank" rel="noopener">${text || href}</a>`;
    };
    const baseFromPresigned = (url) => (url ? url.split('?')[0] : null);
    const getJwt = () => localStorage.getItem('jwt') || localStorage.getItem('token') || '';
    const authHeaders = () => (getJwt() ? { Authorization: `Bearer ${getJwt()}` } : {});

    // Normalize various possible presign response shapes to { key, upload:{url, headers, method} }
    function normalizePresign(data) {
        const key = data?.key ?? data?.result?.key ?? data?.s3Key ?? null;
        const url = data?.upload?.url ?? data?.url ?? null;
        const headers = data?.upload?.headers ?? data?.headers ?? {};
        const method = data?.upload?.method ?? 'PUT';
        return { key, upload: { url, headers, method } };
    }

    // ---- API calls ----
    async function callPresign(file) {
        const body = {
            filename: file.name,
            contentType: file.type || 'application/octet-stream'
        };
        const res = await fetch('/uploads/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        console.log('presign response:', data);
        if (!res.ok || data.ok === false) throw new Error(`Presign failed: ${res.status} ${pretty(data)}`);

        const n = normalizePresign(data);
        if (!n.key || !n.upload.url) throw new Error(`Bad presign shape: ${pretty(data)}`);
        return n;
    }

    async function putToS3(file) {
        const { url, headers } = state.upload;
        const put = await fetch(url, { method: 'PUT', headers, body: file });
        if (!put.ok) {
            const text = await put.text().catch(() => '');
            throw new Error(`S3 PUT ${put.status}: ${text}`);
        }
        const etag = put.headers.get('ETag');
        return { etag, objectUrl: baseFromPresigned(url) };
    }

    async function directUpload(file) {
        const fd = new FormData();
        fd.append('file', file);
        // fd.append('folder', 'notes'); // optional

        const res = await fetch('/uploads/direct', {
            method: 'POST',
            headers: { ...authHeaders() }, // do NOT set Content-Type for FormData
            body: fd,
        });
        const data = await res.json().catch(() => ({}));
        console.log('direct upload response:', data);
        if (!res.ok || data.ok === false) throw new Error(`Direct upload failed: ${res.status} ${pretty(data)}`);
        return { key: data.key, eTag: data.eTag, mime: data.mime };
    }

    async function getDownloadLink(s3Key) {
        const res = await fetch('/uploads/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ s3Key }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(`Download link failed: ${res.status} ${pretty(data)}`);
        return data.download?.url || null;
    }

    // ---- UI wiring ----
    els.file?.addEventListener('change', (e) => {
        state.file = e.target.files?.[0] || null;
        setMsg(state.file ? `Selected: ${state.file.name} (${state.file.type || 'unknown'})` : 'No file selected');
        setKey(null);
        setLink(null);
        state.upload = null;
    });

    // One-click: presign then put
    els.btnOne?.addEventListener('click', async () => {
        try {
            if (!state.file) return setMsg('Pick a file first.');
            const { key, upload } = await callPresign(state.file);
            state.upload = upload;
            setKey(key); // ✅ SAVE KEY HERE
            const { etag, objectUrl } = await putToS3(state.file);
            setMsg(`Uploaded ✓ ETag: ${etag || 'n/a'}\nResult key: ${state.key}`);
            setLink(objectUrl, 'S3 object (may 403 if bucket is private)');
        } catch (err) {
            console.error(err);
            setMsg(err.message || String(err));
        }
    });

    // Two-step: presign only
    els.btnPre?.addEventListener('click', async () => {
        try {
            if (!state.file) return setMsg('Pick a file first.');
            const { key, upload } = await callPresign(state.file);
            state.upload = upload;
            setKey(key); // ✅ SAVE KEY HERE
            setMsg(`Presigned ✓ Key: ${key}`);
            setLink(baseFromPresigned(upload.url), 'S3 object (may 403 if private)');
        } catch (err) {
            console.error(err);
            setMsg(err.message || String(err));
        }
    });

    // Two-step: PUT to S3
    els.btnPut?.addEventListener('click', async () => {
        try {
            if (!state.file) return setMsg('Pick a file first.');
            if (!state.upload) return setMsg('Click “Presign” first.');
            const { etag, objectUrl } = await putToS3(state.file);
            setMsg(`Uploaded ✓ ETag: ${etag || 'n/a'}\nResult key: ${state.key}`); // ✅ REUSE SAVED KEY
            setLink(objectUrl, 'S3 object (may 403 if private)');
        } catch (err) {
            console.error(err);
            setMsg(err.message || String(err));
        }
    });

    // Direct server-proxy (no presign)
    els.btnDirect?.addEventListener('click', async () => {
        try {
            if (!state.file) return setMsg('Pick a file first.');
            const out = await directUpload(state.file);
            setKey(out.key);
            setMsg(`Direct upload ✓ Key: ${out.key}`);
            setLink(null);
        } catch (err) {
            console.error(err);
            setMsg(err.message || String(err));
        }
    });

    // Get presigned download link
    els.btnLink?.addEventListener('click', async () => {
        try {
            if (!state.key) return setMsg('No key yet. Upload first.');
            const url = await getDownloadLink(state.key);
            if (!url) return setMsg('No download URL returned.');
            setLink(url, 'Temporary download link');
            setMsg('Generated temporary download link ✓');
        } catch (err) {
            console.error(err);
            setMsg(err.message || String(err));
        }
    });

    // Initial
    if (els.result && !els.result.textContent) setMsg('Ready. Pick a file to begin.');
})();
