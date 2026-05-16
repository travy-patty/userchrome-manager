// ==UserScript==
// @name			Sample Theme :: Example
// @description 	The best script ever that does great things
// @author          Your Name Here
// @github          https://github.com/travy-patty/userchrome-manager
// @include			main
// ==/UserScript==

{
    async function init() {
        await new Promise(resolve => {
            let delayedStartupObserver = (aSubject, aTopic, aData) => {
                Services.obs.removeObserver(delayedStartupObserver, "browser-delayed-startup-finished");
                resolve();
            };
            Services.obs.addObserver(delayedStartupObserver, "browser-delayed-startup-finished");
        });

        Services.prompt.alert(
            window,
            "It works!",
            "This theme loaded successfully and is running userScripts!"
        );
    }

    init();
}