# Vinted Relister

Relist or duplicate your own Vinted listings with one click: all photos, description, price, category, brand, size, condition and more are copied into a new **draft**. No retyping, no re-uploading photos.

🇩🇪 [Deutsche Anleitung](README.de.md) · ☕ [Support on Ko-fi](https://ko-fi.com/nekabe)

<!-- Add screenshots or a short GIF to a docs/ folder and show them here, e.g. ![Relist buttons](docs/buttons.png) -->

## What it does

- **Buttons on every listing** of your profile: **Relist**, **Duplicate**, **Test**.
- **One click, no extra steps:** a progress banner shows what is happening, then the new draft opens.
- **Relist** asks once in a popup, creates the draft, checks it against the original and only then deletes the original. If the check finds any difference, the original is kept.
- **Duplicate** never deletes anything. Use it when you want to keep the favourites of the old listing.
- **Test** is read-only. It shows whether all data of a listing is available.
- **Batch relist** (button at the bottom left of your profile): select several listings and process them one after another with a random pause.
- Works with data, not with screen text, so it is independent of the language of the Vinted site and copies category-specific fields too.
- Buttons are not shown on drafts, listings in review or on edit pages.

## Install

1. Install a userscript manager for your browser (see [Supported browsers](#supported-browsers)), e.g. [Tampermonkey](https://www.tampermonkey.net/).
2. Click both links. Your userscript manager offers to install the script:
   - **[Install the relister script](https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-relist.user.js)** (buttons on item pages, does the actual work)
   - **[Install the helper script](https://raw.githubusercontent.com/NeKaBe/vinted-relister/main/vinted-helper.user.js)** (buttons on your profile and batch relist)
3. Chrome and other Chromium browsers only: if scripts do not run, enable "Allow User Scripts" (or Developer mode) for Tampermonkey on `chrome://extensions`.
4. The first time photos are copied, Tampermonkey asks for permission to connect to `vinted.net` (Vinted's image host). Allow it.
5. Log in to Vinted and open your profile.

Both scripts are needed for the buttons on your profile. The relister alone gives you the buttons on a single item page.

<!-- Greasy Fork link: add here once the scripts are published there. -->

Updates arrive automatically through your userscript manager.

### Supported browsers

| Browser | Userscript manager | Notes |
|---|---|---|
| Chrome, Edge, Brave, Opera | Tampermonkey (free) | Enable "Allow User Scripts" / Developer mode if needed. |
| Firefox | Tampermonkey or Violentmonkey (free) | Usually works without extra setup. |
| Safari (Mac) | Tampermonkey (paid app) or Userscripts (free) | Enable the extension in Safari settings. Allow pop-ups for Vinted, since the helper opens one tab per listing. |
| Safari (iPhone/iPad) | Tampermonkey (paid) or Userscripts (free) | Much less reliable, not recommended for batch relisting. |

Works on the common Vinted country sites (vinted.de, .com, .co.uk, .fr, .it, .es, .nl, .be, .at, .pl, .cz, .lt, .pt, .lu, .se, .dk, .fi, .sk, .hu, .ro, .hr). If yours is missing, add another `@match` line to both scripts.

## How to use

**On your profile:** every active listing has the buttons *Relist*, *Duplicate* and *Test* above its photo. Click one. A new tab opens and shows the progress; when it is done you land on the new draft. Review it and publish it yourself.

**On a single item page:** the same three buttons appear at the bottom right.

**Several listings:** on your profile click *Batch relist* (bottom left), choose the listings and the mode, set the pause and press Start.

If the buttons do not show up, reload the page first (the scripts start on a full page load, not on in-site navigation). If they are still missing, use the userscript manager's menu entry for the script.

## Safety principles

- **Nothing is published automatically.** The script only creates a draft. You review and publish it yourself.
- **Your own listings only.** Other people's listings are refused.
- **The original is deleted only if you ask for it:** *Relist* deletes it after your confirmation and only if the created draft matches the original. *Duplicate* and *Test* never delete anything. In batch mode nothing is deleted automatically; you delete originals from the "Pending originals" list.
- **If anything fails, the original is left untouched.**
- **Deleting is permanent**, and views and favourites of the deleted listing are lost. Try *Relist* on a listing you do not care about first.

## Good to know

- **Unofficial interface.** Vinted offers no public API for creating listings. These scripts use the same endpoints as the Vinted website. If Vinted changes them, the scripts can stop working. Use the *Test* button and the browser console (F12, filter `KV-`) to narrow down problems.
- **Tested so far** by the author on shoes, bags and clothing. Other categories (books, electronics, toys, ...) should work because everything is copied from the original data and checked afterwards, but have not been tested widely. Please report what you find.
- **Terms of service.** Automation may violate Vinted's terms and in the worst case lead to an account restriction. Use at your own risk, keep pauses moderate and do not relist in bulk.
- **Not affiliated with Vinted.** "Vinted" is a trademark of its owner. This is an independent hobby project.
- No warranty, no liability (see the license).

## Personal use only

These scripts are meant for **personal use on your own account and your own listings**: less retyping and less photo re-uploading when you want to refresh a listing. They are not meant for reselling at scale, for bulk or commercial automation, for copying other people's listings, or for getting around any Vinted rules.

## Problems and ideas

Please open an [issue](https://github.com/NeKaBe/vinted-relister/issues). The bug report template asks for the result of the *Test* button, which usually shows what is going on. Remove anything private before you post screenshots.

## Support

If this saves you time, you can support the project: **[☕ ko-fi.com/nekabe](https://ko-fi.com/nekabe)**. Entirely optional, the scripts stay free.

## Acknowledgements

Thank you to **[OldRon1977](https://github.com/OldRon1977)** for [Kleinanzeigen-Anzeigen-duplizieren](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren). That project was the inspiration for this one: the idea of a helper script plus a worker script, the selection overlay and the random pause between items. All code here was written from scratch for Vinted, but the approach would not exist without that original work.

## About this project

A hobby project by an enthusiastic amateur, not a professional developer. The code was written with the help of [Claude](https://claude.ai) (an AI assistant by Anthropic). Expect rough edges, and please open an issue if something breaks or Vinted changes something.

## License

MIT, see [LICENSE](LICENSE).
