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

function removeDir(dir) {
    let children = [];
    let enumerator = dir.directoryEntries;
    while (enumerator.hasMoreElements()) {
        children.push(enumerator.nextFile);
    }

    for (let child of children) {
        if (child.isDirectory()) {
            removeDir(child);
        } else {
            try {
                child.permissions = 0o666;
            }
            catch (ex) {}
            child.remove(false);
        }
    }

    try {
        dir.permissions = 0o777;
    }
    catch (ex) {}
    dir.remove(false);
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

    get dir() {
        return this.#dir;
    }

    get isActive() {
        return Services.prefs.getStringPref(ACTIVE_THEME_PREF, "") === this.internalName;
    }

    activate() {
        Services.prefs.setStringPref(ACTIVE_THEME_PREF, this.internalName);
    }

    get isPendingUninstall() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        return pending.includes(this.internalName);
    }

    markForUninstall() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        if (!pending.includes(this.internalName)) {
            pending.push(this.internalName);
            Services.prefs.setStringPref(PENDING_UNINSTALL_PREF, JSON.stringify(pending));
        }
    }

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

    static defaultTheme = Object.freeze({
        id:           "default",
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
        let results = [ThemeInfo.defaultTheme];
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

    static getByInternalName(internalName) {
        return ThemeInfo.getAll().find(t => t.internalName === internalName) ?? null;
    }

    static getActive() {
        let pref = Services.prefs.getStringPref(ACTIVE_THEME_PREF, "") || "default";
        return ThemeInfo.getByInternalName(pref);
    }

    static installFromZip(zipFile, { overwrite = false } = {}) {
        let zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);

        try {
            zr.open(zipFile);
        }
        catch (ex) {
            throw { code: "INVALID_ZIP", cause: ex };
        }

        try {
            if (!zr.hasEntry("install.rdf")) {
                throw { code: "NO_RDF" };
            }

            let stream = zr.getInputStream("install.rdf");

            let cis = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
            cis.init(stream, "UTF-8", 8192, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

            let rdfContent = "";
            let chunk = {};
            while (cis.readString(8192, chunk) > 0) rdfContent += chunk.value;

            cis.close();
            stream.close();

            let internalName = parseRDFField(rdfContent, "internalName");
            if (!internalName) {
                throw { code: "NO_INTERNAL_NAME" };
            }

            internalName = internalName.replace(/[\\/]/g, "").trim();
            if (!internalName) {
                throw { code: "NO_INTERNAL_NAME" };
            }

            if (!overwrite && ThemeInfo.getByInternalName(internalName) !== null) {
                throw { code: "ALREADY_EXISTS", internalName };
            }

            let themesDir = Services.dirsvc.get("UChrm", Ci.nsIFile);
            themesDir.append(THEMES_RELATIVE_PATH);
            if (!themesDir.exists()) {
                themesDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
            }

            let targetDir = themesDir.clone();
            targetDir.append(internalName);

            if (targetDir.exists()) {
                removeDir(targetDir);
            }
            targetDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

            let entries = zr.findEntries(null);
            while (entries.hasMore()) {
                let name = entries.getNext();
                if (name.endsWith("/"))
                    continue;

                let parts = name.split("/").filter(p => p.length > 0 && p !== ".");
                let file = targetDir.clone();

                for (let i = 0; i < parts.length - 1; i++) {
                    file.append(parts[i]);
                    if (!file.exists()) {
                        file.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
                    }
                }

                file.append(parts[parts.length - 1]);
                if (file.exists()) {
                    file.remove(false);
                }
                zr.extract(name, file);
            }

            return new ThemeInfo(targetDir, rdfContent);
        } finally {
            zr.close();
        }
    }

    static processPendingUninstalls() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        if (!pending.length) return;

        let failed = [];
        for (let internalName of pending) {
            let theme = ThemeInfo.getByInternalName(internalName);
            if (!theme) continue; // already gone
            try {
                removeDir(theme.#dir);
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

    static getThemeInstall(aValue) {
        let theme = ThemeInfo.getActive();
        if (!theme?.dir)
            return;
        let rdf = theme.dir.clone();
        rdf.append("install.rdf");

        if (!rdf.exists())
            return;

        return parseRDFField(readFileText(rdf), aValue);
    }
}