import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const THEMES_RELATIVE_PATH = "themes";
const ACTIVE_THEME_PREF = "general.skins.selectedSkin";
const PENDING_UNINSTALL_PREF = "general.skins.pendingUninstall";

function readFileText(nsIFile) {
    let fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    fis.init(nsIFile, 0x01, 0, 0);
    let cis = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    cis.init(fis, "UTF-8", 8192, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    let content = "";
    let chunk = {};
    while (cis.readString(8192, chunk) > 0) content += chunk.value;
    cis.close();
    fis.close();
    return content;
}

function parseRDFField(content, field) {
    return content.match(new RegExp(`<em:${field}>(.*?)<\/em:${field}>`))?.[1]?.trim() ?? null;
}

export class ThemeInfo {
    #dir;

    constructor(themeDir, rdfContent) {
        this.#dir = themeDir;

        this.id           = parseRDFField(rdfContent, "id");
        this.version      = parseRDFField(rdfContent, "version");
        this.internalName = parseRDFField(rdfContent, "internalName");
        this.name         = parseRDFField(rdfContent, "name");
        this.description  = parseRDFField(rdfContent, "description");
        this.creator      = parseRDFField(rdfContent, "creator");
        this.homepageURL  = parseRDFField(rdfContent, "homepageURL");
        this.minVersion   = parseRDFField(rdfContent, "minVersion");
        this.maxVersion   = parseRDFField(rdfContent, "maxVersion");

        const iconFile = themeDir.clone();
        iconFile.append("icon.png");
        this.icon = iconFile.exists() ? Services.io.newFileURI(iconFile).spec : null;

        const previewFile = themeDir.clone();
        previewFile.append("preview.png");
        this.preview = previewFile.exists() ? Services.io.newFileURI(previewFile).spec : null;

        Object.freeze(this);
    }

    /** The nsIFile for the theme's root directory. */
    get dir() {
        return this.#dir;
    }

    /** Whether this theme is the currently active one. */
    get isActive() {
        return Services.prefs.getStringPref(ACTIVE_THEME_PREF, "") === this.internalName;
    }

    /** Activate this theme by setting the pref (requires restart to take effect). */
    activate() {
        Services.prefs.setStringPref(ACTIVE_THEME_PREF, this.internalName);
    }

    /** Whether this theme is marked for removal on next restart. */
    get isPendingUninstall() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        return pending.includes(this.internalName);
    }

    /** Mark this theme for removal on next restart. */
    markForUninstall() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        if (!pending.includes(this.internalName)) {
            pending.push(this.internalName);
            Services.prefs.setStringPref(PENDING_UNINSTALL_PREF, JSON.stringify(pending));
        }
    }

    /** Cancel a pending uninstall for this theme. */
    cancelUninstall() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        let idx = pending.indexOf(this.internalName);
        if (idx !== -1) {
            pending.splice(idx, 1);
            if (pending.length) {
                Services.prefs.setStringPref(PENDING_UNINSTALL_PREF, JSON.stringify(pending));
            } else {
                Services.prefs.clearUserPref(PENDING_UNINSTALL_PREF);
            }
        }
    }

    /**
     * Scan chrome/themes/ and return a ThemeInfo for every directory that
     * contains a valid install.rdf with an em:internalName.
     * @returns {ThemeInfo[]}
     */
    static #defaultTheme = Object.freeze({
        id:           "default-theme@userchrome-manager",
        get version() { return Services.appinfo.version; },
        internalName: "default",
        name:         `${AppConstants.MOZ_APP_BASENAME} (default)`,
        description:  "The default theme",
        creator:      "Mozilla",
        homepageURL:  null,
        icon:         null,
        preview:      null,
        dir:          null,
        get isActive()         { let p = Services.prefs.getStringPref(ACTIVE_THEME_PREF, ""); return p === "default" || p === ""; },
        get isPendingUninstall() { return false; },
        activate()             { Services.prefs.setStringPref(ACTIVE_THEME_PREF, "default"); },
        markForUninstall()     {},
        cancelUninstall()      {},
    });

    static getAll() {
        let results = [ThemeInfo.#defaultTheme];
        let themesDir = Services.dirsvc.get("UChrm", Ci.nsIFile);
        themesDir.append(THEMES_RELATIVE_PATH);
        if (!themesDir.exists() || !themesDir.isDirectory()) return results;

        let entries = themesDir.directoryEntries;
        while (entries.hasMoreElements()) {
            let entry = entries.nextFile;
            if (!entry.isDirectory()) continue;

            let rdf = entry.clone();
            rdf.append("install.rdf");
            if (!rdf.exists()) continue;

            try {
                let content = readFileText(rdf);
                if (!parseRDFField(content, "internalName")) continue;
                results.push(new ThemeInfo(entry, content));
            } catch (ex) {
                console.error(`userchrome-manager: failed to read install.rdf in ${entry.leafName}`, ex);
            }
        }
        return results;
    }

    /**
     * Get the ThemeInfo for a specific internalName, or null if not found.
     * @param {string} internalName
     * @returns {ThemeInfo|null}
     */
    static getByInternalName(internalName) {
        return ThemeInfo.getAll().find(t => t.internalName === internalName) ?? null;
    }

    /**
     * Get the currently active theme's ThemeInfo, or null if none is set / found.
     * @returns {ThemeInfo|null}
     */
    static getActive() {
        let pref = Services.prefs.getStringPref(ACTIVE_THEME_PREF, "") || "default";
        return ThemeInfo.getByInternalName(pref);
    }

    /**
     * Delete the folders of all themes marked for uninstall. Call this once at
     * startup, before the themes list is displayed. Themes that fail to delete
     * remain in the pending list and will be retried on the next restart.
     */
    static processPendingUninstalls() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        if (!pending.length) return;

        let failed = [];
        for (let internalName of pending) {
            let theme = ThemeInfo.getByInternalName(internalName);
            if (!theme) continue; // already gone
            try {
                theme.#dir.remove(true);
            } catch (ex) {
                console.error(`userchrome-manager: failed to remove theme folder for ${internalName}`, ex);
                failed.push(internalName);
            }
        }

        if (failed.length) {
            Services.prefs.setStringPref(PENDING_UNINSTALL_PREF, JSON.stringify(failed));
        } else {
            Services.prefs.clearUserPref(PENDING_UNINSTALL_PREF);
        }
    }
}

export async function waitForElement(selector, root = this.document)
{
    while (root.querySelector(selector) == null)
    {
        await new Promise(r => this.requestAnimationFrame(r));
    }
    return root.querySelector(selector);
}
