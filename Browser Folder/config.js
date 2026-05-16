// skip 1st line
try
{
    let {
        classes: Cc,
        interfaces: Ci,
        manager: Cm,
        utils: Cu
    } = Components;

    let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    let prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    let internalName = prefs.getStringPref("general.skins.selectedSkin", "");

    let utilsManifest = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("UChrm", Ci.nsIFile);
    utilsManifest.append("utils");
    utilsManifest.append("chrome.manifest");
    if (utilsManifest.exists()) {
        Cm.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(utilsManifest);
    }

    if (internalName != "" && internalName != "default") {
        let themesDir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("UChrm", Ci.nsIFile);
        themesDir.append("themes");

        let foundManifest = null;
        if (themesDir.exists() && themesDir.isDirectory()) {
            let entries = themesDir.directoryEntries;

            while (entries.hasMoreElements()) {
                let entry = entries.nextFile;
                if (!entry.isDirectory())
                    continue;

                let rdf = entry.clone();
                rdf.append("install.rdf");

                if (!rdf.exists())
                    continue;

                let fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
                fis.init(rdf, 0x01, 0, 0);

                let cis = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
                cis.init(fis, "UTF-8", 8192, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                let content = "";
                let chunk = {};

                while (cis.readString(8192, chunk) > 0) content += chunk.value;
                cis.close();
                fis.close();

                let match = content.match(/<em:internalName>(.*?)<\/em:internalName>/);

                if (match && match[1] === internalName) {
                    // Compatibility check
                    let isCompatible = true;
                    let appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
                    let appName = appInfo.name;
                    let appVersion = appInfo.version;

                    for (let [block] of content.matchAll(/<em:excludeApplication>[\s\S]*?<\/em:excludeApplication>/g)) {
                        let excId = block.match(/<em:id>(.*?)<\/em:id>/)?.[1]?.trim();
                        if (excId && excId.toLowerCase() === appName.toLowerCase()) {
                            isCompatible = false;
                            break;
                        }
                    }

                    if (isCompatible) {
                        let allTargets = [...content.matchAll(/<em:targetApplication>[\s\S]*?<\/em:targetApplication>/g)]
                            .map(([block]) => ({
                                id:         block.match(/<em:id>(.*?)<\/em:id>/)?.[1]?.trim() ?? null,
                                minVersion: block.match(/<em:minVersion>(.*?)<\/em:minVersion>/)?.[1]?.trim() ?? null,
                                maxVersion: block.match(/<em:maxVersion>(.*?)<\/em:maxVersion>/)?.[1]?.trim() ?? null,
                            }));
                        let namedTargets = allTargets.filter(t => t.id != null);
                        let versionTarget;

                        if (namedTargets.length > 0) {
                            versionTarget = namedTargets.find(t => t.id.toLowerCase() === appName.toLowerCase());
                            if (!versionTarget) isCompatible = false;
                        } else {
                            versionTarget = allTargets[0] ?? null;
                        }

                        if (isCompatible && versionTarget) {
                            let vc = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
                            if (versionTarget.minVersion && vc.compare(appVersion, versionTarget.minVersion) < 0) isCompatible = false;
                            if (isCompatible && versionTarget.maxVersion && versionTarget.maxVersion !== "*" &&
                                vc.compare(appVersion, versionTarget.maxVersion) > 0) isCompatible = false;
                        }
                    }

                    if (!isCompatible) {
                        dump(`userchrome-manager: active theme "${internalName}" is not compatible with ${appName} ${appVersion}, skipping\n`);
                        break;
                    }

                    foundManifest = entry.clone();
                    foundManifest.append("chrome.manifest");
                    break;
                }
            }
        }

        if (foundManifest && foundManifest.exists()) {
            let themeDir = foundManifest.parent;

            Cm.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(foundManifest);

            // Import fx-autoconfig

            // ChromeUtils.importESModule does not support file:// URLs, as a workaround
            // we will have to set a userchrome content manifest in the theme's files
            // to load it's chrome.sys.mjs file.
            let chromeSysMjs = themeDir.clone();
            chromeSysMjs.append("chrome.sys.mjs");
            if (chromeSysMjs.exists()) {
                ChromeUtils.importESModule("chrome://userchrome/content/chrome.sys.mjs");
            }

            // Register User Profile Customizations stylesheets
            let userChromeFile = themeDir.clone();
            userChromeFile.append("userChrome.css");
            if (userChromeFile.exists()) {
                sss.loadAndRegisterSheet(ios.newFileURI(userChromeFile), sss.USER_SHEET);
            }

            let userContentFile = themeDir.clone();
            userContentFile.append("userContent.css");
            if (userContentFile.exists()) {
                sss.loadAndRegisterSheet(ios.newFileURI(userContentFile), sss.AUTHOR_SHEET);
            }
        }

    }

    ChromeUtils.importESModule("chrome://userchromejs/content/boot.sys.mjs");
} catch(ex) {};

// Enable CSS
defaultPref("toolkit.legacyUserProfileCustomizations.stylesheets", true);