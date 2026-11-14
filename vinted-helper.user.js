// ==UserScript==
// @name          Vinted - Relist Helper
// @namespace     https://github.com/NeKaBe/vinted-relister
// @description   Helper for the Vinted Relister: select items on your profile and recreate them one after another (with a random pause) as drafts. Lists originals that are still waiting to be deleted.
// @icon          https://www.vinted.com/favicon.ico
// @copyright     2026
// @license       MIT
// @version       0.3.4
// @author        NeKaBe
// @credits       OldRon1977 - idea, batch overlay and pause concept of the Kleinanzeigen helper: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @match         https://www.vinted.de/member/*
// @match         https://www.vinted.com/member/*
// @match         https://www.vinted.co.uk/member/*
// @match         https://www.vinted.fr/member/*
// @match         https://www.vinted.it/member/*
// @match         https://www.vinted.es/member/*
// @match         https://www.vinted.nl/member/*
// @match         https://www.vinted.be/member/*
// @match         https://www.vinted.at/member/*
// @match         https://www.vinted.pl/member/*
// @match         https://www.vinted.cz/member/*
// @match         https://www.vinted.lt/member/*
// @match         https://www.vinted.pt/member/*
// @match         https://www.vinted.lu/member/*
// @match         https://www.vinted.se/member/*
// @match         https://www.vinted.dk/member/*
// @match         https://www.vinted.fi/member/*
// @match         https://www.vinted.sk/member/*
// @match         https://www.vinted.hu/member/*
// @match         https://www.vinted.ro/member/*
// @match         https://www.vinted.hr/member/*
// @homepage      https://github.com/NeKaBe/vinted-relister
// @supportURL     https://github.com/NeKaBe/vinted-relister/issues
// @contributionURL https://ko-fi.com/nekabe
// @updateURL      https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-helper.user.js
// @downloadURL    https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-helper.user.js
// @run-at        document-idle
// @noframes
// @grant         GM_openInTab
// @grant         GM_registerMenuCommand
// ==/UserScript==

/*
 * Requires vinted-relist.user.js as well. For each item the helper opens a tab
 * with #kvRelist or #kvDuplicate; the relister script does the work and reports
 * the result back through localStorage.
 *
 * Nothing is published automatically. In batch mode nothing is deleted
 * automatically either: you delete originals with one click in the
 * "Pending originals" list once the new items are published.
 */

(function () {
    'use strict';

    const VERSION = '0.3.4';

    const CFG = {
        // Downloading and uploading photos takes time; generous buffer per item.
        RESULT_TIMEOUT_MS: 240 * 1000,
        DEFAULT_MIN_MINUTES: 2,
        DEFAULT_MAX_MINUTES: 5,
        LIMIT_MAX_MINUTES: 180,
        REQUEST_TIMEOUT_MS: 20000
    };

    // Shared protocol with vinted-relist.user.js: keep these values in sync.
    const LS_RESULT_PREFIX = 'kv-result-';
    const LS_PENDING_DELETE = 'kv-pending-delete';
    const LS_DELAY = 'kv-delay';

    const LAUNCHER_ID = 'kv-launcher';
    const OVERLAY_ID = 'kv-overlay';

    const log = (m, d) => console.log('[KV-Helper] ' + m, d === undefined ? '' : d);
    const warn = (m, d) => console.warn('[KV-Helper] ' + m, d === undefined ? '' : d);

    let forcedEnabled = false;
    let stopRequested = false;

    // === SESSION (copied from the relister, the scripts cannot share code) ===
    function getCsrf() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) return meta.content;
        const m = /\\?"CSRF_TOKEN\\?"\s*:\s*\\?"([^"\\]+)/.exec(document.documentElement.innerHTML);
        if (m) return m[1];
        throw new Error('CSRF token not found (reload the page or log in again)');
    }

    function getAnonId() {
        const m = /(?:^|;\s*)anon_id=([^;]+)/.exec(document.cookie);
        return m ? decodeURIComponent(m[1]) : null;
    }

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

    async function apiPost(path) {
        const headers = { accept: 'application/json, text/plain, */*', 'x-csrf-token': getCsrf() };
        const anon = getAnonId();
        if (anon) headers['x-anon-id'] = anon;
        const ctrl = new AbortController();
        const timer = setTimeout(function () { ctrl.abort(); }, CFG.REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch('/api/v2' + path, {
                method: 'POST', headers: headers, credentials: 'same-origin', signal: ctrl.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
        } catch (e) {
            throw new Error(e.name === 'AbortError' ? 'Timeout' : e.message);
        } finally {
            clearTimeout(timer);
        }
    }

    // === OWN PROFILE? ===
    function memberIdFromUrl() {
        const m = /^\/member\/(\d+)/.exec(location.pathname);
        return m ? m[1] : null;
    }

    function isOwnProfile() {
        if (forcedEnabled) return true;
        // Cheap DOM check first: the observer calls this often, and
        // detectOwnUserId() serializes the whole page HTML.
        if (document.querySelector('main a[href*="/settings/profile"]')) return true;
        const own = detectOwnUserId();
        return !!(own && memberIdFromUrl() === own);
    }

    // === ITEMS FROM THE PAGE ===
    // Only what is loaded on the page counts. With many items, scroll to the
    // bottom first or click "show more".
    function collectItems() {
        const map = new Map();
        document.querySelectorAll('a[href*="/items/"]').forEach(function (a) {
            const m = /\/items\/(\d+)/.exec(a.getAttribute('href') || '');
            if (!m) return;
            const id = m[1];
            const raw = a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '';
            const title = raw.replace(/\s+/g, ' ').trim().slice(0, 90);
            const known = map.get(id);
            if (!known) map.set(id, { id: id, title: title || ('Item ' + id) });
            else if (title && known.title === 'Item ' + id) known.title = title;
        });
        return Array.from(map.values());
    }

    // === PAUSE ===
    function defaultDelay() { return { min: CFG.DEFAULT_MIN_MINUTES, max: CFG.DEFAULT_MAX_MINUTES }; }

    function validateDelay(minRaw, maxRaw) {
        const parse = function (v) {
            const s = String(v === null || v === undefined ? '' : v).trim();
            if (!/^\d{1,4}$/.test(s)) return null;
            const n = parseInt(s, 10);
            return n <= CFG.LIMIT_MAX_MINUTES ? n : null;
        };
        const min = parse(minRaw);
        const max = parse(maxRaw);
        if (min === null || max === null) return { ok: false, reason: 'range' };
        if (min > max) return { ok: false, reason: 'order' };
        return { ok: true, min: min, max: max };
    }

    function loadDelay() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_DELAY) || 'null');
            const v = raw && validateDelay(raw.min, raw.max);
            return v && v.ok ? { min: v.min, max: v.max } : defaultDelay();
        } catch (e) { return defaultDelay(); }
    }

    function saveDelay(cfg) {
        try { localStorage.setItem(LS_DELAY, JSON.stringify(cfg)); } catch (e) { warn('localStorage', e); }
    }

    // Millisecond resolution: rounded minutes would be a suspiciously regular pattern.
    function randomDelayMs(cfg) {
        if (cfg.min === 0 && cfg.max === 0) return 0;
        return Math.round(cfg.min * 60000 + Math.random() * (cfg.max - cfg.min) * 60000);
    }

    function formatRemaining(ms) {
        const sec = Math.round(ms / 1000);
        return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
    }

    // true = waited it out, false = cancelled. Stop is checked on every tick.
    function waitMs(ms, onTick) {
        return new Promise(function (resolve) {
            const t0 = Date.now();
            const step = function () {
                if (stopRequested) { clearInterval(id); resolve(false); return; }
                const rest = Math.max(0, ms - (Date.now() - t0));
                if (onTick) onTick(rest);
                if (rest <= 0) { clearInterval(id); resolve(true); }
            };
            const id = setInterval(step, 1000);
            step();
        });
    }

    // === PENDING ORIGINALS ===
    function readPending() {
        try { return JSON.parse(localStorage.getItem(LS_PENDING_DELETE) || '[]'); } catch (e) { return []; }
    }
    function writePending(list) {
        try { localStorage.setItem(LS_PENDING_DELETE, JSON.stringify(list)); } catch (e) { warn('localStorage', e); }
    }
    function removePending(originalId) {
        writePending(readPending().filter(function (e) { return e.originalId !== originalId; }));
    }

    // === WORKER TAB ===
    // mode: 'relist' | 'duplicate'. Resolves to { ok, draftId } or { ok:false, code, error }.
    function processOne(item, mode) {
        return new Promise(function (resolve) {
            const lsKey = LS_RESULT_PREFIX + item.id;
            const url = location.origin + '/items/' + item.id + (mode === 'relist' ? '#kvRelist' : '#kvDuplicate');
            try { localStorage.removeItem(lsKey); } catch (e) { /* ignore */ }

            let tab = null;
            try {
                if (typeof GM_openInTab === 'function') tab = GM_openInTab(url, { active: true, insert: true, setParent: true });
            } catch (e) { warn('GM_openInTab failed', e); }
            if (!tab) {
                const w = window.open(url, '_blank');
                if (!w) { resolve({ ok: false, code: 'popup_blocked', error: 'Popup blocked' }); return; }
                tab = { close: function () { try { w.close(); } catch (e) { /* ignore */ } } };
            }

            let done = false;
            const finish = function (payload, closeTab) {
                if (done) return;
                done = true;
                window.removeEventListener('storage', onStorage);
                clearInterval(poll);
                clearTimeout(timeout);
                if (closeTab) { try { tab.close(); } catch (e) { /* ignore */ } }
                try { localStorage.removeItem(lsKey); } catch (e) { /* ignore */ }
                resolve(payload);
            };
            const handle = function (raw) {
                if (!raw) return;
                if (raw.indexOf('ok:') === 0) {
                    finish({ ok: true, draftId: raw.slice(3) || null }, true);
                } else if (raw.indexOf('error:') === 0) {
                    const parts = raw.slice(6).split(':');
                    // Leave the tab open on errors so the message stays visible.
                    finish({ ok: false, code: parts[0] || 'unknown', error: parts.slice(1).join(':') }, false);
                }
            };
            const onStorage = function (e) { if (e.key === lsKey) handle(e.newValue); };
            window.addEventListener('storage', onStorage);
            const poll = setInterval(function () {
                try { handle(localStorage.getItem(lsKey)); } catch (e) { /* ignore */ }
            }, 1000);
            const timeout = setTimeout(function () {
                finish({ ok: false, code: 'timeout', error: 'No result from the tab (outcome unknown - check your drafts)' }, false);
            }, CFG.RESULT_TIMEOUT_MS);
        });
    }

    // === UI ===
    function el(tag, css, text) {
        const e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function btn(label, primary, onClick) {
        const b = el('button', primary
            ? 'padding:6px 14px;border:1px solid #007782;border-radius:4px;background:#007782;color:#fff;cursor:pointer;font-weight:600;'
            : 'padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;color:#222;cursor:pointer;', label);
        b.type = 'button';
        if (onClick) b.onclick = onClick;
        return b;
    }

    function linkBtn(label, onClick) {
        const b = el('button', 'background:none;border:none;padding:0;color:#007782;cursor:pointer;font-size:12px;text-decoration:underline;', label);
        b.type = 'button';
        b.onclick = onClick;
        return b;
    }

    function ensureOverlay() {
        let o = document.getElementById(OVERLAY_ID);
        if (o) return o;
        o = el('div', [
            'position:fixed', 'top:20px', 'right:20px', 'width:400px', 'max-width:calc(100vw - 40px)', 'max-height:85vh', 'overflow-y:auto',
            'background:#fff', 'color:#222', 'border:1px solid #d0d0d0', 'border-radius:8px',
            'box-shadow:0 6px 24px rgba(0,0,0,.18)', 'z-index:100000', 'font:13px system-ui,sans-serif'
        ].join(';'));
        o.id = OVERLAY_ID;
        document.body.appendChild(o);
        return o;
    }

    function closeOverlay() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
    }

    function header(title) {
        const h = el('div', 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;display:flex;justify-content:space-between;align-items:center;');
        h.appendChild(el('span', '', title));
        const x = el('button', 'background:none;border:none;cursor:pointer;font-size:16px;color:#888;', '\u2715');
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        x.onclick = closeOverlay;
        h.appendChild(x);
        return h;
    }

    function appendPendingSection(parent) {
        const list = readPending();
        if (!list.length) return;
        const sec = el('div', 'padding:10px 14px;border-top:1px solid #eee;background:#fff7e6;');
        sec.appendChild(el('div', 'font-weight:600;color:#a06200;margin-bottom:4px;', 'Pending originals (' + list.length + ')'));
        sec.appendChild(el('div', 'font-size:11px;color:#777;margin-bottom:6px;',
            'These items have a draft. Only delete the original once the new item is published.'));
        list.forEach(function (p) {
            const row = el('div', 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin:4px 0;');
            row.appendChild(el('span', 'flex:1;font-size:12px;color:#555;', (p.title || 'Item') + ' (ID ' + p.originalId + ')'));
            const del = btn('Delete original', false);
            del.style.cssText += 'color:#c53030;border-color:#c53030;font-size:11px;padding:2px 8px;';
            del.onclick = async function () {
                if (!confirm('Really delete the original "' + (p.title || p.originalId) + '"?\n\nOnly do this once the new item is published.')) return;
                del.disabled = true;
                try {
                    await apiPost('/items/' + p.originalId + '/delete');
                    removePending(p.originalId);
                    row.remove();
                } catch (e) {
                    del.disabled = false;
                    alert('Deleting failed (' + e.message + '). Please delete it manually.');
                }
            };
            const skip = linkBtn('Remove entry', function () { removePending(p.originalId); row.remove(); });
            row.appendChild(del);
            row.appendChild(skip);
            sec.appendChild(row);
        });
        parent.appendChild(sec);
    }

    function renderSelect() {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';
        overlay.appendChild(header('Batch relist items'));

        const items = collectItems();
        const selected = new Set();

        const summary = el('div', 'padding:10px 14px;border-bottom:1px solid #eee;');
        const line1 = el('div');
        const line2 = el('div', 'color:#666;margin-top:4px;font-size:12px;');
        summary.appendChild(line1);
        summary.appendChild(line2);
        overlay.appendChild(summary);

        if (!items.length) {
            line1.textContent = 'No items found on this page.';
            line2.textContent = 'Open your profile and load all items (scroll down), then try again.';
            appendPendingSection(overlay);
            return;
        }

        const modeBox = el('div', 'padding:8px 14px;border-bottom:1px solid #eee;font-size:12px;');
        let mode = 'relist';
        [['relist', 'Relist: create a draft, delete the original afterwards on confirmation'],
         ['duplicate', 'Duplicate only: create a draft, the original stays']].forEach(function (opt) {
            const label = el('label', 'display:flex;gap:6px;align-items:flex-start;margin:2px 0;cursor:pointer;');
            const r = el('input');
            r.type = 'radio';
            r.name = 'kv-mode';
            r.checked = opt[0] === mode;
            r.onchange = function () { mode = opt[0]; };
            label.appendChild(r);
            label.appendChild(el('span', '', opt[1]));
            modeBox.appendChild(label);
        });
        overlay.appendChild(modeBox);

        const ul = el('ul', 'margin:0;padding:8px 14px;max-height:230px;overflow-y:auto;list-style:none;');
        const boxes = [];
        items.forEach(function (it) {
            const li = el('li', 'margin:3px 0;');
            const label = el('label', 'display:flex;gap:8px;align-items:flex-start;cursor:pointer;');
            const cb = el('input', 'margin-top:2px;flex:none;');
            cb.type = 'checkbox';
            cb.onchange = function () {
                if (cb.checked) selected.add(it.id); else selected.delete(it.id);
                update();
            };
            label.appendChild(cb);
            const t = el('div');
            t.appendChild(el('div', 'font-weight:500;', it.title));
            t.appendChild(el('div', 'color:#666;font-size:12px;', 'ID ' + it.id));
            label.appendChild(t);
            li.appendChild(label);
            ul.appendChild(li);
            boxes.push({ it: it, cb: cb });
        });
        overlay.appendChild(ul);

        const bulk = el('div', 'padding:0 14px 8px;display:flex;gap:12px;');
        bulk.appendChild(linkBtn('All', function () {
            boxes.forEach(function (b) { b.cb.checked = true; selected.add(b.it.id); });
            update();
        }));
        bulk.appendChild(linkBtn('None', function () {
            boxes.forEach(function (b) { b.cb.checked = false; });
            selected.clear();
            update();
        }));
        overlay.appendChild(bulk);

        // Pause
        let delayCfg = loadDelay();
        let delayState = { ok: true, min: delayCfg.min, max: delayCfg.max };
        const delaySec = el('div', 'padding:10px 14px;border-top:1px solid #eee;');
        delaySec.appendChild(el('div', 'font-weight:600;margin-bottom:6px;', 'Pause between two items'));
        const row = el('div', 'display:flex;gap:14px;align-items:center;');
        const mkField = function (label, value) {
            const w = el('label', 'display:flex;gap:5px;align-items:center;font-size:12px;');
            w.appendChild(document.createTextNode(label));
            const i = el('input', 'width:64px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;');
            i.type = 'number';
            i.min = '0';
            i.max = String(CFG.LIMIT_MAX_MINUTES);
            i.value = String(value);
            w.appendChild(i);
            w.appendChild(document.createTextNode('min'));
            row.appendChild(w);
            return i;
        };
        const minIn = mkField('from', delayCfg.min);
        const maxIn = mkField('to', delayCfg.max);
        delaySec.appendChild(row);
        const delayNote = el('div', 'margin-top:6px;font-size:11px;line-height:1.4;');
        delaySec.appendChild(delayNote);
        overlay.appendChild(delaySec);

        const onDelay = function () {
            delayState = validateDelay(minIn.value, maxIn.value);
            if (delayState.ok) { delayCfg = { min: delayState.min, max: delayState.max }; saveDelay(delayCfg); }
            update();
        };
        minIn.oninput = onDelay;
        maxIn.oninput = onDelay;

        appendPendingSection(overlay);

        const actions = el('div', 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;');
        actions.appendChild(btn('Cancel', false, closeOverlay));
        const start = btn('Start', true);
        actions.appendChild(start);
        overlay.appendChild(actions);

        function update() {
            const count = selected.size;
            line1.textContent = '';
            const s = el('strong', '', String(count));
            line1.appendChild(s);
            line1.appendChild(document.createTextNode(' of ' + items.length + ' item(s) selected.'));

            if (!delayState.ok) {
                delayNote.style.color = '#c53030';
                delayNote.style.fontWeight = '600';
                delayNote.textContent = delayState.reason === 'order'
                    ? 'The first value must be less than or equal to the second.'
                    : 'Please enter whole minutes from 0 to ' + CFG.LIMIT_MAX_MINUTES + '.';
            } else if (delayState.min === 0 && delayState.max === 0) {
                delayNote.style.color = '#c53030';
                delayNote.style.fontWeight = '600';
                delayNote.textContent = 'Warning: without a pause all items run back to back. That looks like automated behavior and may get your account restricted.';
            } else {
                delayNote.style.color = '#666';
                delayNote.style.fontWeight = 'normal';
                delayNote.textContent = 'Before each further item the script waits a random time from this range. Values are stored locally.';
            }

            const cfgNow = delayState.ok ? delayState : delayCfg;
            const gaps = Math.max(0, count - 1);
            line2.textContent = count === 0
                ? 'Nothing selected.'
                : 'Estimated duration: about ' + (gaps * cfgNow.min) + '-' + (gaps * cfgNow.max) + ' minutes (plus photo transfer).';

            const blocked = count === 0 || !delayState.ok;
            start.disabled = blocked;
            start.style.opacity = blocked ? '0.5' : '1';
            start.style.cursor = blocked ? 'not-allowed' : 'pointer';
        }

        start.onclick = function () {
            if (!selected.size || !delayState.ok) return;
            const chosen = items.filter(function (it) { return selected.has(it.id); });
            stopRequested = false;
            runBatch(chosen, mode, { min: delayState.min, max: delayState.max });
        };
        update();
    }

    // Build the frame once, then only change texts: the Stop button must not be
    // recreated every second during the pause, or clicks would get lost.
    function buildProgressUi() {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';
        overlay.appendChild(el('div', 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;', 'Running …'));
        const body = el('div', 'padding:10px 14px;line-height:1.5;');
        const main = el('div');
        const cur = el('div', 'color:#666;margin-top:4px;');
        const eta = el('div', 'color:#666;margin-top:4px;');
        const ok = el('div', 'color:#2f855a;margin-top:6px;');
        const fail = el('div', 'color:#c53030;');
        [main, cur, eta, ok, fail].forEach(function (n) { body.appendChild(n); });
        overlay.appendChild(body);
        const actions = el('div', 'padding:10px 14px;border-top:1px solid #eee;display:flex;justify-content:flex-end;');
        const stop = btn('Stop', false);
        stop.style.borderColor = '#c53030';
        stop.style.color = '#c53030';
        stop.onclick = function () {
            stopRequested = true;
            stop.disabled = true;
            stop.textContent = 'Stopping …';
            cur.textContent = 'Stop requested - the current item will be finished first.';
        };
        actions.appendChild(stop);
        overlay.appendChild(actions);
        return { main: main, cur: cur, eta: eta, ok: ok, fail: fail };
    }

    async function runBatch(items, mode, delayCfg) {
        const ui = buildProgressUi();
        const done = [];
        const failed = [];
        const total = items.length;
        const refresh = function (label, etaText) {
            ui.main.textContent = (done.length + failed.length) + ' / ' + total + ' processed';
            if (label !== undefined && !stopRequested) ui.cur.textContent = 'Current: ' + label;
            ui.eta.textContent = etaText ? 'Next in: ' + etaText : '';
            ui.ok.textContent = 'OK: ' + done.length;
            ui.fail.textContent = 'Errors: ' + failed.length;
        };
        refresh('-');
        log('Batch started', { count: total, mode: mode, pause: delayCfg });

        for (let i = 0; i < items.length; i++) {
            if (stopRequested) break;
            const it = items[i];
            refresh(it.title + ' (ID ' + it.id + ')');
            const res = await processOne(it, mode);
            if (res.ok) done.push(it); else failed.push({ item: it, res: res });
            refresh('-');

            if (i < items.length - 1 && !stopRequested) {
                const wait = randomDelayMs(delayCfg);
                if (wait > 0) {
                    log('Waiting ' + Math.round(wait / 1000) + ' s');
                    await waitMs(wait, function (rest) { refresh(undefined, formatRemaining(rest)); });
                }
            }
        }
        renderDone(done, failed, mode);
    }

    function renderDone(done, failed, mode) {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';
        overlay.appendChild(header(stopRequested ? 'Stopped' : 'Done'));
        const body = el('div', 'padding:10px 14px;line-height:1.5;');
        body.appendChild(el('div', '', 'Drafts created: ' + done.length));
        body.appendChild(el('div', '', 'Errors: ' + failed.length));
        if (done.length) {
            body.appendChild(el('div', 'margin-top:8px;font-size:12px;color:#555;',
                'Review the drafts in your profile and publish them yourself.' +
                (mode === 'relist' ? ' Afterwards you can delete the originals below.' : '')));
        }
        if (failed.length) {
            const ul = el('ul', 'margin:6px 0 0 18px;color:#c53030;font-size:12px;');
            failed.forEach(function (f) {
                ul.appendChild(el('li', '', f.item.title + ': ' + (f.res.error || f.res.code) + ' [' + f.res.code + ']'));
            });
            body.appendChild(ul);
            body.appendChild(el('div', 'margin-top:6px;font-size:11px;color:#777;', 'On errors the original was not changed. The item\'s tab was left open.'));
        }
        overlay.appendChild(body);
        appendPendingSection(overlay);
        const actions = el('div', 'padding:10px 14px;border-top:1px solid #eee;display:flex;justify-content:flex-end;');
        actions.appendChild(btn('Close', false, closeOverlay));
        overlay.appendChild(actions);
        log('Batch finished', { ok: done.length, errors: failed.length });
    }

    // === BUTTONS ON EACH LISTING ===
    // Each button opens the item in a new tab, where the relister script shows
    // a preview (or the test) and waits for your click.
    const CARD_MARK = 'data-kv-card';

    function itemIdFromHref(h) {
        const m = /\/items\/(\d+)/.exec(h || '');
        return m ? m[1] : null;
    }

    // The card is the largest ancestor that still contains only this one item.
    function findCard(a) {
        let node = a;
        for (let i = 0; i < 6 && node.parentElement && node.parentElement !== document.body; i++) {
            const ids = new Set();
            node.parentElement.querySelectorAll('a[href*="/items/"]').forEach(function (x) {
                const id = itemIdFromHref(x.getAttribute('href'));
                if (id) ids.add(id);
            });
            if (ids.size > 1) break;
            node = node.parentElement;
        }
        return node;
    }

    function openItemTab(id, hash) {
        const url = location.origin + '/items/' + id + hash;
        try {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, { active: true, insert: true, setParent: true });
                return;
            }
        } catch (e) { warn('GM_openInTab failed', e); }
        window.open(url, '_blank');
    }

    // Drafts and listings still in review must not get buttons. Two signals:
    // a link that is not a plain item page (e.g. /items/123/edit), and the
    // status label on the card. The label check is only a visibility hint
    // (several languages); the relister script also refuses drafts by data.
    const PLAIN_ITEM_PATH = /^\/items\/\d+[^\/]*\/?$/;
    const NOT_READY_TEXT = /entwurf|fertigstellen|verarbeitung|prüfung|draft|processing|under review|in review|brouillon|bozza|borrador|rascunho|concept|wersja robocza/i;

    function isNotReady(card) {
        return NOT_READY_TEXT.test(card.textContent || '');
    }

    // Narrow cards: one "Actions" button with a small menu instead of three buttons.
    function isCompact(card) {
        const w = card.getBoundingClientRect().width;
        return w > 0 && w < 260;
    }

    const ROW_ACTIONS = [['Relist', '#kvRunRelist', 'relist'], ['Duplicate', '#kvRunDuplicate', 'duplicate'], ['Test', '#kvTest', 'test']];
    // Vinted's three colours: teal, soft teal, grey.
    const ROW_STYLES = {
        relist: 'background:#007782;border:1px solid #007782;color:#fff;',
        duplicate: 'background:#d9f2f4;border:1px solid #bfe6ea;color:#007782;',
        test: 'background:#e9ecee;border:1px solid #d3d7da;color:#4a4f54;'
    };
    const BTN_BASE = 'min-width:0;white-space:nowrap;padding:7px 2px;font:600 12px system-ui,sans-serif;border-radius:6px;cursor:pointer;';
    let menuCloserAdded = false;

    // Set once a strip turned out to be invisible (clipped or hidden by Vinted's
    // layout, e.g. in the phone layout): from then on, buttons sit on the photo.
    let forceOverlay = false;

    function wantedMode(card) {
        return forceOverlay ? 'overlay' : (isCompact(card) ? 'compact' : 'full');
    }

    function buildRow(id, mode) {
        const compact = mode !== 'full';
        const row = el('div', mode === 'overlay'
            ? 'position:absolute;top:8px;left:8px;z-index:5;'
            : 'box-sizing:border-box;width:100%;padding:0 7px;margin:0 0 3px;position:relative;');
        row.className = 'kv-row';
        row.setAttribute('data-kv-mode', mode);
        const action = function (hash) {
            return function (e) {
                e.preventDefault();
                e.stopPropagation();
                openItemTab(id, hash);
            };
        };
        if (!compact) {
            row.style.display = 'flex';
            row.style.gap = '6px';
            ROW_ACTIONS.forEach(function (d) {
                const b = btn(d[0], false, action(d[1]));
                b.style.cssText = 'flex:1 1 0;' + BTN_BASE + ROW_STYLES[d[2]];
                row.appendChild(b);
            });
            return row;
        }
        const menu = el('div', (mode === 'overlay' ? 'display:none;position:absolute;left:0;top:100%;min-width:130px;' : 'display:none;position:absolute;left:7px;right:7px;top:100%;') + 'z-index:1000;box-sizing:border-box;padding:4px;background:#fff;border:1px solid #d3d7da;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2);');
        menu.setAttribute('data-kv-menu', '1');
        ROW_ACTIONS.forEach(function (d) {
            const b = btn(d[0], false, action(d[1]));
            b.style.cssText = 'display:block;width:100%;margin:2px 0;' + BTN_BASE + ROW_STYLES[d[2]];
            menu.appendChild(b);
        });
        const toggle = btn('Actions \u25BE', false, function (e) {
            e.preventDefault();
            e.stopPropagation();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
        toggle.style.cssText = (mode === 'overlay' ? 'display:block;padding:7px 10px;box-shadow:0 2px 8px rgba(0,0,0,.3);' : 'display:block;width:100%;') + BTN_BASE + ROW_STYLES.relist;
        row.appendChild(toggle);
        row.appendChild(menu);
        if (!menuCloserAdded) {
            menuCloserAdded = true;
            document.addEventListener('click', function () {
                document.querySelectorAll('[data-kv-menu]').forEach(function (m) { m.style.display = 'none'; });
            });
        }
        return row;
    }

    // Puts the right kind of row into the card (or keeps the existing one) and
    // checks shortly afterwards that it can actually be seen.
    function placeRow(card, id) {
        const mode = wantedMode(card);
        const old = card.querySelector('.kv-row');
        if (old && old.getAttribute('data-kv-mode') === mode) return;
        if (old) old.remove();
        if (mode === 'overlay' && getComputedStyle(card).position === 'static') card.style.position = 'relative';
        const row = buildRow(id, mode);
        card.insertBefore(row, card.firstChild);
        if (mode === 'overlay') return;
        setTimeout(function () {
            if (!row.isConnected) return;
            const r = row.getBoundingClientRect();
            const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
            const cx = r.left + r.width / 2;
            const cy = r.top + Math.max(r.height, 1) / 2;
            const hit = onScreen ? document.elementFromPoint(cx, cy) : null;
            const hidden = r.height < 10 || r.width < 10 || (onScreen && hit && !row.contains(hit));
            if (hidden) {
                warn('Button strip not visible, switching to overlay buttons');
                forceOverlay = true;
                decorateCards();
            }
        }, 150);
    }

    function decorateCards() {
        if (!isOwnProfile()) return;

        // Group the links by item; one non-plain link marks the item as a draft.
        const items = new Map();
        document.querySelectorAll('a[href*="/items/"]').forEach(function (a) {
            const id = itemIdFromHref(a.getAttribute('href'));
            if (!id) return;
            let path = '';
            try { path = new URL(a.href, location.origin).pathname; } catch (e) { return; }
            const entry = items.get(id) || { plainAnchor: null, draftLink: false };
            if (PLAIN_ITEM_PATH.test(path)) { if (!entry.plainAnchor) entry.plainAnchor = a; }
            else entry.draftLink = true;
            items.set(id, entry);
        });

        // Existing cards: drop the strip from drafts / listings in review, put it
        // back if Vinted re-rendered the card, and switch between full and compact.
        document.querySelectorAll('[' + CARD_MARK + ']').forEach(function (card) {
            const id = card.getAttribute(CARD_MARK);
            const entry = items.get(id);
            if ((entry && entry.draftLink) || isNotReady(card)) {
                card.querySelectorAll('.kv-row').forEach(function (r) { r.remove(); });
                card.removeAttribute(CARD_MARK);
                return;
            }
            placeRow(card, id);
        });

        items.forEach(function (entry, id) {
            if (!entry.plainAnchor || entry.draftLink) return;
            // One strip per item, even if the page shows it in several places.
            if (document.querySelector('[' + CARD_MARK + '="' + id + '"]')) return;
            const card = findCard(entry.plainAnchor);
            if (card.getAttribute(CARD_MARK) || isNotReady(card)) return;
            card.setAttribute(CARD_MARK, id);
            placeRow(card, id);
        });
    }

    // === LAUNCHER ===
    function addLauncher() {
        if (document.getElementById(LAUNCHER_ID)) return;
        if (!isOwnProfile()) return;
        const b = el('button', [
            'position:fixed', 'bottom:20px', 'left:20px', 'z-index:99999', 'padding:10px 16px',
            'border:1px solid #007782', 'border-radius:6px', 'background:#007782', 'color:#fff',
            'font:600 13px system-ui,sans-serif', 'cursor:pointer', 'box-shadow:0 4px 12px rgba(0,0,0,.2)'
        ].join(';'), '\u2611 Batch relist');
        b.id = LAUNCHER_ID;
        b.type = 'button';
        b.title = 'Select several items and recreate them as drafts, one after another';
        b.onclick = renderSelect;
        document.body.appendChild(b);
        log('Launcher shown (v' + VERSION + ')');
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Enable helper on this page', function () {
            forcedEnabled = true;
            addLauncher();
            decorateCards();
        });
    }

    let debounce;
    new MutationObserver(function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { addLauncher(); decorateCards(); }, 400);
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { decorateCards(); }, 300);
    });
    setTimeout(function () { addLauncher(); decorateCards(); }, 1500);
})();
