class OverrideObject
{
    _uri = null;
    QueryInterface = null;

    constructor(uri)
    {
        this._uri = uri;
        this.QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);
    }

    get uri()
    {
        return Services.io.newURI(this._uri);
    }

    newChannel(uri, loadInfo)
    {
        let resolvedURI = this.uri;
        // Forward query string and hash from the about: URI to the chrome:// URI
        if (uri instanceof Ci.nsIURL) {
            let query = uri.query;
            let ref = uri.ref;
            if (query || ref) {
                let spec = resolvedURI.spec;
                if (query) spec += "?" + query;
                if (ref) spec += "#" + ref;
                resolvedURI = Services.io.newURI(spec);
            }
        } else {
            // Fallback: parse query from the spec string
            let spec = uri.spec;
            let qIdx = spec.indexOf("?");
            let hIdx = spec.indexOf("#");
            if (qIdx !== -1 || hIdx !== -1) {
                let suffix = spec.substring(qIdx !== -1 ? qIdx : hIdx);
                resolvedURI = Services.io.newURI(resolvedURI.spec + suffix);
            }
        }
        const ch = Services.io.newChannelFromURIWithLoadInfo(resolvedURI, loadInfo);
        ch.owner = Services.scriptSecurityManager.getSystemPrincipal();
        return ch;
    }

    getURIFlags(uri)
    {
        return Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI;
    }

    getChromeURI(_uri)
    {
        return this.uri;
    }
}

class OverrideFactory
{
    QueryInterface = null;
    uri = null;

    constructor(uri)
    {
        this.uri = uri;
        this.QueryInterface = ChromeUtils.generateQI(["nsIFactory"]);
    }

    createInstance(aIID)
    {
        return (new OverrideObject(this.uri)).QueryInterface(aIID);
    }
}

export class AboutPageManager
{
    static registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    static registeredPages = {};

    /* Generate unique ID every launch */
    static generateFreeCID()
    {
        let uuid;
        do
        {
            uuid = Components.ID(Services.uuid.generateUUID().toString());
        }
        while (this.registrar.isCIDRegistered(uuid));

        return uuid;
    }

    static registerPage(name, uri)
    {
        /* Unregister the page if it has already been registered. */
        this.unregisterPage(name);

        let factory = new OverrideFactory(uri);
        let cid = this.generateFreeCID();

        this.registeredPages[name] = {
            cid: cid,
            factory: factory
        };

        this.registrar.registerFactory(
            cid,
            `about:${name}`,
            `@mozilla.org/network/protocol/about;1?what=${name}`,
            factory
        );
    }

    static unregisterPage(name)
    {
        if (this.registeredPages[name])
        {
            this.registrar.unregisterFactory(
                this.registeredPages[name].cid,
                this.registeredPages[name].factory
            );
            delete this.registeredPages[name];
        }
    }
}