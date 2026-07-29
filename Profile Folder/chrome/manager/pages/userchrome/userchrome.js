var g_userChromeOptions;

const OP_NONE                         = "none";
const OP_NEEDS_INSTALL                = "needs-install";
const OP_NEEDS_UPGRADE                = "needs-upgrade";
const OP_NEEDS_UNINSTALL              = "needs-uninstall";
const OP_NEEDS_ENABLE                 = "needs-enable";
const OP_NEEDS_DISABLE                = "needs-disable";

const nsIFilePicker = Components.interfaces.nsIFilePicker;

let gView = null;

// manages the last-selected attribute for the view buttons and richlistbox
function updateLastSelected(aView)
{
    let viewGroup = document.getElementById("viewGroup");
    let viewButton = document.getElementById(aView + "-view");
    viewGroup.setAttribute("last-selected", aView);
    viewGroup.selectedItem = viewButton;
}

function showView(aView)
{
    if (gView == aView)
        return;

    updateLastSelected(aView);
    gView = aView;

    document.getElementById("extensionsBox").hidden = (gView != "extensions");
    document.getElementById("themesBox").hidden     = (gView != "themes");

    g_userChromeOptions.onCommandUpdate();
}

{
    // Early init shenanigans. Definitely a result of Mozilla moving stuff
    // from XBL to custom elements.
    setTimeout(() => {
        let viewGroup = document.getElementById("viewGroup");
        if (viewGroup.hasAttribute("last-selected") &&
            document.getElementById(viewGroup.getAttribute("last-selected") + "-view"))
        {
            showView(viewGroup.getAttribute("last-selected"));
        }
        else
        {
            showView("themes");
        };
    }, 10);

    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/ThemeInfo.sys.mjs");
    let { ExtensionInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/ExtensionInfo.sys.mjs");

    class UserChromeOptions {
        _stringbundle = null;

        get stringbundle() {
            if (!this._stringbundle) {
                this._stringbundle = document.getElementById("optionsBundle");
            }
            return this._stringbundle;
        }

        get _themesBox() {
            return document.getElementById("themesBox");
        }

        get _themesListBox() {
            return document.getElementById("themesView");
        }

        get _extensionsListBox() {
            return document.getElementById("extensionsView");
        }

        get _globalCommandSet() {
            return document.getElementById("globalCommands");
        }

        get _commandSet() {
            return document.getElementById("addonsCommands");
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
            this.renderExtensionsList();
            this.renderThemesList();
            this._initDragDrop();

            this._commandSet.addEventListener("command", (e) => {
                this.doThemeCommand(e.target.id);
                this.updateGlobalCommands();
            });

            this._globalCommandSet.addEventListener("command", (e) => {
                this.doGlobalCommand(e.target.id);
                this.updateGlobalCommands();
            });

            this._themesListBox.addEventListener("select", this.onCommandUpdate.bind(this));
            this._extensionsListBox.addEventListener("select", this.onCommandUpdate.bind(this));
            this._themesListBox.addEventListener("select", this.handleThemesListBox.bind(this));
            this._contextMenu.addEventListener("popupshowing", this.onPopupShowing.bind(this));

            this.updateGlobalCommands();
            this.onCommandUpdate();
        }

        onPopupShowing(event) {
            let listBox = (gView == "extensions") ? this._extensionsListBox : this._themesListBox;
            let selectedItem = listBox.selectedItem;

            const hide = (id) => document.getElementById("menuitem_" + id).setAttribute("hidden", "true");
            const show = (id) => document.getElementById("menuitem_" + id).removeAttribute("hidden");

            if (selectedItem.getAttribute("opType") == OP_NEEDS_UNINSTALL) {

                hide("uninstall");
                show("cancelUninstall");
            }
            else
            {
                show("uninstall");
                hide("cancelUninstall");
            }

            if (selectedItem.getAttribute("isExtension") == 1)
            {
                hide("useTheme");
                show("options");

                if (selectedItem.getAttribute("isDisabled") == 1)
                {
                    show("enable");
                    hide("disable");
                }
                else
                {
                    hide("enable");
                    show("disable");
                }
            }
            else
            {
                show("useTheme");
                hide("options");
                hide("enable");
                hide("disable");
            }

            document.getElementById("menuitem_about").setAttribute("label", this.stringbundle.getFormattedString("aboutAddon", [selectedItem.getAttribute("name")]));
        }

        globalCommands = {
            cmd_close: (e) => {
                window.close();
            },

            cmd_restartApp: (e) => {
                this.restartApp();
            },

            cmd_installFile: (e) => {
                this.installSkin();
            }
        }

        addonsCommands = {
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

            cmd_options: (aSelectedItem) => {
                if (!aSelectedItem)
                    return;

                let optionsURL = aSelectedItem.getAttribute("optionsURL");
                if (optionsURL)
                {
                    let windows = Cc["@mozilla.org/appshell/window-mediator;1"]
                                        .getService(Ci.nsIWindowMediator)
                                        .getEnumerator(null);
                    while (windows.hasMoreElements())
                    {
                        let win = windows.getNext();
                        if (win.document.documentURI == optionsURL)
                        {
                            win.focus();
                            return;
                        }
                    }

                    openDialog(optionsURL, "", "chrome,titlebar,toolbar,centerscreen,modal");
                }
            },

            cmd_disable: (aSelectedItem) => {
                if (!aSelectedItem)
                    return;

                let extension = ExtensionInfo.getByInternalName(aSelectedItem.getAttribute("internalName"));
                if (extension)
                {
                    extension.disable();

                    if (aSelectedItem.getAttribute("initiallyDisabled") == "1")
                    {
                        aSelectedItem.setAttribute("opType", OP_NONE);
                    }
                    else
                    {
                        aSelectedItem.setAttribute("opType", OP_NEEDS_DISABLE);
                    }
                    aSelectedItem.setAttribute("isDisabled", "1")
                }

                this.onCommandUpdate();
            },

            cmd_enable: (aSelectedItem) => {
                if (!aSelectedItem)
                    return;

                let extension = ExtensionInfo.getByInternalName(aSelectedItem.getAttribute("internalName"));
                if (extension)
                {
                    extension.enable();

                    if (aSelectedItem.getAttribute("initiallyDisabled") != "1")
                    {
                        aSelectedItem.setAttribute("opType", OP_NONE);
                    }
                    else
                    {
                        aSelectedItem.setAttribute("opType", OP_NEEDS_ENABLE);
                    }
                    aSelectedItem.setAttribute("isDisabled", "0");
                }

                this.onCommandUpdate();
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

                let uninstallResult = Services.prompt.confirmEx(
                    window,
                    this.stringbundle.getFormattedString("uninstall_prompt_title", [aSelectedItem.getAttribute("name")]),
                    this.stringbundle.getFormattedString("uninstall_prompt_message", [aSelectedItem.getAttribute("name")]),
                    Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
                    Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL,
                    this.stringbundle.getString("uninstall_prompt_uninstall"),
                    null, null, null, {}
                );

                if (uninstallResult == 0) {
                    let info = (gView == "extensions") ? ExtensionInfo : ThemeInfo;
                    info.getByInternalName(currentTheme).markForUninstall();
                    aSelectedItem.setAttribute("opType", OP_NEEDS_UNINSTALL);
                };
            },

            cmd_cancelUninstall: (aSelectedItem) => {
                let info = (gView == "extensions") ? ExtensionInfo : ThemeInfo;
                if (info.getByInternalName(aSelectedItem.getAttribute("internalName")).isPendingUninstall) {
                    info.getByInternalName(aSelectedItem.getAttribute("internalName")).cancelUninstall();
                }

                aSelectedItem.setAttribute("opType", OP_NONE);
            },
        }

        isCommandEnabled(aCommand) {
            let listBox = (gView == "extensions") ? this._extensionsListBox : this._themesListBox;
            let selectedItem = listBox.selectedItem;
            if (!selectedItem)
                return;

            let basicConditions;
            let pendingUninstall;
            if (selectedItem.getAttribute("isExtension") == 1)
            {
                basicConditions = true;
                pendingUninstall = ExtensionInfo.getByInternalName(selectedItem.getAttribute("internalName")).isPendingUninstall;
            }
            else
            {
                basicConditions = selectedItem.getAttribute("internalName") != ThemeInfo.getActive().internalName;
                pendingUninstall = ThemeInfo.getByInternalName(selectedItem.getAttribute("internalName")).isPendingUninstall;
            }

            switch (aCommand) {
                case "cmd_useTheme":
                    return basicConditions && !pendingUninstall &&
                           selectedItem.getAttribute("compatible") !== "false" &&
                           selectedItem.getAttribute("opType") !== OP_NEEDS_ENABLE;
                case "cmd_uninstall":
                    return basicConditions && !pendingUninstall && 
                           selectedItem.getAttribute("internalName") !== "default";
                case "cmd_cancelUninstall":
                    return basicConditions && pendingUninstall &&
                           selectedItem.getAttribute("internalName") !== "default";
                case "cmd_about":
                    return selectedItem.getAttribute("opType") !== OP_NEEDS_INSTALL;
                case "cmd_homepage":
                    return selectedItem.getAttribute("homepageURL") != "";
                case "cmd_options":
                    return selectedItem.getAttribute("initiallyDisabled") != "1" &&
                            selectedItem.getAttribute("isDisabled") != "1" &&
                            selectedItem.getAttribute("optionsURL") != "";
                case "cmd_enable":
                    return selectedItem.getAttribute("isDisabled") == "1";
                case "cmd_disable":
                    return selectedItem.getAttribute("isDisabled") != "1";
            }

            return false;
        }

        doThemeCommand(aCommand) {
            let listBox = (gView == "extensions") ? this._extensionsListBox : this._themesListBox;
            this.addonsCommands[aCommand](listBox.selectedItem);

            this.onCommandUpdate();
            listBox.focus();
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

        _addInstalledAddOn(addOn) {
            let existing = document.getElementById("urn:mozilla:item:" + addOn.id);
            if (existing) {
                existing.remove();
            }

            if (addOn.compatible) {
                for (let listitem of this._themesListBox.itemChildren) {
                    if (listitem.getAttribute("opType") === OP_NEEDS_ENABLE) {
                        listitem.setAttribute("opType", OP_NONE);
                    }
                }

                if (!addOn.isExtension)
                    addOn.activate();
            }

            let listitem = addOn.isExtension ? this._createExtensionListItem(addOn) : this._createThemeListItem(addOn);

            if (addOn.compatible) {
                listitem.setAttribute("opType", OP_NEEDS_ENABLE);
            }

            for (let restartLink of listitem.querySelectorAll(".restartBrowser")) {
                restartLink.addEventListener("click", () => {
                    this.doGlobalCommand("cmd_restartApp");
                });
            }

            let listBox = addOn.isExtension ? this._extensionsListBox : this._themesListBox;
            listBox.appendChild(listitem);

            if (addOn.isExtension)
                showView("extensions");
            else
                showView("themes");

            listBox.selectItem(listitem);
            listBox.focus();
            if (!addOn.isExtension)
                this.handleThemesListBox();



            this.onCommandUpdate();
            this.updateGlobalCommands();
        }

        _createExtensionListItem(extension) {
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
                                <label class="statusMsgLabel" anonid="uninstallLabel" crop="end" />

                                <label class="text-link startMsgLink restartBrowser" />
                            </hbox>
                            <hbox class="enablePendingShow statusMsg">
                                <label class="statusMsgLabel" anonid="enableLabel" crop="end" />

                                <label class="text-link startMsgLink restartBrowser" />
                            </hbox>
                            <hbox class="disablePendingShow statusMsg">
                                <label class="statusMsgLabel" anonid="disableLabel" crop="end" />

                                <label class="text-link startMsgLink restartBrowser" />
                            </hbox>
                            <hbox class="incompatibleBox attention">
                                <label class="statusMsgLabel" anonid="incompatibleLabel" crop="end"/>
                            </hbox>
                        </vbox>
                        <hbox flex="1" class="selectedButtons">
                            <button class="uninstallHide themeButton optionsButton" command="cmd_options"/>
                            <spacer flex="1" />
                            <button class="uninstallHide enableShow disableHide disableButton" command="cmd_disable"/>
                            <button class="uninstallHide disableShow enableHide enableButton" command="cmd_enable"/>
                            <button class="uninstallHide uninstallButton" command="cmd_uninstall"/>
                            <button class="uninstallShow cancelUninstall" command="cmd_cancelUninstall"/>
                        </hbox>
                    </vbox>
                </hbox>
            `);

            if (extension.icon) {
                fragment.querySelector(".addonIcon").src = extension.icon;
                fragment.querySelector(".addon-icon").setAttribute("iconURL", extension.icon);
                listitem.setAttribute("iconURL", extension.icon);
            }

            fragment.querySelector(".addonName").value = extension.name || extension.internalName;
            fragment.querySelector(".addonVersion").value = extension.version;

            let descriptionWrap = fragment.querySelector(".descriptionWrap");
            if (extension.description) {
                descriptionWrap.value = extension.description;
            } else {
                descriptionWrap.setAttribute("hidden", "true");
            }

            listitem.id = "urn:mozilla:item:" + extension.id;
            listitem.setAttribute("opType", extension.isPendingUninstall ? OP_NEEDS_UNINSTALL : OP_NONE);
            listitem.setAttribute("addonID", extension.id);
            listitem.setAttribute("description", extension.description);
            listitem.setAttribute("internalName", extension.internalName);
            listitem.setAttribute("name", extension.name);
            listitem.setAttribute("version", extension.version);
            listitem.setAttribute("compatible", extension.compatible);
            listitem.setAttribute("isExtension", "1");
            listitem.setAttribute("homepageURL", extension.homepageURL ? extension.homepageURL : "");
            listitem.setAttribute("optionsURL", extension.optionsURL ? extension.optionsURL : "");
            listitem.setAttribute("isDisabled", extension.disabled ? "1" : "0");
            listitem.setAttribute("initiallyDisabled", extension.disabled ? "1" : "0");

            if (!extension.compatible) {
                let incompatibleLabel = fragment.querySelector("[anonid='incompatibleLabel']");
                incompatibleLabel.value = this.stringbundle.getFormattedString("incompatibleAddonMsg", [Services.appinfo.name, Services.appinfo.version]);
            }

            let uninstallLabel = fragment.querySelector("[anonid='uninstallLabel']");
            uninstallLabel.value = this.stringbundle.getFormattedString("toBeUninstalled_label", [Services.appinfo.name]);

            let enableLabel = fragment.querySelector("[anonid='enableLabel']");
            enableLabel.value = this.stringbundle.getFormattedString("toBeEnabled_label", [Services.appinfo.name]);

            let disableLabel = fragment.querySelector("[anonid='disableLabel']");
            disableLabel.value = this.stringbundle.getFormattedString("toBeDisabled_label", [Services.appinfo.name]);

            let restartBrowser = fragment.querySelectorAll(".restartBrowser");
            for (let link of restartBrowser) {
                link.value = this.stringbundle.getFormattedString("cmd_restartApp_label", [Services.appinfo.name]);
                link.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_restartApp_tooltip", [Services.appinfo.name]));
            }

            let cancelUninstallButton = fragment.querySelector(".cancelUninstall");
            cancelUninstallButton.setAttribute("label", this.stringbundle.getString("cancel_label"));
            cancelUninstallButton.setAttribute("accesskey", this.stringbundle.getString("cancel_accesskey"));
            cancelUninstallButton.setAttribute("tooltiptext", this.stringbundle.getString("cmd_cancelUninstall_tooltip"));

            let uninstallButton = fragment.querySelector(".uninstallButton");
            uninstallButton.setAttribute("label", this.stringbundle.getString("cmd_uninstall_label"));
            uninstallButton.setAttribute("accesskey", this.stringbundle.getString("cmd_uninstall_accesskey"));
            uninstallButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_uninstall_tooltip", [Services.appinfo.name]));

            let optionsButton = fragment.querySelector(".optionsButton");
            optionsButton.setAttribute("label", this.stringbundle.getString("cmd_options_label"));
            optionsButton.setAttribute("accesskey", this.stringbundle.getString("cmd_options_accesskey"));
            optionsButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_options_tooltip", [Services.appinfo.name]));

            let enableButton = fragment.querySelector(".enableButton");
            enableButton.setAttribute("label", this.stringbundle.getString("cmd_enable_label"));
            enableButton.setAttribute("accesskey", this.stringbundle.getString("cmd_enable_accesskey"));
            enableButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_enable_tooltip", [Services.appinfo.name]));

            let disableButton = fragment.querySelector(".disableButton");
            disableButton.setAttribute("label", this.stringbundle.getString("cmd_disable_label"));
            disableButton.setAttribute("accesskey", this.stringbundle.getString("cmd_disable_accesskey"));
            disableButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_disable_tooltip", [Services.appinfo.name]));

            listitem.appendChild(fragment);
            return listitem;
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
                                <label class="statusMsgLabel" anonid="uninstallLabel" crop="end" />

                                <label class="text-link startMsgLink restartBrowser" />
                            </hbox>
                            <hbox class="enableShow statusMsg">
                                <label class="statusMsgLabel" anonid="enableLabel" crop="end" />

                                <label class="text-link startMsgLink restartBrowser" />
                            </hbox>
                            <hbox class="incompatibleBox attention">
                                <label class="statusMsgLabel" anonid="incompatibleLabel" crop="end"/>
                            </hbox>
                        </vbox>
                        <hbox flex="1" class="selectedButtons">
                            <button class="uninstallHide themeButton useThemeButton" command="cmd_useTheme"/>
                            <spacer flex="1" />
                            <button class="uninstallHide uninstallButton" command="cmd_uninstall"/>
                            <button class="uninstallShow cancelUninstall" command="cmd_cancelUninstall"/>
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
            listitem.setAttribute("compatible", theme.compatible);
            listitem.setAttribute("isExtension", "0");
            listitem.setAttribute("homepageURL", theme.homepageURL ? theme.homepageURL : "");

            if (!theme.compatible) {
                let incompatibleLabel = fragment.querySelector("[anonid='incompatibleLabel']");
                incompatibleLabel.value = this.stringbundle.getFormattedString("incompatibleAddonMsg", [Services.appinfo.name, Services.appinfo.version]);
            }

            let uninstallLabel = fragment.querySelector("[anonid='uninstallLabel']");
            uninstallLabel.value = this.stringbundle.getFormattedString("toBeUninstalled_label", [Services.appinfo.name]);

            let enableLabel = fragment.querySelector("[anonid='enableLabel']");
            enableLabel.value = this.stringbundle.getFormattedString("toBeEnabled_label", [Services.appinfo.name]);

            let restartBrowser = fragment.querySelectorAll(".restartBrowser");
            for (let link of restartBrowser) {
                link.value = this.stringbundle.getFormattedString("cmd_restartApp_label", [Services.appinfo.name]);
                link.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_restartApp_tooltip", [Services.appinfo.name]));
            }

            let cancelUninstallButton = fragment.querySelector(".cancelUninstall");
            cancelUninstallButton.setAttribute("label", this.stringbundle.getString("cancel_label"));
            cancelUninstallButton.setAttribute("accesskey", this.stringbundle.getString("cancel_accesskey"));
            cancelUninstallButton.setAttribute("tooltiptext", this.stringbundle.getString("cmd_cancelUninstall_tooltip"));

            let uninstallButton = fragment.querySelector(".uninstallButton");
            uninstallButton.setAttribute("label", this.stringbundle.getString("cmd_uninstall_label"));
            uninstallButton.setAttribute("accesskey", this.stringbundle.getString("cmd_uninstall_accesskey"));
            uninstallButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_uninstall_tooltip", [Services.appinfo.name]));

            let useThemeButton = fragment.querySelector(".useThemeButton");
            useThemeButton.setAttribute("label", this.stringbundle.getString("cmd_useTheme_label"));
            useThemeButton.setAttribute("accesskey", this.stringbundle.getString("cmd_useTheme_accesskey"));
            useThemeButton.setAttribute("tooltiptext", this.stringbundle.getFormattedString("cmd_useTheme_tooltip", [Services.appinfo.name]));

            listitem.appendChild(fragment);
            return listitem;
        }

        renderExtensionsList() {
            let listbox = this._extensionsListBox;

            let first = true;
            for (let theme of ExtensionInfo.getAll()) {
                let listitem = this._createExtensionListItem(theme);
                listbox.appendChild(listitem);

                if (gView == "extensions" && first)
                {
                    listbox.selectItem(listitem);
                    listbox.focus();
                    first = false;
                }

                for (let restartLink of listitem.querySelectorAll(".restartBrowser")) {
                    restartLink.addEventListener("click", (e) => {
                        this.doGlobalCommand("cmd_restartApp");
                    });
                }
            }
        }

        renderThemesList() {
            let listbox = this._themesListBox;
            let activeInternalName = ThemeInfo.getActive().internalName;

            for (let theme of ThemeInfo.getAll()) {
                let listitem = this._createThemeListItem(theme);
                listbox.appendChild(listitem);

                if (listitem.getAttribute("internalName") == activeInternalName) {
                    if (gView == "themes")
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

        installSkin() {
            let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
            fp.init(
                window.browsingContext,
                this.stringbundle.getString("installThemePickerTitle"),
                Ci.nsIFilePicker.modeOpen
            );
            fp.appendFilter(this.stringbundle.getString("themesFilter"), "*.zip");
            fp.appendFilters(Ci.nsIFilePicker.filterAll);

            fp.open(rv => {
                if (rv != Ci.nsIFilePicker.returnOK) return;
                this._doInstall(fp.file);
            });
        }

        _doInstall(file, overwrite = false) {
            let theme;

            try {
                theme = ThemeInfo.installFromZip(file, { overwrite });
            }
            catch (err) {
                if (err?.code == "NOT_COMPATIBLE") {
                    Services.prompt.alert(
                        window,
                        this.stringbundle.getString("install_incompatible_title"),
                        this.stringbundle.getFormattedString("install_incompatible_message", [
                            err.themeName, err.themeVersion,
                            Services.appinfo.name, Services.appinfo.version,
                            err.themeName, err.themeVersion,
                            Services.appinfo.name,
                            err.minVersion ?? "?",
                            err.maxVersion ?? "?"
                        ])
                    );
                    return;
                }

                if (err?.code == "ALREADY_EXISTS") {
                    let overwriteResult = Services.prompt.confirmEx(
                        window,
                        this.stringbundle.getString("install_overwrite_title"),
                        this.stringbundle.getFormattedString("install_overwrite_message", [err.themeName]),
                        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
                        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL,
                        this.stringbundle.getString("install_overwrite_button"),
                        null, null, null, {}
                    );

                    if (overwriteResult == 0) {
                        this._doInstall(file, true);
                    };
                    return;
                }

                Services.prompt.alert(
                    window,
                    this.stringbundle.getString("install_error_title"),
                    this.stringbundle.getString("install_error_message")
                );

                return;
            }

            this._addInstalledAddOn(theme);
        }

        _initDragDrop() {
            this._themesBox.addEventListener("dragenter", (e) => {
                if (!e.dataTransfer.types.includes("Files"))
                    return;
                e.preventDefault();
                this._themesBox.setAttribute("dragover", "true");
            });

            this._themesBox.addEventListener("dragover", (e) => {
                if (!e.dataTransfer.types.includes("Files"))
                    return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
            });

            this._themesBox.addEventListener("dragleave", (e) => {
                if (!this._themesBox.contains(e.relatedTarget)) {
                    this._themesBox.removeAttribute("dragover");
                }
            });

            this._themesBox.addEventListener("drop", (e) => {
                e.preventDefault();
                this._themesBox.removeAttribute("dragover");

                for (let i = 0; i < e.dataTransfer.mozItemCount; i++) {
                    let file = e.dataTransfer.mozGetDataAt("application/x-moz-file", i);
                    if (!(file instanceof Ci.nsIFile))
                        continue;
                    if (!file.leafName.toLowerCase().endsWith(".zip"))
                        continue;
                    this._doInstall(file);
                }
            });
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        g_userChromeOptions = new UserChromeOptions();
        g_userChromeOptions.init();
    });
}