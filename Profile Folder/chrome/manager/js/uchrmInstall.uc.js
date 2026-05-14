// ==UserScript==
// @name         userChrome Manager :: Install
// @description  Processes pending theme uninstalls on startup.
// @author       travy-patty
// @author       https://github.com/travy-patty
// @include      main
// @onlyonce
// ==/UserScript==

{
    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/uchrmUtils.sys.mjs");

    ThemeInfo.processPendingUninstalls();
}
