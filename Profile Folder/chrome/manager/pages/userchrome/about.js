var g_genericAbout;

{
    let { ThemeInfo } = ChromeUtils.importESModule("chrome://uchrmjs/content/modules/ThemeInfo.sys.mjs");

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
                extensionHomepage.setAttribute("href", this._theme.homepageURL);
            } else {
                extensionHomepage.hidden = true;
            }

            extensionHomepage.addEventListener("click", this.loadHomepage.bind(this));
        }

        loadHomepage(aEvent) {
            window.close();
            window.opener.openURL(aEvent.target.getAttribute("href"));
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        g_genericAbout = new GenericAbout();
        g_genericAbout.init();
    });
}