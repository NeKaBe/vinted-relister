// ==UserScript==
// @name          Vinted - Relist Helper
// @namespace     https://github.com/NeKaBe/vinted-relister
// @description   Adds Relist, Duplicate and Test buttons to every active listing on your Vinted profile. Companion of "Vinted - Duplicate / Relist Items" (install both).
// @icon          https://www.vinted.com/favicon.ico
// @copyright     2026
// @license       MIT
// @version       0.4.0
// @author        NeKaBe
// @credits       OldRon1977 - idea and approach of the Kleinanzeigen helper: https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
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
 * Requires vinted-relist.user.js as well. Each button opens the listing in a
 * new tab (with #kvRunRelist, #kvRunDuplicate or #kvTest); the relister script
 * does the work there.
 *
 * Nothing is published automatically. Relist deletes the original only after a
 * confirmation popup and a clean check of the new draft (see the relister).
 */

(function () {
    'use strict';

    const VERSION = '0.4.0';

    const log = (m, d) => console.log('[KV-Helper] ' + m, d === undefined ? '' : d);
    const warn = (m, d) => console.warn('[KV-Helper] ' + m, d === undefined ? '' : d);

    let forcedEnabled = false;

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

    // === OWN PROFILE? ===
    function memberIdFromUrl() {
        const m = /^\/member\/(\d+)/.exec(location.pathname);
        return m ? m[1] : null;
    }

    // Once a profile has been recognised as the user's own it stays that way:
    // Vinted's narrow (phone) layout drops the settings link, and the check
    // would otherwise fail after a resize.
    let ownProfileId = null;
    let warnedNotOwn = false;

    function isOwnProfile() {
        if (forcedEnabled) return true;
        const memberId = memberIdFromUrl();
        if (memberId && ownProfileId === memberId) return true;
        // Cheap DOM check first: the observer calls this often, and
        // detectOwnUserId() serializes the whole page HTML.
        let own = !!document.querySelector('main a[href*="/settings/profile"]');
        if (!own) {
            const id = detectOwnUserId();
            own = !!(id && memberId === id);
        }
        if (own) {
            ownProfileId = memberId;
        } else if (!warnedNotOwn) {
            warnedNotOwn = true;
            warn('Profile not recognised as your own (no settings link, user id not found). Use the Tampermonkey menu "Enable helper on this page" to force it.');
        }
        return own;
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

    // === BUTTONS ON EACH LISTING ===
    // Each button opens the item in a new tab, where the relister script shows
    // the action (or the test).
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

    // Three quick buttons are the default. If their text does not fit in the card
    // (measured after rendering, not guessed from a pixel width), all cards switch
    // to one "Actions" button with a small menu. Reset on window resize.
    let useCompact = false;

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
        return forceOverlay ? 'overlay' : (useCompact ? 'compact' : 'full');
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
            if (mode === 'full' && !useCompact) {
                const clipped = row.scrollWidth > row.clientWidth + 1 ||
                    Array.prototype.some.call(row.querySelectorAll('button'), function (b) { return b.scrollWidth > b.clientWidth + 1; });
                if (clipped) {
                    log('Button text does not fit, switching to the Actions menu');
                    useCompact = true;
                    decorateCards();
                    return;
                }
            }
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

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Enable buttons on this page', function () {
            forcedEnabled = true;
            decorateCards();
        });
    }

    let debounce;
    new MutationObserver(function () {
        clearTimeout(debounce);
        debounce = setTimeout(decorateCards, 400);
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { useCompact = false; decorateCards(); }, 300);
    });
    setTimeout(function () {
        decorateCards();
        log('Buttons ready (v' + VERSION + ')');
    }, 1500);
})();
