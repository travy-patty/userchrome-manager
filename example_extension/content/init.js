{
    let defaultBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getDefaultBranch("");
    defaultBranch.setStringPref("exampleExtension.testValue", "It works!");
}