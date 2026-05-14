var g_userChromeOptions;

const OP_NONE                         = "none";
const OP_NEEDS_INSTALL                = "needs-install";
const OP_NEEDS_UPGRADE                = "needs-upgrade";
const OP_NEEDS_UNINSTALL              = "needs-uninstall";
const OP_NEEDS_ENABLE                 = "needs-enable";
const OP_NEEDS_DISABLE                = "needs-disable";

{
    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/uchrmUtils.sys.mjs");

    class UserChromeOptions {
        _stringbundle = null;

        get stringbundle() {
            if (!this._stringbundle) {
                this._stringbundle = document.getElementById("optionsBundle");
            }
            return this._stringbundle;
        }

        get _themesListBox() {
            return document.getElementById("themesView");
        }

        get _globalCommandSet() {
            return document.getElementById("globalCommands");
        }

        get _commandSet() {
            return document.getElementById("themesCommands");
        }

        get _themePreviewArea() {
            return document.getElementById("themePreviewArea");
        }

        get _themeSplitter() {
            return document.getElementById("themeSplitter");
        }

        get _contextMenu() {
            return document.getElementById("addonContextMenu");
        }

        setElementDisabledByID(aID, aDoDisable) {
            var element = document.getElementById(aID);
            if (element) {
            if (aDoDisable)
                element.setAttribute("disabled", "true");
            else
                element.removeAttribute("disabled");
            }
        }

        init() {
            this.renderThemesList();

            this._commandSet.addEventListener("command", (e) => {
                this.doThemeCommand(e.target.id);
                this.updateGlobalCommands();
            });

            this._globalCommandSet.addEventListener("command", (e) => {
                this.doGlobalCommand(e.target.id);
                this.updateGlobalCommands();
            });

            this._themesListBox.addEventListener("select", this.onCommandUpdate.bind(this));
            this._themesListBox.addEventListener("select", this.handleThemesListBox.bind(this));
            this._contextMenu.addEventListener("popupshowing", this.onPopupShowing.bind(this));

            this.updateGlobalCommands();
            this.onCommandUpdate();

            let savedWidth = Services.xulStore.getValue(document.documentURI, "themePreviewArea", "width");
            if (savedWidth) {
                this._themePreviewArea.style.width = savedWidth + "px";
            }

            let savedState = Services.xulStore.getValue(document.documentURI, "themeSplitter", "state");
            if (savedState) {
                this._themeSplitter.setAttribute("state", savedState);
            }
        }

        unload() {
            Services.xulStore.setValue(document.documentURI, "themePreviewArea", "width", String(this._themePreviewArea.getBoundingClientRect().width));

            let state = this._themeSplitter.getAttribute("state");

            if (state) {
                Services.xulStore.setValue(document.documentURI, "themeSplitter", "state", state);
            }
        }

        onPopupShowing(event) {
            if (this._themesListBox.selectedItem.getAttribute("opType") == OP_NEEDS_UNINSTALL) {
                document.getElementById("menuitem_uninstall").setAttribute("hidden", "true");
                document.getElementById("menuitem_cancelUninstall").removeAttribute("hidden");
            }
            else {
                document.getElementById("menuitem_uninstall").removeAttribute("hidden");
                document.getElementById("menuitem_cancelUninstall").setAttribute("hidden", "true");
            }

            document.getElementById("menuitem_about").setAttribute("label", this.stringbundle.getFormattedString("aboutAddon", [this._themesListBox.selectedItem.getAttribute("name")]));
        }

        globalCommands = {
            cmd_close: (e) => {
                window.close();
            },

            cmd_restartApp: (e) => {
                this.restartApp();
            }
        }

        themesCommands = {
            cmd_about: (aSelectedItem) => {
                if (!aSelectedItem)
                    return;

                windowRoot.ownerGlobal.openDialog(
                    "about:abouttheme",
                    "",
                    "chrome,centerscreen,modal",
                    aSelectedItem.getAttribute("internalName")
                );
            },

            cmd_homepage: (aSelectedItem) => {
                if (!aSelectedItem)
                    return;

                let homepageURL = aSelectedItem.getAttribute("homepageURL");
                if (homepageURL) {
                    windowRoot.ownerGlobal.openURL(homepageURL);
                }
            },

            cmd_useTheme: (aSelectedItem) => {
                let currentTheme = aSelectedItem.getAttribute("internalName");

                for (let listitem of this._themesListBox.itemChildren) {
                    if (listitem !== aSelectedItem && listitem.getAttribute("opType") === OP_NEEDS_ENABLE) {
                        listitem.setAttribute("opType", OP_NONE);
                    }
                }

                ThemeInfo.getByInternalName(currentTheme).activate();

                aSelectedItem.setAttribute("opType", OP_NEEDS_ENABLE);
            },

            cmd_uninstall: (aSelectedItem) => {
                let currentTheme = aSelectedItem.getAttribute("internalName");

                let uninstallStruct = {
                    accepted: false,
                    icon: "warning",
                    title: this.stringbundle.getFormattedString("uninstall_prompt_title", [aSelectedItem.getAttribute("name")]),
                    message: this.stringbundle.getFormattedString("uninstall_prompt_message", [aSelectedItem.getAttribute("name")]),
                    acceptButtonText: this.stringbundle.getString("uninstall_prompt_uninstall")
                };

                windowRoot.ownerGlobal.openDialog(
                    "chrome://uchrm/content/windows/common/dialog.xhtml",
                    this.stringbundle.getFormattedString("uninstall_prompt_title", [aSelectedItem.getAttribute("name")]),
                    "chrome,centerscreen,resizeable=no,dependent,modal",
                    uninstallStruct
                );

                if (uninstallStruct.accepted) {
                    ThemeInfo.getByInternalName(currentTheme).markForUninstall();
                    aSelectedItem.setAttribute("opType", OP_NEEDS_UNINSTALL);
                };
            },

            cmd_cancelUninstall: (aSelectedItem) => {
                if (ThemeInfo.getByInternalName(aSelectedItem.getAttribute("internalName")).isPendingUninstall) {
                    ThemeInfo.getByInternalName(aSelectedItem.getAttribute("internalName")).cancelUninstall();
                }

                aSelectedItem.setAttribute("opType", OP_NONE);
            },
        }

        isCommandEnabled(aCommand) {
            let selectedItem = this._themesListBox.selectedItem;
            if (!selectedItem)
                return;

            switch (aCommand) {
                case "cmd_useTheme":
                    return selectedItem.getAttribute("internalName") != ThemeInfo.getActive().internalName &&
                           !ThemeInfo.getByInternalName(selectedItem.getAttribute("internalName")).isPendingUninstall &&
                           selectedItem.getAttribute("opType") !== OP_NEEDS_ENABLE;
                case "cmd_uninstall":
                    return selectedItem.getAttribute("internalName") != ThemeInfo.getActive().internalName &&
                           !ThemeInfo.getByInternalName(selectedItem.getAttribute("internalName")).isPendingUninstall &&
                           selectedItem.getAttribute("internalName") !== "default";
                case "cmd_cancelUninstall":
                    return selectedItem.getAttribute("internalName") != ThemeInfo.getActive().internalName &&
                           ThemeInfo.getByInternalName(selectedItem.getAttribute("internalName")).isPendingUninstall &&
                           selectedItem.getAttribute("internalName") !== "default";
                case "cmd_about":
                    return selectedItem.getAttribute("opType") !== OP_NEEDS_INSTALL;
                case "cmd_homepage":
                    return selectedItem.getAttribute("homepageURL") != "";
            }

            return false;
        }

        doThemeCommand(aCommand) {
            this.themesCommands[aCommand](this._themesListBox.selectedItem);

            this.onCommandUpdate();
            this._themesListBox.focus();
        }

        doGlobalCommand(aCommand) {
            this.globalCommands[aCommand]();

            this.updateGlobalCommands();
        }

        onCommandUpdate() {
            for (var i = 0; i < this._commandSet.childNodes.length; ++i) {
                this.updateCommand(this._commandSet.childNodes[i]);
            }
        }

        updateCommand(aCommand) {
            if (this.isCommandEnabled(aCommand.id)) {
                aCommand.removeAttribute("disabled");
            }
            else {
                aCommand.setAttribute("disabled", "true");
            }
        }

        updateGlobalCommands() {
            var disableAppRestart = true;

            for (let theme of ThemeInfo.getAll()) {
                if (theme.isPendingUninstall || document.getElementById(`urn:mozilla:item:${theme.id}`).getAttribute("opType") == OP_NEEDS_ENABLE) {
                    disableAppRestart = false;
                    break;
                }
            }

            this.setElementDisabledByID("cmd_restartApp", disableAppRestart);
        }

        handleThemesListBox() {
            for (let listitem of this._themesListBox.itemChildren) {
                if (listitem.selected) {
                    this._setPreviewImage(listitem.getAttribute("previewImage"));
                }
            }
        }

        _createThemeListItem(theme) {
            let listitem = document.createXULElement("richlistitem");

            let fragment = window.MozXULElement.parseXULToFragment(`
                <hbox flex="1">
                    <vbox class="addon-icon">
                        <image class="addonIcon" />
                    </vbox>
                    <vbox flex="1" class="addonTextBox">
                        <hbox class="addon-name-version">
                            <label class="addonName" crop="end" />
                            <label class="addonVersion" />
                        </hbox>
                        <label class="descriptionWrap"></label>
                        <vbox class="selectedStatusMsgs">
                            <hbox class="uninstallShow statusMsg">
                                <label class="statusMsgLabel" value="This theme will be uninstalled when Firefox is restarted" crop="end" />

                                <label class="text-link startMsgLink restartBrowser"
                                    value="Restart Firefox" />
                            </hbox>
                            <hbox class="enableShow statusMsg">
                                <label class="statusMsgLabel" value="This theme will be enabled when Firefox is restarted" crop="end" />

                                <label class="text-link startMsgLink restartBrowser"
                                    value="Restart Firefox" />
                            </hbox>
                        </vbox>
                        <hbox flex="1" class="selectedButtons">
                            <button class="uninstallHide themeButton useThemeButton"
                                    label="Use Theme" accesskey="T" tooltiptext="Changes Firefox's Theme" command="cmd_useTheme"/>
                            <spacer flex="1" />
                            <button class="uninstallHide uninstallButton"
                                label="Uninstall" accesskey="U"
                                tooltiptext="Uninstall this Add-on when Firefox is restarted" command="cmd_uninstall"/>
                            <button class="uninstallShow cancelUninstall"
                                label="Cancel" accesskey="C"
                                tooltiptext="Cancel the pending uninstall for this Add-on" command="cmd_cancelUninstall"/>
                        </hbox>
                    </vbox>
                </hbox>
            `);

            if (theme.icon) {
                fragment.querySelector(".addonIcon").src = theme.icon;
                fragment.querySelector(".addon-icon").setAttribute("iconURL", theme.icon);
                listitem.setAttribute("iconURL", theme.icon);
            }

            if (theme.preview) {
                listitem.setAttribute("previewImage", theme.preview);
            }

            fragment.querySelector(".addonName").value = theme.name || theme.internalName;
            fragment.querySelector(".addonVersion").value = theme.version;

            let descriptionWrap = fragment.querySelector(".descriptionWrap");
            if (theme.description) {
                descriptionWrap.value = theme.description;
            } else {
                descriptionWrap.setAttribute("hidden", "true");
            }

            listitem.id = "urn:mozilla:item:" + theme.id;
            listitem.setAttribute("opType", theme.isPendingUninstall ? OP_NEEDS_UNINSTALL : OP_NONE);
            listitem.setAttribute("addonID", theme.id);
            listitem.setAttribute("description", theme.description);
            listitem.setAttribute("internalName", theme.internalName);
            listitem.setAttribute("name", theme.name);
            listitem.setAttribute("version", theme.version);
            listitem.setAttribute("homepageURL", theme.homepageURL ? theme.homepageURL : "");

            listitem.appendChild(fragment);
            return listitem;
        }

        renderThemesList() {
            let listbox = this._themesListBox;
            let activeInternalName = ThemeInfo.getActive().internalName;

            for (let theme of ThemeInfo.getAll()) {
                let listitem = this._createThemeListItem(theme);
                listbox.appendChild(listitem);

                if (listitem.getAttribute("internalName") == activeInternalName) {
                    listbox.selectItem(listitem);
                    listbox.focus();
                    this.handleThemesListBox();
                }

                for (let restartLink of listitem.querySelectorAll(".restartBrowser")) {
                    restartLink.addEventListener("click", (e) => {
                        this.doGlobalCommand("cmd_restartApp");
                    });
                }
            }
        }

        _setPreviewImage(imageURL) {
            let previewDeck = document.getElementById("previewImageDeck");
            let previewImage = document.getElementById("previewImage");

            if (imageURL) {
                previewImage.src = imageURL;
                previewDeck.selectedIndex = 2;
            }
            else {
                previewImage.src = "";
                previewDeck.selectedIndex = 1;
            }
        }

        restartApp() {
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
    }

    window.addEventListener("DOMContentLoaded", () => {
        g_userChromeOptions = new UserChromeOptions();
        g_userChromeOptions.init();
    });

    window.addEventListener("unload", () => {
        g_userChromeOptions.unload();
    });
}