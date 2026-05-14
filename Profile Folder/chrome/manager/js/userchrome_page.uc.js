// ==UserScript==
// @name			userChrome Manager :: Page
// @description 	Registers page for userChrome Manager.
// @author			travy-patty
// @author          https://github.com/travy-patty
// @include			main
// ==/UserScript===

{
    const ABOUT_PAGES = {
        "userchrome": "chrome://uchrm/content/pages/userchrome/userchrome.xhtml",
        "abouttheme": "chrome://uchrm/content/pages/userchrome/about.xhtml",
    };
    const { AboutPageManager } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/AboutPageManager.sys.mjs");

    for (const page in ABOUT_PAGES)
    {
        AboutPageManager.registerPage(
            page,
            ABOUT_PAGES[page]
        );
    }


}