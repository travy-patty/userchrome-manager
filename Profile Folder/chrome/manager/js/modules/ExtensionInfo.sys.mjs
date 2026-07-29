import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const EXTENSIONS_RELATIVE_PATH = "extensions";
const PENDING_UNINSTALL_PREF = "userChrome.extensions.pendingUninstall";
const DISABLED_EXTENSIONS_PREF = "userChrome.extensions.disabled";

export class ExtensionInfo {
    #dir;

    constructor(extensionDir, rdfContent) {
        this.#dir = extensionDir;

        this.id           = ExtensionInfo._parseRDFField(rdfContent, "id");
        this.version      = ExtensionInfo._parseRDFField(rdfContent, "version");
        this.internalName = ExtensionInfo._parseRDFField(rdfContent, "internalName");
        this.name         = ExtensionInfo._parseRDFField(rdfContent, "name");
        this.description  = ExtensionInfo._parseRDFField(rdfContent, "description");
        this.creator      = ExtensionInfo._parseRDFField(rdfContent, "creator");
        this.homepageURL  = ExtensionInfo._parseRDFField(rdfContent, "homepageURL");
        this.optionsURL   = ExtensionInfo._parseRDFField(rdfContent, "optionsURL");
        this.isExtension  = true;
        this.targetApplications  = ExtensionInfo._parseTargetApplications(rdfContent);
        this.excludeApplications = ExtensionInfo._parseExcludeApplications(rdfContent);
        this.minVersion = this.targetApplications[0]?.minVersion ?? null;
        this.maxVersion = this.targetApplications[0]?.maxVersion ?? null;

        const iconFile = extensionDir.clone();
        iconFile.append("icon.png");
        this.icon = iconFile.exists() ? Services.io.newFileURI(iconFile).spec : null;

        Object.freeze(this);
    }

    get disabled() {
        let disabled = ExtensionInfo.getDisabled();
        return disabled.includes(this.internalName);
    }

    get dir() {
        return this.#dir;
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

    _filterDisabledArray(disabled)
    {
        for (let i = 0; i < disabled.length; i++)
        {
            if (!ExtensionInfo.getByInternalName(disabled[i]))
            {
                disabled.splice(i, 1);
                i--;
            }
        }
    }

    enable() {
        let disabled = ExtensionInfo.getDisabled();
        let index = disabled.indexOf(this.internalName);
        if (index !== -1)
        {
            disabled.splice(index, 1);
        }
        this._filterDisabledArray(disabled);
        Services.prefs.setStringPref(DISABLED_EXTENSIONS_PREF, JSON.stringify(disabled));
    }

    disable() {
        let disabled = ExtensionInfo.getDisabled();
        disabled = [...new Set([...disabled, this.internalName])];
        this._filterDisabledArray(disabled);
        Services.prefs.setStringPref(DISABLED_EXTENSIONS_PREF, JSON.stringify(disabled));
    }

    get compatible() {
        return ExtensionInfo._checkCompatible(this.targetApplications, this.excludeApplications);
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

    static getAll() {
        let results = [];
        let extensionsDir = Services.dirsvc.get("UChrm", Ci.nsIFile);
        extensionsDir.append(EXTENSIONS_RELATIVE_PATH);
        if (!extensionsDir.exists() || !extensionsDir.isDirectory()) return results;

        let entries = extensionsDir.directoryEntries;
        while (entries.hasMoreElements()) {
            let entry = entries.nextFile;
            if (!entry.isDirectory()) continue;

            let rdf = entry.clone();
            rdf.append("install.rdf");
            if (!rdf.exists()) continue;

            try {
                let content = this._readFileText(rdf);
                if (!this._parseRDFField(content, "internalName")) continue;
                results.push(new ExtensionInfo(entry, content));
            } catch (ex) {
                console.error(`userchrome-manager: failed to read install.rdf in ${entry.leafName}`, ex);
            }
        }
        return results;
    }

    static getDisabled()
    {
        let disabledNames = JSON.parse(Services.prefs.getStringPref(DISABLED_EXTENSIONS_PREF, "[]"));
        return disabledNames;
    }

    static getByInternalName(internalName) {
        return this.getAll().find(t => t.internalName === internalName) ?? null;
    }

    static processPendingUninstalls() {
        let pending = JSON.parse(Services.prefs.getStringPref(PENDING_UNINSTALL_PREF, "[]"));
        if (!pending.length) return;

        let failed = [];
        for (let internalName of pending) {
            let extension = this.getByInternalName(internalName);
            if (!extension) continue;
            try {
                this._removeDir(extension.dir);
            } catch (ex) {
                console.error(`userchrome-manager: failed to remove extension folder for ${internalName}`, ex);
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