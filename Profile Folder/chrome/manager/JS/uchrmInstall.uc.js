// ==UserScript==
// @name         userChrome Manager :: Install
// @description  Processes pending theme uninstalls on startup.
// @author       travy-patty
// @author       https://github.com/travy-patty
// @include      main
// @onlyonce
// ==/UserScript==

{
    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/ThemeInfo.sys.mjs");
    let { ExtensionInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/ExtensionInfo.sys.mjs");

    ThemeInfo.processPendingUninstalls();
    ExtensionInfo.processPendingUninstalls();
}
