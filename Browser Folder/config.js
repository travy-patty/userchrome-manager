// skip 1st line
try
{
    let {
        classes: Cc,
        interfaces: Ci,
        manager: Cm,
        utils: Cu
    } = Components;

    let prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    let theme = prefs.getStringPref("browser.userchrome.theme", "");

    let cmanifest = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("UChrm", Ci.nsIFile);
    if (theme != "") {
        cmanifest.append(theme);
    }
    cmanifest.append("utils");
    cmanifest.append("chrome.manifest");

    if (cmanifest.exists())
    {
        Cm.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(cmanifest);
        ChromeUtils.importESModule('chrome://userchromejs/content/boot.sys.mjs');
    }

    let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    let themeDir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("UChrm", Ci.nsIFile);
    if (theme != "") {
        themeDir.append(theme);
    }

    let userChromeFile = themeDir.clone();
    userChromeFile.append("userChrome.css");
    if (userChromeFile.exists()) {
        sss.loadAndRegisterSheet(ios.newFileURI(userChromeFile), sss.USER_SHEET);
    }

    let userContentFile = themeDir.clone();
    userContentFile.append("userContent.css"); 
    if (userContentFile.exists()) {
        sss.loadAndRegisterSheet(ios.newFileURI(userContentFile), sss.USER_SHEET);
    }
} catch(ex) {};

// Enable CSS
defaultPref("toolkit.legacyUserProfileCustomizations.stylesheets", true);