// ==UserScript==
// @name          Vinted - Duplicate / Relist Items
// @namespace     https://github.com/NeKaBe/vinted-relister
// @description   Relist or duplicate your own Vinted listings as a draft (photos, description, price, category and more are kept). Nothing is published automatically; Relist deletes the original only after your confirmation and a clean check.
// @icon          https://www.vinted.com/favicon.ico
// @copyright     2026
// @license       MIT
// @version       0.5.3
// @author        NeKaBe
// @credits       OldRon1977 - idea and approach (main script + helper), see https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @match         https://www.vinted.de/items/*
// @match         https://www.vinted.com/items/*
// @match         https://www.vinted.co.uk/items/*
// @match         https://www.vinted.fr/items/*
// @match         https://www.vinted.it/items/*
// @match         https://www.vinted.es/items/*
// @match         https://www.vinted.nl/items/*
// @match         https://www.vinted.be/items/*
// @match         https://www.vinted.at/items/*
// @match         https://www.vinted.pl/items/*
// @match         https://www.vinted.cz/items/*
// @match         https://www.vinted.lt/items/*
// @match         https://www.vinted.pt/items/*
// @match         https://www.vinted.lu/items/*
// @match         https://www.vinted.se/items/*
// @match         https://www.vinted.dk/items/*
// @match         https://www.vinted.fi/items/*
// @match         https://www.vinted.sk/items/*
// @match         https://www.vinted.hu/items/*
// @match         https://www.vinted.ro/items/*
// @match         https://www.vinted.hr/items/*
// @homepage      https://github.com/NeKaBe/vinted-relister
// @supportURL     https://github.com/NeKaBe/vinted-relister/issues
// @contributionURL https://ko-fi.com/nekabe
// @updateURL      https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-relist.user.js
// @downloadURL    https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-relist.user.js
// @run-at        document-idle
// @noframes
// @grant         GM_xmlhttpRequest
// @grant         GM_registerMenuCommand
// @grant         GM_openInTab
// @connect       vinted.net
// ==/UserScript==

/*
 * How it works (deliberately cautious):
 *  1. Reads your own item through the Vinted web API.
 *  2. Downloads all photos and uploads them again as new photos.
 *  3. Creates a DRAFT with the same data and compares it with the original.
 *     YOU review and publish it.
 *  4. "Relist": after your confirmation in a popup, the original is deleted,
 *     but only if the comparison found no differences. "Duplicate" never
 *     deletes anything.
 *
 * The endpoints are the ones used by the Vinted website and are not documented.
 * If Vinted changes them, the script stops with a clear message. Nothing
 * destructive happens in that case, because the original is only touched
 * after a successful, verified draft.
 *
 * The script only works with your own items and refuses other people's items.
 */

(function () {
    'use strict';

    const VERSION = '0.5.3';

    const CFG = {
        REQUEST_TIMEOUT_MS: 20000,
        // Full-size photo uploads can take longer than a normal API call.
        UPLOAD_TIMEOUT_MS: 60000,
        IMAGE_TIMEOUT_MS: 30000,
        // Name of the root object in the draft request. If Vinted renames it,
        // this is the first place to adjust.
        DRAFT_BODY_KEY: 'draft',
        DRAFT_PATH: '/item_upload/drafts',
        TOOLBAR_ID: 'kv-toolbar',
        PANEL_ID: 'kv-panel',
        NOTIFICATION_MS: 5000,
        ISSUES_URL: 'https://github.com/NeKaBe/vinted-relister/issues'
    };

    // Shared protocol with vinted-helper.user.js: keep these values in sync.
    const LS_RESULT_PREFIX = 'kv-result-';
    const LS_PENDING_DELETE = 'kv-pending-delete';

    const log = (m, d) => console.log('[KV-Relist] ' + m, d === undefined ? '' : d);
    const warn = (m, d) => console.warn('[KV-Relist] ' + m, d === undefined ? '' : d);
    const err = (m, d) => console.error('[KV-Relist] ' + m, d === undefined ? '' : d);

    function coded(code, message) {
        return Object.assign(new Error(message), { code: code });
    }

    // === PAGE / SESSION ===
    function getItemId() {
        const m = /^\/items\/(\d+)/.exec(location.pathname);
        return m ? m[1] : null;
    }

    function getCsrf() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) return meta.content;
        const html = document.documentElement.innerHTML;
        const m = /\\?"CSRF_TOKEN\\?"\s*:\s*\\?"([^"\\]+)/.exec(html);
        if (m) return m[1];
        throw coded('no_csrf', 'CSRF token not found (reload the page or log in again)');
    }

    function getAnonId() {
        const m = /(?:^|;\s*)anon_id=([^;]+)/.exec(document.cookie);
        return m ? decodeURIComponent(m[1]) : null;
    }

    // Own user ID from the page data. Several patterns because Vinted may
    // change the structure; null means "unknown", not "someone else".
    function detectOwnUserId() {
        const html = document.documentElement.innerHTML;
        const patterns = [
            /\\?"current_user\\?"\s*:\s*\{[^}]*?\\?"id\\?"\s*:\s*(\d+)/,
            /\\?"currentUser\\?"\s*:\s*\{[^}]*?\\?"id\\?"\s*:\s*(\d+)/,
            /\\?"CURRENT_USER_ID\\?"\s*:\s*\\?"?(\d+)/
        ];
        for (const re of patterns) {
            const m = re.exec(html);
            if (m) return m[1];
        }
        return null;
    }

    function hasEditLink(id) {
        return !!document.querySelector('a[href*="/items/' + id + '/edit"]');
    }

    function isOwnItem(item, id) {
        if (item && (item.is_owner === true || item.can_edit === true || item.can_delete === true)) return true;
        if (hasEditLink(id)) return true;
        const own = detectOwnUserId();
        return !!(own && item && item.user && String(item.user.id) === String(own));
    }

    // === API ===
    async function apiFetch(path, opts) {
        const o = opts || {};
        const headers = { accept: 'application/json, text/plain, */*', 'x-csrf-token': getCsrf() };
        const anon = getAnonId();
        if (anon) headers['x-anon-id'] = anon;
        let body;
        if (o.json !== undefined) {
            headers['content-type'] = 'application/json';
            body = JSON.stringify(o.json);
        } else if (o.form) {
            body = o.form;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(function () { ctrl.abort(); }, o.timeoutMs || CFG.REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch('/api/v2' + path, {
                method: o.method || 'GET', headers: headers, body: body,
                credentials: 'same-origin', signal: ctrl.signal
            });
        } catch (e) {
            throw coded('network', e.name === 'AbortError' ? 'Timeout on ' + path : (e.message || 'Network error'));
        } finally {
            clearTimeout(timer);
        }
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        if (!res.ok) {
            const msg = 'HTTP ' + res.status + ' on ' + path + (data && data.message ? ': ' + data.message : '');
            if (res.status === 401 || res.status === 403) throw coded('auth', msg + ' (session expired? reload the page)');
            throw coded('http_' + res.status, msg);
        }
        return data;
    }

    // Where the full item data can be read. Tried in order; the first usable
    // answer wins. The edit-form endpoint only serves your own items, so a
    // success there already proves ownership. Unofficial: adjust here if
    // Vinted changes it.
    const ITEM_SOURCES = [
        { path: function (id) { return '/item_upload/items/' + id; }, provesOwner: true },
        { path: function (id) { return '/items/' + id + '/details'; }, provesOwner: false },
        { path: function (id) { return '/items/' + id; }, provesOwner: false }
    ];

    // Asks every source and merges the answers (earlier sources win), because
    // no single endpoint is guaranteed to contain all fields (condition, size ...).
    async function fetchItem(id) {
        const items = [];
        const report = [];
        let provesOwner = false;
        let firstPath = null;
        let hardError = null;
        const codes = [];
        for (const src of ITEM_SOURCES) {
            const path = src.path(id);
            try {
                const data = await apiFetch(path);
                const item = data && (data.item || data);
                if (item && item.title) {
                    items.push(item);
                    report.push(path + ': ok (' + Object.keys(item).length + ' fields)');
                    if (src.provesOwner) provesOwner = true;
                    if (!firstPath) firstPath = path;
                } else {
                    report.push(path + ': no item data');
                }
            } catch (e) {
                warn('Item endpoint failed: ' + path, e.message);
                report.push(path + ': ' + (e.code || 'error'));
                codes.push(e.code);
                if (e.code !== 'http_404' && e.code !== 'auth') hardError = e;
            }
        }
        if (!items.length) {
            if (hardError) throw hardError;
            warn('No endpoint returned the item', report);
            // item_upload answers 404 for listings that are not yours.
            if (codes[0] === 'auth') throw coded('auth', 'Your Vinted session seems to have expired.');
            throw coded('not_owner', 'This listing does not seem to belong to you, so it is not eligible for this action.');
        }
        const merged = Object.assign.apply(null, [{}].concat(items.slice().reverse()));
        log('Item loaded', report);
        return { item: merged, provesOwner: provesOwner, path: firstPath, report: report };
    }

    // Photos live on a different host (vinted.net). GM_xmlhttpRequest avoids CORS.
    function downloadBlob(url) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET', url: url, responseType: 'blob', timeout: CFG.IMAGE_TIMEOUT_MS,
                onload: function (r) {
                    if (r.status >= 200 && r.status < 300 && r.response) resolve(r.response);
                    else reject(new Error('HTTP ' + r.status));
                },
                onerror: function () { reject(new Error('Network error')); },
                ontimeout: function () { reject(new Error('Timeout')); }
            });
        });
    }

    async function uploadPhoto(blob, index, tempUuid) {
        const typed = blob.type ? blob : new Blob([blob], { type: 'image/jpeg' });
        const form = new FormData();
        form.append('photo[type]', 'item');
        form.append('photo[file]', typed, 'photo_' + String(index + 1).padStart(2, '0') + '.jpg');
        form.append('photo[temp_uuid]', tempUuid);
        const data = await apiFetch('/photos', { method: 'POST', form: form, timeoutMs: CFG.UPLOAD_TIMEOUT_MS });
        if (!data || !data.id) throw coded('photo_upload', 'Photo ' + (index + 1) + ': no ID in the response');
        return data.id;
    }

    // === DATA ===
    function pick() {
        for (let i = 0; i < arguments.length; i++) {
            const v = arguments[i];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return null;
    }

    function priceOf(item) {
        const p = item.price;
        const raw = (p && typeof p === 'object') ? p.amount : pick(p, item.price_numeric);
        const n = Number(raw);
        return isFinite(n) ? n : null;
    }

    function photoUrls(item) {
        return (item.photos || [])
            .map(function (p) { return pick(p.full_size_url, p.url); })
            .filter(Boolean);
    }

    function colorIds(item) {
        if (Array.isArray(item.colors) && item.colors.length) {
            return item.colors.map(function (c) { return c.id; }).filter(Boolean);
        }
        return [item.color1_id, item.color2_id].filter(Boolean);
    }

    function itemAttributes(item) {
        const a = item.item_attributes;
        if (!Array.isArray(a)) return [];
        return a.filter(function (x) { return x && x.code && Array.isArray(x.ids); })
            .map(function (x) { return { code: x.code, ids: x.ids }; });
    }

    // Fields of the item data that are never copied into the draft (computed
    // by Vinted, tied to the old item, or already handled explicitly).
    const NOT_COPIED = {
        id: 1, photos: 1, ai_photo: 1, is_draft: 1, brand_dto: 1, color1: 1, color2: 1, color1_id: 1, color2_id: 1,
        can_push_up: 1, promoted: 1, item_alert: 1, domestic_shipment_price: 1, international_shipment_price: 1,
        shipment_prices: 1, price: 1, currency: 1
    };

    function buildPayload(item, photoIds, tempUuid, withExtras) {
        const brand = item.brand_dto || {};
        // Newer item data keeps condition and size only inside item_attributes,
        // but the draft endpoint still wants status_id / size_id. The ids are
        // taken from the original item's own attributes, never from a table.
        const attrs = itemAttributes(item);
        const attrId = function (code) {
            const a = attrs.filter(function (x) { return x.code === code; })[0];
            return a && a.ids.length ? a.ids[0] : null;
        };
        const payload = {
            id: null,
            currency: pick(item.currency, item.price && item.price.currency_code, 'EUR'),
            temp_uuid: tempUuid,
            title: item.title,
            description: item.description,
            brand_id: pick(item.brand_id, brand.id),
            brand: pick(brand.title, typeof item.brand === 'string' ? item.brand : null),
            size_id: pick(item.size_id, item.size && item.size.id, attrId('size')),
            catalog_id: pick(item.catalog_id, item.category_id, item.catalog && item.catalog.id),
            isbn: pick(item.isbn),
            is_unisex: !!item.is_unisex,
            status_id: pick(item.status_id, item.condition_id, attrId('condition')),
            video_game_rating_id: pick(item.video_game_rating_id),
            price: priceOf(item),
            package_size_id: pick(item.package_size_id, item.package_size && item.package_size.id),
            shipping_order_id: null,
            measurement_length: pick(item.measurement_length),
            measurement_width: pick(item.measurement_width),
            item_attributes: itemAttributes(item),
            manufacturer: pick(item.manufacturer),
            manufacturer_labelling: pick(item.manufacturer_labelling),
            color_ids: colorIds(item),
            assigned_photos: photoIds.map(function (id) { return { id: id, orientation: 0 }; })
        };
        // Category-specific fields (author, book_title, model, ontology ids ...):
        // copy every remaining plain value of the original so new categories work
        // without listing each field by hand.
        if (withExtras !== false) {
            Object.keys(item).forEach(function (k) {
                if (NOT_COPIED[k] || k in payload) return;
                const v = item[k];
                if (v === null || v === undefined || v === '' || typeof v === 'object') return;
                payload[k] = v;
            });
        }
        return payload;
    }

    // === VERIFICATION: original vs. created draft ===
    function stable(v) {
        if (Array.isArray(v)) return '[' + v.map(stable).sort().join(',') + ']';
        if (v && typeof v === 'object') {
            return '{' + Object.keys(v).sort().map(function (k) { return k + ':' + stable(v[k]); }).join(',') + '}';
        }
        return String(v);
    }
    function isEmpty(v) {
        return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
    }
    function shortText(v) { return (JSON.stringify(v) || '').slice(0, 60); }

    // Language- and category-independent: compares the raw data of both items.
    function compareItems(orig, draft) {
        const diffs = [];
        Object.keys(orig).forEach(function (k) {
            if (NOT_COPIED[k]) return;
            if (isEmpty(orig[k])) return;
            if (stable(orig[k]) !== stable(draft[k])) {
                diffs.push(k + ': ' + shortText(orig[k]) + ' -> ' + (isEmpty(draft[k]) ? 'missing' : shortText(draft[k])));
            }
        });
        if (priceOf(orig) !== priceOf(draft)) diffs.push('price: ' + priceOf(orig) + ' -> ' + priceOf(draft));
        if (stable(colorIds(orig)) !== stable(colorIds(draft))) diffs.push('colors: ' + stable(colorIds(orig)) + ' -> ' + stable(colorIds(draft)));
        if (photoUrls(orig).length !== photoUrls(draft).length) {
            diffs.push('photos: ' + photoUrls(orig).length + ' -> ' + photoUrls(draft).length);
        }
        return diffs;
    }

    async function verifyDraft(orig, draftId) {
        if (!draftId) return ['Draft ID unknown: could not verify. Please check the draft yourself.'];
        try {
            const data = await apiFetch('/item_upload/items/' + draftId);
            const draft = data && (data.item || data);
            if (!draft || !draft.title) return ['Could not read the draft back. Please check it yourself.'];
            const diffs = compareItems(orig, draft);
            if (!diffs.length) return ['Checked against the original: no differences found.'];
            warn('Differences original vs draft', diffs);
            return ['Differences from the original (please check the draft):'].concat(diffs);
        } catch (e) {
            return ['Could not verify the draft (' + e.message + '). Please check it yourself.'];
        }
    }

    // Required fields without which a draft makes no sense. Brand and size are
    // legitimately missing in some categories, so they are not required here.
    function missingFields(payload) {
        const missing = ['title', 'description', 'catalog_id', 'price'].filter(function (k) {
            return payload[k] === null || payload[k] === undefined || payload[k] === '';
        });
        // The condition is either status_id (old data model) or an item_attribute
        // with code "condition" (new one). Both are copied from the original.
        const hasCondition = payload.status_id !== null && payload.status_id !== undefined ||
            (payload.item_attributes || []).some(function (x) { return x.code === 'condition'; });
        if (!hasCondition) missing.push('condition');
        return missing;
    }

    function extractId(res) {
        if (!res) return null;
        const o = res.draft || res.item || res;
        return o && o.id ? String(o.id) : null;
    }

    // === PENDING ORIGINALS (to delete later) ===
    function readPending() {
        try { return JSON.parse(localStorage.getItem(LS_PENDING_DELETE) || '[]'); } catch (e) { return []; }
    }
    function writePending(list) {
        try { localStorage.setItem(LS_PENDING_DELETE, JSON.stringify(list)); } catch (e) { warn('localStorage', e); }
    }
    function addPending(entry) {
        const list = readPending().filter(function (e) { return e.originalId !== entry.originalId; });
        list.push(entry);
        writePending(list);
    }
    function removePending(originalId) {
        writePending(readPending().filter(function (e) { return e.originalId !== originalId; }));
    }

    async function deleteOriginal(id) {
        await apiFetch('/items/' + id + '/delete', { method: 'POST' });
        removePending(id);
        log('Original deleted', id);
    }

    // === UI ===
    function ensureStyles() {
        if (document.getElementById('kv-styles')) return;
        const s = document.createElement('style');
        s.id = 'kv-styles';
        s.textContent = [
            '.kv-note{position:fixed;top:20px;right:20px;z-index:2147483647;padding:12px 18px;border-radius:6px;color:#fff;font:500 14px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:360px}',
            '.kv-note.info{background:#2c7a7b}.kv-note.success{background:#2f855a}.kv-note.error{background:#c53030}',
            '.kv-btn{padding:9px 16px;margin-left:8px;border:1px solid #bbb;border-radius:6px;background:#6c757d;color:#fff;font:500 13px system-ui,sans-serif;cursor:pointer}',
            '.kv-btn.soft{background:#d9f2f4;border-color:#bfe6ea;color:#007782}.kv-btn.grey{background:#e9ecee;border-color:#d3d7da;color:#4a4f54}.kv-btn.primary{background:#007782;border-color:#007782}.kv-btn.danger{background:#c53030;border-color:#c53030}.kv-btn.ghost{background:#fff;color:#333}',
            '.kv-progress{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}',
            '.kv-progress-box{display:flex;gap:18px;align-items:center;min-width:320px;max-width:90vw;padding:24px 30px;border-radius:12px;background:#d0343b;color:#fff;font:500 16px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)}',
            '.kv-spin{flex:none;width:28px;height:28px;border:4px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:kvspin 1s linear infinite}',
            '.kv-dots::after{content:"";animation:kvdots 1.4s steps(1,end) infinite}',
            '@keyframes kvspin{to{transform:rotate(360deg)}}',
            '@keyframes kvdots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}',
            '.kv-btn:disabled{opacity:.5;cursor:not-allowed}'
        ].join('');
        document.head.appendChild(s);
    }

    function notify(msg, type, link) {
        ensureStyles();
        document.querySelectorAll('.kv-note').forEach(function (n) { n.remove(); });
        const n = document.createElement('div');
        n.className = 'kv-note ' + (type || 'info');
        n.setAttribute('role', type === 'error' ? 'alert' : 'status');
        n.textContent = msg;
        if (link) {
            n.appendChild(document.createElement('br'));
            const a = document.createElement('a');
            a.href = link.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = link.text;
            a.style.cssText = 'color:#fff;text-decoration:underline;font-weight:600;';
            a.onclick = function (e) { e.stopPropagation(); };
            n.appendChild(a);
        }
        document.body.appendChild(n);
        // Vinted's header can sit above everything: if the note is covered,
        // move it below the header so it is always readable.
        const r = n.getBoundingClientRect();
        const topEl = document.elementFromPoint(r.left + 20, r.top + 10);
        if (topEl && !n.contains(topEl)) n.style.top = '150px';
        if (type === 'error') {
            // Errors stay until clicked so they cannot be missed.
            n.title = 'Click to close';
            n.style.cursor = 'pointer';
            n.onclick = function () { n.remove(); };
        } else {
            setTimeout(function () { n.remove(); }, CFG.NOTIFICATION_MS);
        }
    }

    function closePanel() {
        const p = document.getElementById(CFG.PANEL_ID);
        if (p) p.remove();
    }

    // lines: array of strings; buttons: [{label, cls, onClick}]
    function showPanel(title, lines, buttons) {
        ensureStyles();
        closePanel();
        const p = document.createElement('div');
        p.id = CFG.PANEL_ID;
        p.setAttribute('role', 'status');
        p.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483646;width:380px;max-width:calc(100vw - 40px);padding:14px;max-height:80vh;overflow-y:auto;background:#fff;color:#222;border:1px solid #d0d0d0;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.25);font:13px/1.5 system-ui,sans-serif;';
        const h = document.createElement('div');
        h.style.cssText = 'font-weight:600;margin-bottom:6px;';
        h.textContent = title;
        p.appendChild(h);
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0 0 10px 18px;padding:0;';
        lines.forEach(function (t) {
            const li = document.createElement('li');
            li.textContent = t;
            ul.appendChild(li);
        });
        p.appendChild(ul);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:flex-end;flex-wrap:wrap;gap:6px;';
        (buttons || []).concat([{ label: 'Close', cls: 'ghost', onClick: closePanel }]).forEach(function (b) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'kv-btn ' + (b.cls || '');
            btn.style.marginLeft = '0';
            btn.textContent = b.label;
            btn.onclick = function () { b.onClick(btn); };
            row.appendChild(btn);
        });
        p.appendChild(row);
        document.body.appendChild(p);
    }

    function setToolbarBusy(busy) {
        document.querySelectorAll('#' + CFG.TOOLBAR_ID + ' button').forEach(function (b) { b.disabled = busy; });
    }

    // Relist deletes the original once the draft is created and verified, so it
    // asks first (in-page panel; the browser's confirm() can be blocked).
    function confirmRelist() {
        return new Promise(function (resolve) {
            showPanel('Relist this listing?', [
                'A new draft with all photos and data is created.',
                'When the draft is created and checked, THIS original listing is deleted. Its views and favourites are lost.',
                'Nothing is published automatically: you publish the draft yourself.',
                'If the check finds differences, the original is kept.',
                'Want to keep the favourites? Use Duplicate instead.'
            ], [{
                label: 'Relist and delete original', cls: 'danger',
                onClick: function () { closePanel(); resolve(true); }
            }]);
        });
    }

    // Progress banner: "Creating listing ..." with a spinner and the current step.
    function progressShow(step) {
        ensureStyles();
        let p = document.getElementById('kv-progress');
        if (!p) {
            p = document.createElement('div');
            p.id = 'kv-progress';
            p.className = 'kv-progress';
            p.setAttribute('role', 'status');
            const boxEl = document.createElement('div');
            boxEl.className = 'kv-progress-box';
            const spin = document.createElement('div');
            spin.className = 'kv-spin';
            const text = document.createElement('div');
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:700;font-size:20px;';
            title.appendChild(document.createTextNode('Creating listing'));
            const dots = document.createElement('span');
            dots.className = 'kv-dots';
            title.appendChild(dots);
            const stepEl = document.createElement('div');
            stepEl.className = 'kv-step';
            stepEl.style.cssText = 'margin-top:4px;';
            const hint = document.createElement('div');
            hint.textContent = 'Please keep this tab open.';
            hint.style.cssText = 'margin-top:6px;font-size:12px;opacity:.85;';
            text.appendChild(title);
            text.appendChild(stepEl);
            text.appendChild(hint);
            boxEl.appendChild(spin);
            boxEl.appendChild(text);
            p.appendChild(boxEl);
            document.body.appendChild(p);
        }
        p.querySelector('.kv-step').textContent = step || '';
    }

    function progressHide() {
        const p = document.getElementById('kv-progress');
        if (p) p.remove();
    }

    // Turns technical errors into readable English plus a link for complaints.
    function showError(e, originalUntouched) {
        let text;
        switch (e && e.code) {
            case 'not_owner':
            case 'is_draft': text = e.message; break;
            case 'auth': text = 'Your Vinted session seems to have expired. Please reload the page or log in again.'; break;
            case 'network': text = 'Network problem. Please check your connection and try again.'; break;
            case 'incomplete': text = 'This listing cannot be copied because required data is missing: ' + String(e.message).replace(/^.*?: /, '') + '.'; break;
            default: text = 'Something went wrong: ' + ((e && e.message) || 'unknown error') + '.';
        }
        if (originalUntouched) text += ' Your original listing was not changed.';
        notify(text, 'error', { url: CFG.ISSUES_URL, text: 'Think this is a mistake? Report it on GitHub' });
    }

    // === MAIN FLOW ===
    // mode: 'duplicate' (copy only) | 'relist' (copy, original deleted afterwards on confirmation)
    // auto: true when started by the helper via URL hash (result goes back via localStorage)
    async function run(mode, auto, navigateToDraft) {
        const id = getItemId();
        setToolbarBusy(true);
        try {
            if (!id) throw coded('no_id', 'No item ID in the URL');
            log('Start (' + mode + (auto ? ', helper' : '') + ')', { id: id, version: VERSION });

            progressShow('Reading the listing');
            const loaded = await fetchItem(id);
            const item = loaded.item;

            if (!loaded.provesOwner && !isOwnItem(item, id)) {
                throw coded('not_owner', 'This is not your item. Only your own items can be duplicated.');
            }
            if (item.is_draft === true) {
                throw coded('is_draft', 'This listing is still a draft, so it cannot be relisted or duplicated.');
            }

            const tempUuid = crypto.randomUUID();
            const missing = missingFields(buildPayload(item, [], tempUuid));
            if (missing.length) throw coded('incomplete', 'Missing fields on the item: ' + missing.join(', '));

            const urls = photoUrls(item);
            if (!urls.length) throw coded('no_photos', 'No photos found on the item');

            const photoIds = [];
            for (let i = 0; i < urls.length; i++) {
                progressShow('Copying photo ' + (i + 1) + ' of ' + urls.length);
                let blob;
                try { blob = await downloadBlob(urls[i]); }
                catch (e) { throw coded('photo_download', 'Could not load photo ' + (i + 1) + ': ' + e.message); }
                photoIds.push(await uploadPhoto(blob, i, tempUuid));
            }

            progressShow('Creating the draft');
            const makeBody = function (withExtras) {
                const body = {};
                body[CFG.DRAFT_BODY_KEY] = buildPayload(item, photoIds, tempUuid, withExtras);
                body.feedback_id = null;
                body.parcel = null;
                body.push_up = false;
                body.upload_session_id = crypto.randomUUID();
                return body;
            };
            let res;
            let extrasDropped = false;
            try {
                res = await apiFetch(CFG.DRAFT_PATH, { method: 'POST', json: makeBody(true) });
            } catch (e) {
                // Vinted may reject unknown extra fields: retry once with the basic set.
                if (e.code !== 'http_400' && e.code !== 'http_422') throw e;
                warn('Draft rejected with extra fields, retrying without them', e.message);
                extrasDropped = true;
                res = await apiFetch(CFG.DRAFT_PATH, { method: 'POST', json: makeBody(false) });
            }
            const draftId = extractId(res);
            log('Draft created', { draftId: draftId, photos: photoIds.length });

            if (mode === 'relist') {
                addPending({ originalId: id, title: item.title, draftId: draftId, at: Date.now() });
            }

            progressShow('Checking the draft');
            const checkLines = await verifyDraft(item, draftId);
            if (extrasDropped) checkLines.unshift('Note: extra category fields were rejected by Vinted and left out.');

            if (auto) {
                log('Draft check', checkLines);
                try { localStorage.setItem(LS_RESULT_PREFIX + id, 'ok:' + (draftId || '')); } catch (e) { /* ignore */ }
                notify('Draft created - the helper takes over.', 'success');
            } else {
                const clean = checkLines.length === 1 && /no differences/.test(checkLines[0]);
                let deleted = false;
                if (mode === 'relist' && clean && draftId) {
                    // The user confirmed this in the popup; only done after a clean check.
                    progressShow('Deleting the original listing');
                    try { await deleteOriginal(id); deleted = true; }
                    catch (e) {
                        warn('Deleting the original failed', e);
                        checkLines.push('Could not delete the original (' + e.message + '). Please delete it yourself.');
                    }
                } else if (mode === 'relist') {
                    checkLines.push('The original was kept because the draft could not be fully verified. Review the draft first.');
                }
                progressHide();
                if (navigateToDraft && clean && draftId && (mode !== 'relist' || deleted)) {
                    // Started from the profile: this tab simply becomes the draft.
                    location.assign(draftUrl(draftId));
                    return;
                }
                if (draftId) openDraft(draftId);
                showSuccessPanel(mode, id, item.title, photoIds.length, draftId, checkLines, deleted);
            }
        } catch (e) {
            err('Failed', e);
            const code = e.code || 'exception';
            if (auto && id) {
                try { localStorage.setItem(LS_RESULT_PREFIX + id, 'error:' + code + ':' + (e.message || '')); } catch (x) { /* ignore */ }
            }
            showError(e, true);
        } finally {
            progressHide();
            setToolbarBusy(false);
        }
    }

    // Opens the new draft in its own tab. The edit URL is an assumption:
    // if it 404s, the drafts are also listed in your profile.
    function draftUrl(draftId) {
        return location.origin + '/items/' + draftId + '/edit';
    }

    function openDraft(draftId) {
        const url = draftUrl(draftId);
        try {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, { active: true, insert: true, setParent: true });
                return;
            }
        } catch (e) { warn('GM_openInTab failed', e); }
        window.open(url, '_blank');
    }

    function showSuccessPanel(mode, id, title, photoCount, draftId, checkLines, deleted) {
        const lines = [
            'Draft created with ' + photoCount + ' photo(s): ' + title,
            'You will find it among the drafts in your profile. Review it and publish it yourself.'
        ];
        (checkLines || []).forEach(function (l) { lines.push(l); });
        const buttons = [];
        if (draftId) buttons.push({ label: 'Open draft', cls: 'primary', onClick: function () { openDraft(draftId); } });
        if (mode === 'relist' && deleted) lines.push('The original listing was deleted.');
        if (mode === 'relist' && !deleted) {
            lines.push('The original is still online. Only delete it once the new item is published.');
            buttons.push({
                label: 'Delete original now', cls: 'danger',
                onClick: async function (btn) {
                    if (!confirm('Really delete the original?\n\nOnly do this once the new item is published.')) return;
                    btn.disabled = true;
                    try {
                        await deleteOriginal(id);
                        notify('Original deleted.', 'success');
                        closePanel();
                    } catch (e) {
                        btn.disabled = false;
                        notify('Deleting failed (' + e.message + ') - please delete it manually.', 'error');
                    }
                }
            });
        }
        showPanel('Done', lines, buttons);
    }

    // Read-only: shows which fields the API delivers and what would be used.
    async function diagnose() {
        const id = getItemId();
        setToolbarBusy(true);
        try {
            const loaded = await fetchItem(id);
            const item = loaded.item;
            const payload = buildPayload(item, [], 'diagnose');
            const missing = missingFields(payload);
            const own = loaded.provesOwner || isOwnItem(item, id);
            console.log('[KV-Relist] Diagnosis: loaded via ' + loaded.path);
            console.log('[KV-Relist] Diagnosis: raw item', item);
            console.log('[KV-Relist] Diagnosis: draft data (without photos)', payload);
            const hint = Object.keys(item).filter(function (k) { return /status|condition|size|catalog|categ/i.test(k); })
                .map(function (k) { return k + '=' + String(JSON.stringify(item[k])).slice(0, 40); }).join(', ');
            showPanel('Test (nothing was changed)', [
                'Recognized as your own item: ' + (own ? 'yes' : 'NO - duplicating would be refused'),
                'Photos: ' + photoUrls(item).length,
                'Missing required fields: ' + (missing.length ? missing.join(', ') : 'none'),
                'Brand: ' + (payload.brand_id ? 'ok' : 'not set') + ', size: ' + (payload.size_id ? 'ok' : 'not set') +
                    ', parcel size: ' + (payload.package_size_id ? 'ok' : 'not set'),
                'Sources: ' + loaded.report.join(' | '),
                'Attributes: ' + (JSON.stringify(payload.item_attributes) || '').slice(0, 400),
                'Related fields: ' + (hint || 'none'),
                'All fields: ' + Object.keys(item).join(', ').slice(0, 500),
                'Details are in the browser console (F12) under [KV-Relist].'
            ]);
        } catch (e) {
            err('Test failed', e);
            showError(e);
        } finally {
            setToolbarBusy(false);
        }
    }

    // === TOOLBAR ===
    function createToolbar() {
        if (document.getElementById(CFG.TOOLBAR_ID)) return;
        ensureStyles();
        const bar = document.createElement('div');
        bar.id = CFG.TOOLBAR_ID;
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Duplicate or relist item');
        bar.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;gap:4px;padding:10px;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.25);';

        const mk = function (label, cls, title, fn) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'kv-btn ' + cls;
            b.style.marginLeft = '0';
            b.textContent = label;
            b.title = title;
            b.onclick = function (e) { e.preventDefault(); fn(); };
            bar.appendChild(b);
        };
        mk('Relist', 'primary', 'Creates a draft; you delete the original yourself afterwards', function () { confirmRelist().then(function (ok) { if (ok) run('relist', false, false); }); });
        mk('Duplicate', 'soft', 'Creates a copy as a draft, the original stays', function () { run('duplicate', false, false); });
        mk('Test', 'grey', 'Read-only: checks that all data is available', diagnose);
        document.body.appendChild(bar);
        log('Toolbar created (v' + VERSION + ')');
    }

    function waitFor(fn, timeoutMs) {
        return new Promise(function (resolve) {
            if (fn()) return resolve(true);
            const t0 = Date.now();
            const iv = setInterval(function () {
                if (fn()) { clearInterval(iv); resolve(true); }
                else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); resolve(false); }
            }, 300);
        });
    }

    // === START ===
    async function init() {
        const id = getItemId();
        if (!id) return;
        // Only the plain item page (/items/123-title). Edit and draft pages
        // (/items/123/edit ...) must not show the buttons: they could be
        // mistaken for Vinted's own upload controls.
        if (!/^\/items\/\d+[^\/]*\/?$/.test(location.pathname)) return;

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Show duplicate toolbar on this page', createToolbar);
        }

        // Started by the helper: the hash selects the mode. The hash is removed
        // right away so that a reload does not start the process a second time.
        const hash = location.hash;
        if (hash === '#kvRelist' || hash === '#kvDuplicate') {
            history.replaceState(null, '', location.pathname + location.search);
            await waitFor(function () { return document.readyState === 'complete'; }, 10000);
            await new Promise(function (r) { setTimeout(r, 1500); });
            run(hash === '#kvRelist' ? 'relist' : 'duplicate', true);
            return;
        }

        // Started from a card button on the profile: show the preview / test
        // here, so the user decides with one more click.
        const previewHashes = { '#kvRunDuplicate': 'duplicate', '#kvRunRelist': 'relist', '#kvTest': 'test' };
        if (previewHashes[hash]) {
            history.replaceState(null, '', location.pathname + location.search);
            await waitFor(function () { return document.readyState === 'complete'; }, 10000);
            await new Promise(function (r) { setTimeout(r, 1000); });
            if (previewHashes[hash] === 'test') { createToolbar(); diagnose(); }
            else if (previewHashes[hash] === 'relist') confirmRelist().then(function (ok) { if (ok) run('relist', false, true); });
            else run('duplicate', false, true);
            return;
        }

        // Toolbar only on your own items: those have an edit link.
        // Always show the toolbar on item pages. Ownership detection is not
        // reliable enough to hide it; other people's items are refused on use.
        createToolbar();
    }

    init();
})();