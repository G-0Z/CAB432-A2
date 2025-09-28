// Shared helpers (global: window.App)
window.App = (() => {
    const $ = sel => document.querySelector(sel);

    // ---------- HTTP helper (injects Authorization automatically)
    const api = async (path, opts = {}) => {
        const t = localStorage.getItem('accessToken');
        const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
        if (t && opts.auth !== false) headers.Authorization = 'Bearer ' + t;
        const res = await fetch(path, { ...opts, headers });
        if (!res.ok) {
            let msg = res.statusText;
            try { const j = await res.json(); msg = j.error || JSON.stringify(j); } catch {}
            throw new Error(msg);
        }
        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? res.json() : res.text();
    };

    // ---------- Token helpers
    const getToken = () => localStorage.getItem('accessToken') || null;
    const setToken = (token) => {
        if (!token) localStorage.removeItem('accessToken');
        else localStorage.setItem('accessToken', token);
        updateHeader();
    };
    const ensureAuth = () => { if (!getToken()) location.href = '/public/auth.html'; };

    // ---------- Header / layout
    const navLink = (label, href, active) =>
        `<a href="${href}" class="rounded-lg px-3 py-1 text-sm ${active
            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
            : 'text-gray-700 hover:bg-gray-50 ring-1 ring-transparent dark:text-gray-200 dark:hover:bg-gray-800'}">${label}</a>`;

    const renderHeader = async (active = 'home') => {
        const el = $('#app-header');
        el.innerHTML = `
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          <a href="/public/index.html" class="flex items-center gap-2">
            <div class="h-8 w-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/30"></div>
            <div class="text-lg font-semibold">SnapNotes</div>
          </a>
          <span id="health" class="ml-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-gray-200">checking…</span>
        </div>
        <nav class="hidden gap-3 sm:flex">
          ${navLink('Home','/public/index.html', active==='home')}
          ${navLink('Auth','/public/auth.html', active==='auth')}
          ${navLink('Upload','/public/upload.html', active==='upload')}
          ${navLink('Notes','/public/notes.html', active==='notes')}
        </nav>
        <div class="flex items-center gap-2">
          <span id="tokenPill" class="hidden rounded-full px-3 py-1 text-xs font-medium ring-1 ring-gray-200"></span>
          <button id="copyBtn" class="hidden rounded-xl bg-white px-3 py-1 text-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:ring-gray-700">Copy token</button>
          <button id="logoutBtn" class="hidden rounded-xl bg-white px-3 py-1 text-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:ring-gray-700">Logout</button>
          <button id="darkBtn" class="rounded-xl bg-white px-3 py-1 text-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:ring-gray-700" title="Toggle dark">🌙</button>
        </div>
      </div>`;
        attachHeaderEvents();
        updateHeader();
        try { await api('/health', { auth:false }); setHealth(true); }
        catch { setHealth(false); }
    };

    const attachHeaderEvents = () => {
        const root = document.documentElement;
        $('#darkBtn')?.addEventListener('click', () => root.classList.toggle('dark'));
        $('#copyBtn')?.addEventListener('click', async () => {
            const t = getToken(); if (!t) return;
            await navigator.clipboard.writeText(t); toast('Token copied', true);
        });
        $('#logoutBtn')?.addEventListener('click', () => {
            setToken(null); toast('Logged out', true); location.href = '/public/auth.html';
        });
    };

    const setHealth = ok => {
        const h = $('#health');
        h.textContent = ok ? 'API OK' : 'API down';
        h.className = `ml-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ok
            ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
            : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`;
    };

    const updateHeader = () => {
        const t = getToken();
        const pill = $('#tokenPill'), copy = $('#copyBtn'), out = $('#logoutBtn');
        if (!t) { pill?.classList.add('hidden'); copy?.classList.add('hidden'); out?.classList.add('hidden'); return; }
        let exp = '';
        try {
            const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            exp = ' • exp ' + new Date(payload.exp * 1000).toLocaleTimeString();
        } catch {}
        pill.textContent = 'Logged in' + exp;
        pill.classList.remove('hidden'); copy?.classList.remove('hidden'); out?.classList.remove('hidden');
    };

    // ---------- Toast
    const toast = (msg, ok=false) => {
        let el = document.querySelector('#toast');
        if (!el) {
            el = document.createElement('div'); el.id='toast';
            el.className='fixed bottom-4 right-4 z-50 hidden min-w-[260px] rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.background = ok ? 'rgba(16,185,129,0.95)' : 'rgba(17,24,39,0.95)';
        el.classList.remove('hidden');
        clearTimeout(el._t); el._t = setTimeout(()=> el.classList.add('hidden'), 2600);
    };

    // ---------- Upload helpers

    // Create an S3 key that’s namespaced by user + timestamp
    const fileToKey = (userId, file) => {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        return `${userId}/${ts}-${safeName}`;
    };

    // Presign via API (must include the same Content-Type you'll send)
    const presign = async ({ filename, contentType, key }) => {
        return api('/uploads/presign', {
            method: 'POST',
            body: JSON.stringify({ filename, contentType, key })
        });
    };

    // PUT to S3 with EXACTLY the headers you signed (Content-Type only)
    const putToS3 = ({ url, headers }, file, onProgress) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url, true);
            // Only set Content-Type; no custom headers unless your presign included them
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

            xhr.upload.onprogress = (e) => {
                if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader('ETag') });
                else reject(new Error(`S3 PUT failed: ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Network error during S3 PUT'));
            xhr.send(file);
        });
    };

    // High-level upload: presign -> PUT -> return key
    const uploadFile = async (file, onProgress) => {
        if (!file) throw new Error('No file selected');
        const token = getToken();
        if (!token) { toast('Please sign in first'); location.href = '/public/auth.html'; return; }

        // Derive a key from token (sub/email) if available
        let userId = 'user';
        try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            userId = payload?.sub || payload?.['cognito:username'] || payload?.email || 'user';
        } catch {}
        const key = fileToKey(userId, file);

        // 1) Ask server for presigned URL
        const { url, headers } = await presign({ filename: file.name, contentType: file.type || 'application/octet-stream', key });

        // 2) PUT to S3
        await putToS3({ url, headers }, file, onProgress);

        return { key };
    };

    // ---------- Page initialisers (optional convenience)
    const initUploadPage = () => {
        ensureAuth();
        const fileInput = $('#file');
        const btn = $('#uploadBtn');
        const bar = $('#progress');
        const status = $('#status');

        const setProgress = (p) => {
            if (bar) { bar.value = p; bar.textContent = `${p}%`; }
            if (status) status.textContent = `Uploading… ${p}%`;
        };

        btn?.addEventListener('click', async () => {
            try {
                const file = fileInput?.files?.[0];
                if (!file) { toast('Select a file first'); return; }
                setProgress(0);
                const { key } = await uploadFile(file, setProgress);
                setProgress(100);
                toast('Uploaded ✔', true);
                if (status) status.textContent = `Uploaded: ${key}`;
            } catch (err) {
                console.error(err);
                toast(err.message || 'Upload failed');
                if (status) status.textContent = 'Upload failed';
            }
        });
    };

    return { api, getToken, setToken, ensureAuth, renderHeader, toast, uploadFile, initUploadPage };
})();
