var g_genericAbout;

{
    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/uchrmUtils.sys.mjs");

    class GenericAbout {
        _arguments = window.arguments;
        _theme = ThemeInfo.getByInternalName(this._arguments?.[0] ?? "");
        _stringbundle = document.getElementById("extensionsStrings");

        init() {
            console.log(this._theme);

            document.title = this._stringbundle.getFormattedString("aboutWindowTitle", [this._theme.name]);

            document.getElementById("extensionName").value = this._theme.name;
            document.getElementById("extensionVersion").value = this._stringbundle.getFormattedString("aboutWindowVersionString", [this._theme.version]);
            document.getElementById("extensionDescription").appendChild(document.createTextNode(this._theme.description));
            document.getElementById("extensionCreator").value = this._theme.creator;

            let extensionHomepage = document.getElementById("extensionHomepage");
            if (this._theme.homepageURL) {
                extensionHomepage.href = this._theme.homepageURL;
            } else {
                extensionHomepage.hidden = true;
            }
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        g_genericAbout = new GenericAbout();
        g_genericAbout.init();
    });
}