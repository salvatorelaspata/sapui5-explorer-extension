/**
 * SAPUI5 Explorer - Extraction Engine
 * Injected into page's MAIN world via chrome.scripting.executeScript
 * Compatible with UI5 1.x (1.71+) and UI5 2.x
 */
function extractSAPUI5Data() {
  // Guard
  if (typeof sap === "undefined" || !sap.ui) {
    return { _error: "SAPUI5 not detected on this page." };
  }

  const result = {
    _meta: { timestamp: new Date().toISOString(), ui5Version: null, isV2: false },
    _errors: [],
    _truncations: []
  };

  // --- Helpers ---

  function safeGet(label, fn) {
    try {
      return fn();
    } catch (e) {
      result._errors.push({ section: label, error: e.message });
      return null;
    }
  }

  function truncate(str, max) {
    if (!str || typeof str !== "string") return str;
    return str.length > max ? str.substring(0, max) + "..." : str;
  }

  function noteTruncation(section, shown, total) {
    result._truncations.push({ section, shown, total });
  }

  // --- Version Detection ---

  const version = sap.ui.version || "unknown";
  const majorVersion = parseInt(version.split(".")[0], 10);
  const isV2 = majorVersion >= 2;
  result._meta.ui5Version = version;
  result._meta.isV2 = isV2;

  // --- Compatibility Layer ---

  let _core = null;
  let _config = null;

  function getCore() {
    if (_core) return _core;
    try { _core = sap.ui.getCore(); } catch (e) { /* V2 may remove this */ }
    return _core;
  }

  function getConfig() {
    if (_config) return _config;
    try {
      const core = getCore();
      if (core && typeof core.getConfiguration === "function") {
        _config = core.getConfiguration();
      }
    } catch (e) { /* ignored */ }
    return _config;
  }

  function compatGetTheme() {
    try {
      const mod = sap.ui.require("sap/ui/core/Theming");
      if (mod && typeof mod.getTheme === "function") return mod.getTheme();
    } catch (e) { /* fallback */ }
    const cfg = getConfig();
    return cfg && typeof cfg.getTheme === "function" ? cfg.getTheme() : null;
  }

  function compatGetLanguage() {
    try {
      const mod = sap.ui.require("sap/base/i18n/Localization");
      if (mod && typeof mod.getLanguage === "function") return mod.getLanguage();
    } catch (e) { /* fallback */ }
    const cfg = getConfig();
    return cfg && typeof cfg.getLanguage === "function" ? cfg.getLanguage() : null;
  }

  function compatGetRTL() {
    try {
      const mod = sap.ui.require("sap/base/i18n/Localization");
      if (mod && typeof mod.getRTL === "function") return mod.getRTL();
    } catch (e) { /* fallback */ }
    const cfg = getConfig();
    return cfg && typeof cfg.getRTL === "function" ? cfg.getRTL() : null;
  }

  function compatGetDebug() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("sap-ui-debug")) return true;
    if (window["sap-ui-debug"] === true) return true;
    const cfg = getConfig();
    return cfg && typeof cfg.getDebug === "function" ? cfg.getDebug() : false;
  }

  function compatGetAccessibility() {
    const cfg = getConfig();
    return cfg && typeof cfg.getAccessibility === "function" ? cfg.getAccessibility() : null;
  }

  function compatGetContentDensity() {
    if (document.body.classList.contains("sapUiSizeCompact")) return "compact";
    if (document.body.classList.contains("sapUiSizeCozy")) return "cozy";
    if (document.body.classList.contains("sapUiSizeCondensed")) return "condensed";
    return null;
  }

  // --- Section 1: Framework ---

  result.framework = safeGet("framework", () => {
    let buildTimestamp = null;
    try {
      const vi = typeof sap.ui.getVersionInfo === "function" ? sap.ui.getVersionInfo() : null;
      if (vi && vi.buildTimestamp) buildTimestamp = vi.buildTimestamp;
    } catch (e) { /* ignored */ }

    return {
      version: version,
      buildTimestamp: buildTimestamp,
      theme: compatGetTheme(),
      language: compatGetLanguage(),
      debug: compatGetDebug(),
      rtl: compatGetRTL(),
      accessibility: compatGetAccessibility(),
      contentDensity: compatGetContentDensity()
    };
  });

  // --- Section 1b: Loaded libraries (with versions) ---

  result.libraries = safeGet("libraries", () => {
    const libs = [];
    try {
      const vi = typeof sap.ui.getVersionInfo === "function" ? sap.ui.getVersionInfo() : null;
      if (vi && Array.isArray(vi.libraries)) {
        vi.libraries.forEach(l => libs.push({
          name: l.name,
          version: l.version,
          buildTimestamp: l.buildTimestamp || null,
          source: "versionInfo"
        }));
        return libs;
      }
    } catch (e) { /* fallback */ }
    // Fallback: Core.getLoadedLibraries
    try {
      const core = getCore();
      if (core && typeof core.getLoadedLibraries === "function") {
        const loaded = core.getLoadedLibraries();
        for (const name in loaded) {
          libs.push({
            name: name,
            version: loaded[name].version || null,
            source: "core"
          });
        }
      }
    } catch (e) { /* skip */ }
    return libs;
  }) || [];

  // --- Section 1c: Loader config ---

  result.loader = safeGet("loader", () => {
    const info = { async: null, paths: null, modulesCount: null };
    try {
      if (sap.ui.loader && typeof sap.ui.loader.config === "function") {
        const cfg = sap.ui.loader.config();
        if (cfg) {
          info.async = !!cfg.async;
          info.paths = cfg.paths ? Object.keys(cfg.paths).length : 0;
        }
      }
    } catch (e) { /* skip */ }
    try {
      if (sap.ui.loader && sap.ui.loader._ && typeof sap.ui.loader._.getAllModules === "function") {
        info.modulesCount = Object.keys(sap.ui.loader._.getAllModules()).length;
        info._privateApi = true;
      }
    } catch (e) { /* skip */ }
    return info;
  });

  // --- Section 2: URL Analysis ---

  result.url = safeGet("url", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const params = {};
    for (const [key, value] of urlParams.entries()) {
      params[key] = value;
    }
    return {
      fullUrl: window.location.href,
      parameters: params,
      fioriIntent: hash.startsWith("#") ? hash.split("&")[0] : null,
      currentHash: hash || null,
      technicalFlags: {
        debugActive: urlParams.has("sap-ui-debug"),
        debugValue: urlParams.get("sap-ui-debug"),
        flexDisabled: urlParams.get("sap-ui-fl-control-error") === "true",
        themeOverride: urlParams.get("sap-theme") || null,
        cacheBusterToken: urlParams.get("sap-ui-appCacheBuster") || null
      }
    };
  });

  // --- Section 3: Launchpad / User ---

  result.launchpad = safeGet("launchpad", () => {
    if (typeof sap.ushell === "undefined" || !sap.ushell.Container) return null;
    const user = sap.ushell.Container.getUser();
    const info = {
      user: user ? {
        id: user.getId(),
        name: user.getFullName(),
        language: typeof user.getLanguage === "function" ? user.getLanguage() : null,
        theme: typeof user.getTheme === "function" ? user.getTheme() : null,
        contentDensity: typeof user.getContentDensity === "function" ? user.getContentDensity() : null
      } : null,
      services: []
    };
    try {
      const ps = sap.ushell.Container.getService("Personalization");
      info.personalization = !!ps;
    } catch (e) { info.personalization = false; }
    // Probe known services
    ["CrossApplicationNavigation", "URLParsing", "AppLifeCycle", "UserInfo", "NavTargetResolution", "ShellNavigation"].forEach(svcName => {
      try {
        const svc = sap.ushell.Container.getService(svcName);
        if (svc) info.services.push(svcName);
      } catch (e) { /* not available */ }
    });
    // Current app via AppLifeCycle
    try {
      const alc = sap.ushell.Container.getService("AppLifeCycle");
      if (alc && typeof alc.getCurrentApplication === "function") {
        const app = alc.getCurrentApplication();
        if (app) {
          info.currentApp = {
            applicationType: app.applicationType || null,
            componentInstance: app.componentInstance ? app.componentInstance.getId() : null,
            homePage: !!app.homePage,
            getIntent: typeof app.getIntent === "function"
          };
        }
      }
    } catch (e) { /* skip */ }
    return info;
  });

  // --- Section 4-8: Components, Models, Views, Controllers, Bindings ---

  const componentData = safeGet("components", () => {
    const allComponents = (sap.ui.core.Component && sap.ui.core.Component.registry && sap.ui.core.Component.registry.all()) || {};
    const components = [];
    const models = [];
    const views = [];
    const controllers = [];
    const bindings = [];

    // Build framework method exclusion set
    const frameworkMethods = new Set();
    try {
      const ControllerClass = sap.ui.require("sap/ui/core/mvc/Controller");
      if (ControllerClass && ControllerClass.prototype) {
        Object.getOwnPropertyNames(ControllerClass.prototype).forEach(m => frameworkMethods.add(m));
      }
    } catch (e) { /* ignore */ }
    ["constructor", "onInit", "onExit", "onBeforeRendering", "onAfterRendering",
      "getView", "getOwnerComponent", "byId", "getRouter", "getModel", "setModel",
      "getResourceBundle", "createId", "getMetadata", "init", "exit", "destroy",
      "getEventBus", "attachEvent", "detachEvent", "fireEvent"
    ].forEach(m => frameworkMethods.add(m));

    const MAX_CONTROLS = 20000;
    const MAX_DEPTH = 50;
    let totalControls = 0;
    let customControls = 0;
    let busyControls = 0;
    let truncatedTraversal = false;

    function extractBindingsFromControl(control, viewId) {
      // Properties via mBindingInfos
      if (control.mBindingInfos) {
        for (const prop in control.mBindingInfos) {
          try {
            const bInfo = control.mBindingInfos[prop];
            if (!bInfo) continue;
            const path = bInfo.path || (bInfo.parts && bInfo.parts.map(p => p.path).filter(Boolean).join(", "));
            if (!path) continue;
            // Determine if it is an aggregation binding
            const isAggregation = !!bInfo.template || !!bInfo.factory;
            bindings.push({
              viewId: viewId,
              controlId: control.getId(),
              controlType: control.getMetadata().getName(),
              property: prop,
              path: path,
              model: bInfo.model || (bInfo.parts && bInfo.parts[0] && bInfo.parts[0].model) || "default",
              kind: isAggregation ? "aggregation" : "property",
              mode: bInfo.mode || null
            });
          } catch (e) { /* skip */ }
        }
      }
      // Object binding (element binding context)
      try {
        if (typeof control.getObjectBinding === "function") {
          const ob = control.getObjectBinding();
          if (ob && typeof ob.getPath === "function") {
            bindings.push({
              viewId: viewId,
              controlId: control.getId(),
              controlType: control.getMetadata().getName(),
              property: "(objectBinding)",
              path: ob.getPath(),
              model: ob.getModel && ob.getModel().getMetadata ? "default" : "default",
              kind: "object",
              mode: null
            });
          }
        }
      } catch (e) { /* skip */ }
    }

    function traverseControl(control, viewId, currentComponentId, depth, localViews, localControllers) {
      if (!control || depth > MAX_DEPTH) return;
      if (totalControls >= MAX_CONTROLS) {
        truncatedTraversal = true;
        return;
      }
      totalControls++;

      // Custom control detection
      try {
        const tName = control.getMetadata().getName();
        if (tName && !tName.startsWith("sap.")) customControls++;
      } catch (e) { /* skip */ }

      // Busy
      try {
        if (typeof control.getBusy === "function" && control.getBusy()) busyControls++;
      } catch (e) { /* skip */ }

      // Detect View
      if (typeof control.isA === "function" && control.isA("sap.ui.core.mvc.View")) {
        const vId = control.getId();
        const vMeta = control.getMetadata();
        const ctrl = typeof control.getController === "function" ? control.getController() : null;

        localViews.push({
          componentId: currentComponentId,
          viewId: vId,
          viewType: vMeta.getName(),
          controllerName: ctrl && ctrl.getMetadata ? ctrl.getMetadata().getName() : null
        });

        if (ctrl) {
          const customMethods = [];
          const proto = Object.getPrototypeOf(ctrl);
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(name => {
              if (name !== "constructor" &&
                typeof proto[name] === "function" &&
                !frameworkMethods.has(name) &&
                !name.startsWith("_")) {
                customMethods.push(name);
              }
            });
          }
          localControllers.push({
            componentId: currentComponentId,
            viewId: vId,
            controllerName: ctrl.getMetadata().getName(),
            customMethods: customMethods.sort()
          });
        }

        viewId = vId;
      }

      // Bindings (without whitelist)
      if (viewId) extractBindingsFromControl(control, viewId);

      // Recurse into all aggregations
      if (typeof control.getMetadata === "function") {
        try {
          const allAggr = control.getMetadata().getAllAggregations();
          for (const aggrName in allAggr) {
            try {
              const children = control.getAggregation(aggrName);
              if (Array.isArray(children)) {
                children.forEach(child => traverseControl(child, viewId, currentComponentId, depth + 1, localViews, localControllers));
              } else if (children && typeof children === "object" && typeof children.getMetadata === "function") {
                traverseControl(children, viewId, currentComponentId, depth + 1, localViews, localControllers);
              }
            } catch (e) { /* skip aggregation */ }
          }
        } catch (e) { /* skip */ }
      }
    }

    function extractModelFromComponent(comp, modelName, m, compId) {
      try {
        const typeName = m.getMetadata().getName();
        const serviceUrl = typeof m.getServiceUrl === "function" ? m.getServiceUrl() : null;

        let odataVersion = null;
        if (typeName.includes(".v4.")) odataVersion = "v4";
        else if (typeName.includes(".v2.")) odataVersion = "v2";
        else if (/odata/i.test(typeName)) odataVersion = "v1";

        let metadataLoaded = false;
        let entityTypes = [];
        let entitySets = [];
        let functionImports = [];
        let entityTypesTruncated = false;
        let defaultBindingMode = null;
        let hasPendingChanges = null;
        let annotationUrls = [];

        try {
          if (typeof m.getDefaultBindingMode === "function") defaultBindingMode = m.getDefaultBindingMode();
        } catch (e) { /* skip */ }
        try {
          if (typeof m.hasPendingChanges === "function") hasPendingChanges = m.hasPendingChanges();
        } catch (e) { /* skip */ }
        try {
          if (typeof m.getServiceAnnotations === "function") {
            const ann = m.getServiceAnnotations();
            if (ann) annotationUrls = Object.keys(ann);
          }
        } catch (e) { /* skip */ }

        if (odataVersion === "v2" && typeof m.getServiceMetadata === "function") {
          try {
            const meta = m.getServiceMetadata();
            if (meta) {
              metadataLoaded = true;
              const schema = (meta.dataServices && meta.dataServices.schema && meta.dataServices.schema[0]) || {};
              const container = (schema.entityContainer && schema.entityContainer[0]) || {};
              const allET = schema.entityType || [];
              if (allET.length > 100) entityTypesTruncated = true;
              entityTypes = allET.slice(0, 100).map(et => {
                const keySet = new Set(((et.key && et.key.propertyRef) || []).map(p => p.name));
                return {
                  name: et.name,
                  properties: (et.property || []).map(p => ({
                    name: p.name, type: p.type, isKey: keySet.has(p.name)
                  })),
                  navProperties: (et.navigationProperty || []).map(n => ({ name: n.name }))
                };
              });
              entitySets = (container.entitySet || []).map(es => ({
                name: es.name,
                entityType: es.entityType ? es.entityType.split(".").pop() : es.entityType
              }));
              functionImports = (container.functionImport || []).map(fi => ({
                name: fi.name,
                httpMethod: fi.httpMethod || fi["m:HttpMethod"] || "GET",
                returnType: fi.returnType || null
              }));
            }
          } catch (e) { /* skip */ }
        } else if (odataVersion === "v4" && typeof m.getMetaModel === "function") {
          try {
            const metaModel = m.getMetaModel();
            if (metaModel && typeof metaModel.getObject === "function") {
              const schemaObj = metaModel.getObject("/");
              if (schemaObj) {
                metadataLoaded = true;
                const containerName = schemaObj["$EntityContainer"];
                if (containerName) {
                  const container = schemaObj[containerName] || {};
                  entitySets = Object.entries(container)
                    .filter(([, v]) => v && v["$kind"] === "EntitySet")
                    .map(([name, v]) => ({
                      name: name,
                      entityType: v["$Type"] ? v["$Type"].split(".").pop() : null
                    }));
                  // v4 ActionImport / FunctionImport
                  functionImports = Object.entries(container)
                    .filter(([, v]) => v && (v["$kind"] === "ActionImport" || v["$kind"] === "FunctionImport"))
                    .map(([name, v]) => ({
                      name: name,
                      httpMethod: v["$kind"] === "ActionImport" ? "POST" : "GET",
                      returnType: v["$Action"] || v["$Function"] || null,
                      kind: v["$kind"]
                    }));
                }
                const allEntries = Object.entries(schemaObj)
                  .filter(([, v]) => v && typeof v === "object" && v["$kind"] === "EntityType");
                if (allEntries.length > 100) entityTypesTruncated = true;
                entityTypes = allEntries.slice(0, 100).map(([name, v]) => ({
                  name: name.split(".").pop() || name,
                  properties: Object.entries(v)
                    .filter(([pk]) => !pk.startsWith("$"))
                    .map(([pName, pDef]) => ({
                      name: pName,
                      type: (pDef && pDef["$Type"]) || "Edm.String",
                      isKey: (v["$Key"] || []).includes(pName)
                    })),
                  navProperties: []
                }));
              }
            }
          } catch (e) { /* skip */ }
        } else if (odataVersion === "v1" && typeof m.getServiceMetadata === "function") {
          try { metadataLoaded = !!m.getServiceMetadata(); } catch (e) { /* skip */ }
        }

        if (entityTypesTruncated) noteTruncation("model:" + modelName, 100, "100+");

        models.push({
          componentId: compId,
          name: modelName || "default",
          type: typeName,
          serviceUrl,
          odataVersion,
          metadataLoaded,
          defaultBindingMode,
          hasPendingChanges,
          annotationUrls,
          entityTypes,
          entitySets,
          functionImports
        });
      } catch (e) { /* skip model */ }
    }

    for (const compId in allComponents) {
      const comp = allComponents[compId];
      const manifest = typeof comp.getManifest === "function" ? comp.getManifest() : null;

      // Component info
      components.push({
        id: compId,
        type: comp.getMetadata().getName(),
        manifestId: manifest && manifest["sap.app"] ? manifest["sap.app"].id : null,
        manifestVersion: manifest && manifest["sap.app"] && manifest["sap.app"].applicationVersion ? manifest["sap.app"].applicationVersion.version : null,
        title: manifest && manifest["sap.app"] ? manifest["sap.app"].title : null,
        description: manifest && manifest["sap.app"] ? manifest["sap.app"].description : null,
        appType: manifest && manifest["sap.app"] ? manifest["sap.app"].type : null,
        ach: manifest && manifest["sap.app"] ? manifest["sap.app"].ach : null
      });

      // Models — prefer public API
      const modelNames = new Set();
      try {
        const declaredModels = manifest && manifest["sap.ui5"] && manifest["sap.ui5"].models;
        if (declaredModels) {
          Object.keys(declaredModels).forEach(n => modelNames.add(n));
        }
      } catch (e) { /* skip */ }
      // Always include default model
      modelNames.add("");
      // Fallback to private oModels for completeness
      try {
        if (comp.oModels) Object.keys(comp.oModels).forEach(n => modelNames.add(n));
      } catch (e) { /* skip */ }

      modelNames.forEach(name => {
        try {
          const m = name === "" ? comp.getModel() : comp.getModel(name);
          if (m && typeof m.getMetadata === "function") {
            extractModelFromComponent(comp, name, m, compId);
          }
        } catch (e) { /* skip */ }
      });

      // Traverse from root control
      const localViews = [];
      const localControllers = [];
      const rootControl = typeof comp.getRootControl === "function" ? comp.getRootControl() : null;
      if (rootControl) {
        traverseControl(rootControl, null, compId, 0, localViews, localControllers);
      }
      localViews.forEach(v => views.push(v));
      localControllers.forEach(c => controllers.push(c));
    }

    if (truncatedTraversal) {
      noteTruncation("controls", MAX_CONTROLS, MAX_CONTROLS + "+");
    }

    return { components, models, views, controllers, bindings, totalControls, customControls, busyControls };
  });

  if (componentData) {
    result.components = componentData.components;
    result.models = componentData.models;
    result.views = componentData.views;
    result.controllers = componentData.controllers;
    result.bindings = componentData.bindings;
    result.controlStats = {
      total: componentData.totalControls,
      custom: componentData.customControls,
      busy: componentData.busyControls
    };
  } else {
    result.components = [];
    result.models = [];
    result.views = [];
    result.controllers = [];
    result.bindings = [];
    result.controlStats = { total: 0, custom: 0, busy: 0 };
  }

  // App info from first component
  result.app = safeGet("app", () => {
    if (!result.components.length) return null;
    const first = result.components[0];
    return {
      id: first.id,
      namespace: first.manifestId,
      version: first.manifestVersion,
      title: first.title,
      description: first.description,
      type: first.appType
    };
  });

  // --- Section 9: Routing ---

  result.routing = safeGet("routing", () => {
    const allComponents = (sap.ui.core.Component && sap.ui.core.Component.registry && sap.ui.core.Component.registry.all()) || {};
    const out = [];
    for (const compId in allComponents) {
      const comp = allComponents[compId];
      const manifest = typeof comp.getManifest === "function" ? comp.getManifest() : null;
      const routingCfg = manifest && manifest["sap.ui5"] && manifest["sap.ui5"].routing;
      if (!routingCfg) continue;
      const router = typeof comp.getRouter === "function" ? comp.getRouter() : null;
      let currentHash = null;
      let currentRoute = null;
      try {
        if (router && typeof router.getHashChanger === "function") {
          const hc = router.getHashChanger();
          if (hc && typeof hc.getHash === "function") currentHash = hc.getHash();
        }
      } catch (e) { /* skip */ }
      try {
        if (router && currentHash != null && typeof router.getRouteInfoByHash === "function") {
          const info = router.getRouteInfoByHash(currentHash);
          if (info) currentRoute = info.name;
        }
      } catch (e) { /* skip */ }
      out.push({
        componentId: compId,
        config: routingCfg.config || null,
        routes: (routingCfg.routes || []).map(r => ({
          name: r.name,
          pattern: r.pattern,
          target: Array.isArray(r.target) ? r.target.join(", ") : r.target,
          greedy: !!r.greedy
        })),
        targets: routingCfg.targets ? Object.entries(routingCfg.targets).map(([n, t]) => ({
          name: n,
          viewName: t.viewName || t.name || null,
          viewType: t.viewType || null,
          controlAggregation: t.controlAggregation || null
        })) : [],
        currentHash,
        currentRoute
      });
    }
    return out;
  }) || [];

  // --- Section 10: Manifest snapshots (per component) ---

  result.manifestSnapshots = safeGet("manifestSnapshots", () => {
    const allComponents = (sap.ui.core.Component && sap.ui.core.Component.registry && sap.ui.core.Component.registry.all()) || {};
    const out = [];
    for (const compId in allComponents) {
      const comp = allComponents[compId];
      const manifest = typeof comp.getManifest === "function" ? comp.getManifest() : null;
      if (!manifest) continue;
      const sapApp = manifest["sap.app"] || {};
      const sapUi5 = manifest["sap.ui5"] || {};
      const sapFiori = manifest["sap.fiori"] || null;
      out.push({
        componentId: compId,
        sapApp: {
          id: sapApp.id || null,
          type: sapApp.type || null,
          title: sapApp.title || null,
          description: sapApp.description || null,
          applicationVersion: sapApp.applicationVersion || null,
          tags: sapApp.tags || null,
          ach: sapApp.ach || null,
          dataSources: sapApp.dataSources || {},
          crossNavigation: sapApp.crossNavigation || null
        },
        sapUi5: {
          rootView: sapUi5.rootView || null,
          dependencies: sapUi5.dependencies || null,
          contentDensities: sapUi5.contentDensities || null,
          models: sapUi5.models ? Object.keys(sapUi5.models) : [],
          resources: sapUi5.resources || null,
          componentUsages: sapUi5.componentUsages || null
        },
        sapFiori,
        full: manifest
      });
    }
    return out;
  }) || [];

  // --- Section 11: Fragments ---

  result.fragments = safeGet("fragments", () => {
    const frags = [];
    if (sap.ui.core.Fragment && sap.ui.core.Fragment.registry && sap.ui.core.Fragment.registry.forEach) {
      sap.ui.core.Fragment.registry.forEach((frag, id) => {
        frags.push({
          id: id,
          type: (frag.getMetadata && frag.getMetadata().getName()) || "unknown"
        });
      });
      return frags;
    }
    const registry = sap.ui.core.Fragment && sap.ui.core.Fragment.registry;
    if (registry && registry._mFragments) {
      result._errors.push({ section: "fragments", error: "Using private Fragment registry API (_mFragments)" });
      for (const fragId in registry._mFragments) {
        const frag = registry._mFragments[fragId];
        frags.push({
          id: fragId,
          type: (frag && frag.getMetadata && frag.getMetadata().getName()) || "unknown"
        });
      }
      return frags;
    }
    return frags;
  }) || [];

  // --- Section 12: Messages ---

  result.messages = safeGet("messages", () => {
    try {
      const Messaging = sap.ui.require("sap/ui/core/Messaging");
      if (Messaging) {
        const msgModel = Messaging.getMessageModel();
        if (msgModel) {
          const msgs = msgModel.getData() || [];
          return {
            count: msgs.length,
            items: msgs.slice(0, 50).map(m => ({
              type: m.type,
              message: truncate(m.message, 200),
              target: m.target || null,
              code: m.code || null
            }))
          };
        }
      }
    } catch (e) { /* fallback */ }

    if (sap.ui.core.message && sap.ui.core.message.MessageManager) {
      const mm = sap.ui.core.message.MessageManager.getInstance();
      const msgs = mm.getMessageModel().getData() || [];
      return {
        count: msgs.length,
        items: msgs.slice(0, 50).map(m => ({
          type: m.type,
          message: truncate(m.message, 200),
          target: m.target || null,
          code: m.code || null
        }))
      };
    }

    return { count: 0, items: [] };
  });

  // --- Section 13: Log Entries ---

  result.logEntries = safeGet("logEntries", () => {
    const oLog = sap.ui.require("sap/base/Log");
    if (!oLog || typeof oLog.getLogEntries !== "function") return [];
    const entries = oLog.getLogEntries();
    return entries.slice(-200).map(e => ({
      level: e.level,
      message: truncate(e.message, 300),
      details: truncate(e.details, 150),
      component: e.component || null,
      timestamp: e.timestamp || null
    }));
  }) || [];

  // Deprecation warnings (filtered subset)
  result.deprecations = safeGet("deprecations", () => {
    return (result.logEntries || []).filter(e =>
      e.message && /deprecat/i.test(e.message)
    );
  }) || [];

  // --- Section 14: Performance ---

  result.performance = safeGet("performance", () => {
    const out = { measurements: [], odataRequests: null, memory: null, navigationTiming: null };
    try {
      if (sap.ui.require) {
        const Measurement = sap.ui.require("sap/ui/performance/Measurement");
        if (Measurement && typeof Measurement.getAllMeasurements === "function") {
          const all = Measurement.getAllMeasurements() || [];
          out.measurements = all.slice(0, 30).map(m => ({
            id: m.id,
            info: truncate(m.info, 100),
            duration: typeof m.duration === "number" ? Math.round(m.duration * 100) / 100 : null,
            categories: m.categories || null
          }));
        }
      }
    } catch (e) { /* skip */ }
    try {
      if (window.performance && typeof window.performance.getEntriesByType === "function") {
        const res = window.performance.getEntriesByType("resource") || [];
        const odata = res.filter(r => /\.svc(\/|\?|$)|\/odata\//i.test(r.name));
        if (odata.length > 0) {
          const totalSize = odata.reduce((s, r) => s + (r.transferSize || 0), 0);
          const totalDur = odata.reduce((s, r) => s + (r.duration || 0), 0);
          out.odataRequests = {
            count: odata.length,
            totalSizeKB: Math.round(totalSize / 1024),
            avgDurationMs: Math.round(totalDur / odata.length),
            slowest: odata.slice().sort((a, b) => b.duration - a.duration).slice(0, 5).map(r => ({
              url: r.name,
              durationMs: Math.round(r.duration),
              sizeKB: Math.round((r.transferSize || 0) / 1024)
            }))
          };
        }
        const nav = window.performance.getEntriesByType("navigation")[0];
        if (nav) {
          out.navigationTiming = {
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            loadEventMs: Math.round(nav.loadEventEnd),
            transferSizeKB: Math.round((nav.transferSize || 0) / 1024)
          };
        }
      }
      if (window.performance && window.performance.memory) {
        out.memory = {
          usedHeapMB: Math.round(window.performance.memory.usedJSHeapSize / 1048576),
          totalHeapMB: Math.round(window.performance.memory.totalJSHeapSize / 1048576)
        };
      }
    } catch (e) { /* skip */ }
    return out;
  });

  // --- Section 15: Runtime ---

  result.runtime = safeGet("runtime", () => {
    const device = typeof sap.ui.Device !== "undefined" ? sap.ui.Device : null;
    return {
      browser: navigator.userAgent,
      touch: device && device.support ? device.support.touch : null,
      mobile: device && device.system ? (device.system.phone || device.system.tablet) : null,
      system: device ? device.system : null,
      os: device ? device.os : null,
      orientation: device ? device.orientation : null
    };
  });

  // --- Section 16: Theming ---

  result.theming = safeGet("theming", () => {
    const info = {
      theme: compatGetTheme(),
      rtl: compatGetRTL(),
      contentDensity: compatGetContentDensity()
    };
    const cfg = getConfig();
    if (cfg && typeof cfg.getFont === "function") {
      try { info.fonts = cfg.getFont(); } catch (e) { /* skip */ }
    }
    return info;
  });

  // --- Section 17: UI5 Resources ---

  result.resources = safeGet("resources", () => {
    const scripts = [];
    const css = [];
    document.querySelectorAll("script[src]").forEach(s => {
      const src = s.getAttribute("src");
      if (src && /sap-ui-core|sap-ui-library|openui5/i.test(src)) {
        scripts.push(src);
      }
    });
    document.querySelectorAll("link[rel='stylesheet']").forEach(l => {
      const href = l.getAttribute("href");
      if (href && /sap|ui5/i.test(href)) {
        css.push(href);
      }
    });
    return { scripts, css };
  });

  // --- Section 18: Icons ---

  result.icons = safeGet("icons", () => {
    const icons = new Set();
    document.querySelectorAll("[data-sap-ui-icon-content], span.sapMIcon, span.sapUiIcon").forEach(el => {
      const icon = el.getAttribute("data-sap-ui-icon-content") || el.getAttribute("aria-label");
      if (icon) icons.add(icon);
    });
    return [...icons];
  }) || [];

  // --- Section 19: Fiori Elements / Smart Templates detection ---

  result.fioriElements = safeGet("fioriElements", () => {
    const detected = { isFioriElements: false, framework: null, floorplans: [] };
    if (sap.suite && sap.suite.ui && sap.suite.ui.generic && sap.suite.ui.generic.template) {
      detected.isFioriElements = true;
      detected.framework = "smart-templates";
    }
    if (sap.fe) {
      detected.isFioriElements = true;
      detected.framework = detected.framework ? detected.framework + "+sap.fe" : "sap.fe";
    }
    // Detect floorplans by view type
    (result.views || []).forEach(v => {
      if (!v.viewType) return;
      if (/ListReport/i.test(v.viewType)) detected.floorplans.push("ListReport");
      else if (/ObjectPage/i.test(v.viewType)) detected.floorplans.push("ObjectPage");
      else if (/AnalyticalListPage/i.test(v.viewType)) detected.floorplans.push("AnalyticalListPage");
      else if (/OverviewPage/i.test(v.viewType)) detected.floorplans.push("OverviewPage");
    });
    detected.floorplans = [...new Set(detected.floorplans)];
    return detected;
  });

  return result;
}
