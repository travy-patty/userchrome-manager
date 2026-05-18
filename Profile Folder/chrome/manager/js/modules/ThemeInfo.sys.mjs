import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const THEMES_RELATIVE_PATH = "themes";
const ACTIVE_THEME_PREF = "general.skins.selectedSkin";
const PENDING_UNINSTALL_PREF = "general.skins.pendingUninstall";

export class ThemeInfo {
    #dir;

    constructor(themeDir, rdfContent) {
        this.#dir = themeDir;

        this.id           = ThemeInfo._parseRDFField(rdfContent, "id");
        this.version      = ThemeInfo._parseRDFField(rdfContent, "version");
        this.internalName = ThemeInfo._parseRDFField(rdfContent, "internalName");
        this.name         = ThemeInfo._parseRDFField(rdfContent, "name");
        this.description  = ThemeInfo._parseRDFField(rdfContent, "description");
        this.creator      = ThemeInfo._parseRDFField(rdfContent, "creator");
        this.homepageURL  = ThemeInfo._parseRDFField(rdfContent, "homepageURL");
        this.targetApplications  = ThemeInfo._parseTargetApplications(rdfContent);
        this.excludeApplications = ThemeInfo._parseExcludeApplications(rdfContent);
        this.minVersion = this.targetApplications[0]?.minVersion ?? null;
        this.maxVersion = this.targetApplications[0]?.maxVersion ?? null;

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

    get compatible() {
        return ThemeInfo._checkCompatible(this.targetApplications, this.excludeApplications);
    }

    static _readFileText(nsIFile) {
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

    static _parseRDFField(content, field) {
        return content.match(new RegExp(`<em:${field}>(.*?)<\/em:${field}>`))?.[1]?.trim() ?? null;
    }

    static _parseAppBlocks(content, tagName) {
        const blocks = [];
        const re = new RegExp(`<em:${tagName}>[\\s\\S]*?<\\/em:${tagName}>`, "g");
        let match;
        while ((match = re.exec(content)) !== null) {
            blocks.push(match[0]);
        }
        return blocks;
    }

    static _parseTargetApplications(content) {
        return this._parseAppBlocks(content, "targetApplication").map(block => ({
            id:         this._parseRDFField(block, "id"),
            minVersion: this._parseRDFField(block, "minVersion"),
            maxVersion: this._parseRDFField(block, "maxVersion"),
        }));
    }

    static _parseExcludeApplications(content) {
        return this._parseAppBlocks(content, "excludeApplication").map(block => ({
            id: this._parseRDFField(block, "id"),
        }));
    }

    static _checkCompatible(targetApplications, excludeApplications) {
        const appName    = Services.appinfo.name;
        const appVersion = Services.appinfo.version;

        for (let { id } of excludeApplications) {
            if (id && id.toLowerCase() === appName.toLowerCase()) return false;
        }

        const namedTargets = targetApplications.filter(t => t.id != null);
        let versionTarget;
        if (namedTargets.length > 0) {
            versionTarget = namedTargets.find(t => t.id.toLowerCase() === appName.toLowerCase());
            if (!versionTarget) return false;
        } else {
            versionTarget = targetApplications[0] ?? null;
        }

        if (versionTarget) {
            const vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
            if (versionTarget.minVersion && vc.compare(appVersion, versionTarget.minVersion) < 0) return false;
            if (versionTarget.maxVersion && versionTarget.maxVersion !== "*" &&
                vc.compare(appVersion, versionTarget.maxVersion) > 0) return false;
        }

        return true;
    }

    static _removeDir(dir) {
        let children = [];
        let enumerator = dir.directoryEntries;
        while (enumerator.hasMoreElements()) {
            children.push(enumerator.nextFile);
        }

        for (let child of children) {
            if (child.isDirectory()) {
                this._removeDir(child);
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
        targetApplications:  [],
        excludeApplications: [],
        minVersion:          null,
        maxVersion:          null,
        get isActive()           { let p = Services.prefs.getStringPref(ACTIVE_THEME_PREF, ""); return p === "default" || p === ""; },
        get isPendingUninstall() { return false; },
        get compatible()         { return true; },
        activate()               { Services.prefs.setStringPref(ACTIVE_THEME_PREF, "default"); },
        markForUninstall()       {},
        cancelUninstall()        {},
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
                let content = this._readFileText(rdf);
                if (!this._parseRDFField(content, "internalName")) continue;
                results.push(new ThemeInfo(entry, content));
            } catch (ex) {
                console.error(`userchrome-manager: failed to read install.rdf in ${entry.leafName}`, ex);
            }
        }
        return results;
    }

    static getByInternalName(internalName) {
        return this.getAll().find(t => t.internalName === internalName) ?? null;
    }

    static getActive() {
        let pref = Services.prefs.getStringPref(ACTIVE_THEME_PREF, "") || "default";
        return this.getByInternalName(pref) ?? this.defaultTheme;
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

            let internalName = this._parseRDFField(rdfContent, "internalName");
            if (!internalName) {
                throw { code: "NO_INTERNAL_NAME" };
            }

            internalName = internalName.replace(/[\\/]/g, "").trim();
            if (!internalName) {
                throw { code: "NO_INTERNAL_NAME" };
            }

            // Check compatibility before touching the file system
            const targetApps  = this._parseTargetApplications(rdfContent);
            const excludeApps = this._parseExcludeApplications(rdfContent);
            if (!this._checkCompatible(targetApps, excludeApps)) {
                throw {
                    code:         "NOT_COMPATIBLE",
                    themeName:    this._parseRDFField(rdfContent, "name") || internalName,
                    themeVersion: this._parseRDFField(rdfContent, "version"),
                    minVersion:   targetApps[0]?.minVersion ?? null,
                    maxVersion:   targetApps[0]?.maxVersion ?? null,
                };
            }

            if (!overwrite && this.getByInternalName(internalName) !== null) {
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
                this._removeDir(targetDir);
            }
            targetDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

            let entries = zr.findEntries(null);
            try {
                while (entries.hasMore()) {
                    let name = entries.getNext();
                    let normalized = name.replace(/\\/g, "/");
                    if (normalized.endsWith("/"))
                        continue;

                    let parts = normalized.split("/").filter(p => p.length > 0 && p !== "." && p !== "..");
                    if (!parts.length) continue;
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
            } catch (ex) {
                if (targetDir.exists()) {
                    this._removeDir(targetDir);
                }
                throw ex;
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
            let theme = this.getByInternalName(internalName);
            if (!theme) continue;
            try {
                this._removeDir(theme.dir);
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
        let theme = this.getActive();
        if (!theme?.dir)
            return;
        let rdf = theme.dir.clone();
        rdf.append("install.rdf");

        if (!rdf.exists())
            return;

        return this._parseRDFField(this._readFileText(rdf), aValue);
    }
}