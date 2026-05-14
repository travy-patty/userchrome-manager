// ==UserScript==
// @name			userChrome Manager :: Menu
// @description 	Registers page for userChrome Manager.
// @author			travy-patty
// @author          https://github.com/travy-patty
// @include			main
// ==/UserScript===

{
    let { ThemeInfo, waitForElement } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/uchrmUtils.sys.mjs");
    waitForElement = waitForElement.bind(window);

    let menuViewPopup = document.getElementById("menu_viewPopup");

    let stringbundle = Services.strings.createBundle("chrome://uchrm/locale/properties/userchrome-menupopup.properties");

    function createThemeMenuItem(aID, aInternalName, aLabel, aTooltip, aCommand) {
        let menuitem = document.createXULElement("menuitem");
        menuitem.id = aID;
        menuitem.setAttribute("internalname", aInternalName);
        menuitem.setAttribute("label", aLabel);
        menuitem.setAttribute("tooltiptext", aTooltip);
        menuitem.addEventListener("command", aCommand.bind(this));

        return menuitem;
    }

    function onPopupShowing(event) {
        let themeMenupopup = document.getElementById("menu_viewApplyThemePopup");
        if (!themeMenupopup) return;

        document.querySelectorAll('[id^="menu_viewApplyTheme_"]').forEach(el => el.remove());

        let themes = ThemeInfo.getAll();

        for (let theme of themes) {
            let menuitem = createThemeMenuItem(
                `menu_viewApplyTheme_${theme.internalName}`,
                theme.internalName,
                theme.name,
                theme.description,
                onThemeItemCommand
            );

            menuitem.setAttribute("type", "radio");

            let isActive = theme.internalName == ThemeInfo.getActive().internalName;

            menuitem.setAttribute("checked", isActive);

            themeMenupopup.appendChild(menuitem);
        }
    }

    function onThemeItemCommand(aEvent) {
        let menuitem = aEvent.target;

        ThemeInfo.getByInternalName(menuitem.getAttribute("internalname")).activate();

        let restartStruct = {
            accepted: false,
            icon: "warning",
            title: stringbundle.GetStringFromName("restart_prompt_title"),
            message: stringbundle.GetStringFromName("restart_prompt_message"),
            acceptButtonText: stringbundle.GetStringFromName("restart_prompt_restart"),
            cancelButtonText: stringbundle.GetStringFromName("restart_prompt_cancel")
        };

        windowRoot.ownerGlobal.openDialog(
            "chrome://uchrm/content/windows/common/dialog.xhtml",
            stringbundle.GetStringFromName("restart_prompt_title"),
            "chrome,centerscreen,resizeable=no,dependent,modal",
            restartStruct
        );

        if (restartStruct.accepted) {
            restartApp();
        }
        else {
            Services.appinfo.invalidateCachesOnRestart();
        }
    }

    function createApplyMenu() {
        let menu = document.createXULElement("menu");
        menu.id = "menu_viewApplyTheme";

        menu.setAttribute("label", stringbundle.GetStringFromName("themes_menu_label"));
        menu.setAttribute("accesskey", stringbundle.GetStringFromName("themes_menu_accesskey"));

        let menupopup = document.createXULElement("menupopup");
        menupopup.id = "menu_viewApplyThemePopup";

        let optionsMenuitem = document.createXULElement("menuitem");
        optionsMenuitem.setAttribute("label", stringbundle.GetStringFromName("options_menuitem_label"));
        optionsMenuitem.setAttribute("accesskey", stringbundle.GetStringFromName("options_menuitem_accesskey"));
        optionsMenuitem.addEventListener("command", launchUserChromeOptions);

        let separator = document.createXULElement("menuseparator");

        menupopup.appendChild(optionsMenuitem);
        menupopup.appendChild(separator);

        menu.appendChild(menupopup);

        return menu;
    }

    function restartApp() {
        const nsIAppStartup = Components.interfaces.nsIAppStartup;

        // Notify all windows that an application quit has been requested.
        var os = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);
        var cancelQuit = Components.classes["@mozilla.org/supports-PRBool;1"]
            .createInstance(Components.interfaces.nsISupportsPRBool);
        os.notifyObservers(cancelQuit, "quit-application-requested", null);

        // Something aborted the quit process.
        if (cancelQuit.data)
            return;

        // Notify all windows that an application quit has been granted.
        os.notifyObservers(null, "quit-application-granted", null);

        // Enumerate all windows and call shutdown handlers
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var windows = wm.getEnumerator(null);
        while (windows.hasMoreElements()) {
            var win = windows.getNext();
            if (("tryToClose" in win) && !win.tryToClose())
                return;
        }
        Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup)
            .quit(nsIAppStartup.eRestart | nsIAppStartup.eAttemptQuit);
    }

    function launchUserChromeOptions(event)
    {
        openTrustedLinkIn("about:userchrome", "tab");
    }


    waitForElement("#menu_viewPopup").then((menu) => {
        menu.append(document.createXULElement("menuseparator"));
        menu.append(createApplyMenu());
        menu.addEventListener("popupshowing", onPopupShowing);
    });
}