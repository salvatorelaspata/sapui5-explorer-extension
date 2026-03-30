/**
 * SAPUI5 Explorer - Extraction Engine
 * Injected into page's MAIN world via chrome.scripting.executeScript
 * Compatible with UI5 1.x (1.90+) and UI5 2.x
 */
function extractSAPUI5Data() {
  // Guard
  if (typeof sap === "undefined" || !sap.ui) {
    return { _error: "SAPUI5 not detected on this page." };
  }

  const result = {
    _meta: { timestamp: new Date().toISOString(), ui5Version: null, isV2: false },
    _errors: []
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

  // --- Version Detection ---

  const version = sap.ui.version || "unknown";
  const majorVersion = parseInt(version.split(".")[0], 10);
  const isV2 = majorVersion >= 2;
  result._meta.ui5Version = version;
  result._meta.isV2 = isV2;

  // --- Compatibility Layer ---
  // Try V2 module first (sync require returns module only if already loaded), fallback to V1

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

  // --- Section 1: Framework ---

  result.framework = safeGet("framework", () => ({
    version: version,
    theme: compatGetTheme(),
    language: compatGetLanguage(),
    debug: compatGetDebug(),
    rtl: compatGetRTL(),
    accessibility: compatGetAccessibility()
  }));

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
      technicalFlags: {
        debugActive: urlParams.has("sap-ui-debug"),
        debugValue: urlParams.get("sap-ui-debug"),
        flexDisabled: urlParams.get("sap-ui-fl-control-error") === "true",
        themeOverride: urlParams.get("sap-theme") || null
      }
    };
  });

  // --- Section 3: Launchpad / User ---

  result.launchpad = safeGet("launchpad", () => {
    if (typeof sap.ushell === "undefined" || !sap.ushell.Container) return null;
    const user = sap.ushell.Container.getUser();
    const info = {
      user: user ? { id: user.getId(), name: user.getFullName() } : null
    };
    try {
      const ps = sap.ushell.Container.getService("Personalization");
      info.personalization = !!ps;
    } catch (e) { info.personalization = false; }
    return info;
  });

  // --- Section 4-8: Components, Models, Views, Controllers, Bindings (single pass) ---

  const componentData = safeGet("components", () => {
    const allComponents = sap.ui.core.Component?.registry?.all() || {};
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
    // Common lifecycle/framework methods to always exclude
    ["constructor", "onInit", "onExit", "onBeforeRendering", "onAfterRendering",
      "getView", "getOwnerComponent", "byId", "getRouter", "getModel", "setModel",
      "getResourceBundle", "createId", "getMetadata", "init", "exit", "destroy",
      "getEventBus", "attachEvent", "detachEvent", "fireEvent"
    ].forEach(m => frameworkMethods.add(m));

    // Binding properties to check on each control
    const BINDING_PROPS = [
      "text", "value", "description", "title", "tooltip", "src", "icon",
      "number", "numberUnit", "info", "intro", "subtitle", "placeholder",
      "label", "header", "subheader", "footer", "selected", "enabled",
      "visible", "editable", "busy", "count", "state", "highlighted",
      "type", "name", "key", "href", "target", "color", "width", "height"
    ];

    const MAX_CONTROLS = 5000;
    const MAX_DEPTH = 30;
    let controlCount = 0;

    function traverseControl(control, viewId, depth) {
      if (!control || depth > MAX_DEPTH || controlCount >= MAX_CONTROLS) return;
      controlCount++;

      // Check if this is a View
      if (typeof control.isA === "function" && control.isA("sap.ui.core.mvc.View")) {
        const vId = control.getId();
        const vMeta = control.getMetadata();
        const ctrl = typeof control.getController === "function" ? control.getController() : null;

        views.push({
          componentId: null, // filled by caller
          viewId: vId,
          viewType: vMeta.getName(),
          controllerName: ctrl?.getMetadata()?.getName() || null
        });

        // Extract controller custom methods
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
          controllers.push({
            componentId: null,
            viewId: vId,
            controllerName: ctrl.getMetadata().getName(),
            customMethods: customMethods.sort()
          });
        }

        viewId = vId;
      }

      // Check bindings on all known properties
      if (viewId && typeof control.getBindingInfo === "function") {
        for (const prop of BINDING_PROPS) {
          try {
            const bInfo = control.getBindingInfo(prop);
            if (bInfo) {
              const path = bInfo.path || (bInfo.parts && bInfo.parts.map(p => p.path).join(", "));
              if (path) {
                bindings.push({
                  viewId: viewId,
                  controlId: control.getId(),
                  controlType: control.getMetadata().getName(),
                  property: prop,
                  path: path,
                  model: bInfo.model || (bInfo.parts && bInfo.parts[0]?.model) || "default"
                });
              }
            }
          } catch (e) { /* skip */ }
        }
      }

      // Recurse into ALL aggregations
      if (typeof control.getMetadata === "function") {
        try {
          const allAggr = control.getMetadata().getAllAggregations();
          for (const aggrName in allAggr) {
            try {
              const children = control.getAggregation(aggrName);
              if (Array.isArray(children)) {
                children.forEach(child => traverseControl(child, viewId, depth + 1));
              } else if (children && typeof children === "object" && typeof children.getMetadata === "function") {
                traverseControl(children, viewId, depth + 1);
              }
            } catch (e) { /* skip aggregation */ }
          }
        } catch (e) { /* skip */ }
      }
    }

    for (const compId in allComponents) {
      const comp = allComponents[compId];
      const manifest = typeof comp.getManifest === "function" ? comp.getManifest() : null;

      // Component info
      components.push({
        id: compId,
        type: comp.getMetadata().getName(),
        manifestId: manifest?.["sap.app"]?.id || null,
        manifestVersion: manifest?.["sap.app"]?.applicationVersion?.version || null
      });

      // Models
      const oModels = comp.oModels || {};
      for (const modelName in oModels) {
        const m = oModels[modelName];
        try {
          const typeName = m.getMetadata().getName();
          const serviceUrl = typeof m.getServiceUrl === "function" ? m.getServiceUrl() : null;

          // Detect OData version
          let odataVersion = null;
          if (typeName.includes(".v4.")) odataVersion = "v4";
          else if (typeName.includes(".v2.")) odataVersion = "v2";
          else if (/odata/i.test(typeName)) odataVersion = "v1";

          // Extract OData metadata details
          let metadataLoaded = false;
          let entityTypes = [];
          let entitySets = [];
          let functionImports = [];

          if (odataVersion === "v2" && typeof m.getServiceMetadata === "function") {
            try {
              const meta = m.getServiceMetadata();
              if (meta) {
                metadataLoaded = true;
                const schema = meta.dataServices?.schema?.[0] || {};
                const container = schema.entityContainer?.[0] || {};
                entityTypes = (schema.entityType || []).slice(0, 100).map(et => {
                  const keySet = new Set((et.key?.propertyRef || []).map(p => p.name));
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
                  entityType: es.entityType?.split(".").pop() || es.entityType
                }));
                functionImports = (container.functionImport || []).map(fi => ({
                  name: fi.name,
                  httpMethod: fi.httpMethod || fi["m:HttpMethod"] || "GET",
                  returnType: fi.returnType || null
                }));
              }
            } catch (e) { /* metadata extraction failed */ }
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
                  }
                  entityTypes = Object.entries(schemaObj)
                    .filter(([, v]) => v && typeof v === "object" && v["$kind"] === "EntityType")
                    .slice(0, 100)
                    .map(([name, v]) => ({
                      name: name.split(".").pop() || name,
                      properties: Object.entries(v)
                        .filter(([pk]) => !pk.startsWith("$"))
                        .map(([pName, pDef]) => ({
                          name: pName,
                          type: pDef["$Type"] || "Edm.String",
                          isKey: (v["$Key"] || []).includes(pName)
                        })),
                      navProperties: []
                    }));
                }
              }
            } catch (e) { /* v4 metadata extraction failed */ }
          } else if (odataVersion === "v1" && typeof m.getServiceMetadata === "function") {
            try { metadataLoaded = !!m.getServiceMetadata(); } catch (e) { /* skip */ }
          }

          models.push({
            componentId: compId,
            name: modelName || "default",
            type: typeName,
            serviceUrl,
            odataVersion,
            metadataLoaded,
            entityTypes,
            entitySets,
            functionImports
          });
        } catch (e) { /* skip model */ }
      }

      // Traverse from root control
      controlCount = 0;
      const rootControl = typeof comp.getRootControl === "function" ? comp.getRootControl() : null;
      if (rootControl) {
        traverseControl(rootControl, null, 0);
        // Fill componentId on views/controllers found under this component
        views.forEach(v => { if (v.componentId === null) v.componentId = compId; });
        controllers.forEach(c => { if (c.componentId === null) c.componentId = compId; });
      }
    }

    return { components, models, views, controllers, bindings };
  });

  if (componentData) {
    result.components = componentData.components;
    result.models = componentData.models;
    result.views = componentData.views;
    result.controllers = componentData.controllers;
    result.bindings = componentData.bindings;
  } else {
    result.components = [];
    result.models = [];
    result.views = [];
    result.controllers = [];
    result.bindings = [];
  }

  // App info from first component
  result.app = safeGet("app", () => {
    if (!result.components.length) return null;
    const first = result.components[0];
    return {
      id: first.id,
      namespace: first.manifestId,
      version: first.manifestVersion
    };
  });

  // --- Section 9: Fragments ---

  result.fragments = safeGet("fragments", () => {
    const frags = [];

    // Try public API first (UI5 1.93+)
    if (sap.ui.core.Fragment?.registry?.forEach) {
      sap.ui.core.Fragment.registry.forEach((frag, id) => {
        frags.push({
          id: id,
          type: frag.getMetadata?.().getName() || "unknown"
        });
      });
      return frags;
    }

    // Fallback: private API with warning
    const registry = sap.ui.core.Fragment?.registry;
    if (registry && registry._mFragments) {
      result._errors.push({ section: "fragments", error: "Using private Fragment registry API (_mFragments)" });
      for (const fragId in registry._mFragments) {
        const frag = registry._mFragments[fragId];
        frags.push({
          id: fragId,
          type: frag?.getMetadata?.().getName() || "unknown"
        });
      }
      return frags;
    }

    return frags;
  }) || [];

  // --- Section 10: Messages ---

  result.messages = safeGet("messages", () => {
    // Try V2 module first
    try {
      const Messaging = sap.ui.require("sap/ui/core/Messaging");
      if (Messaging) {
        const msgModel = Messaging.getMessageModel();
        if (msgModel) {
          const msgs = msgModel.getData() || [];
          return {
            count: msgs.length,
            items: msgs.slice(0, 20).map(m => ({
              type: m.type,
              message: truncate(m.message, 200),
              target: m.target || null,
              code: m.code || null
            }))
          };
        }
      }
    } catch (e) { /* fallback */ }

    // V1 fallback
    if (sap.ui.core.message?.MessageManager) {
      const mm = sap.ui.core.message.MessageManager.getInstance();
      const msgs = mm.getMessageModel().getData() || [];
      return {
        count: msgs.length,
        items: msgs.slice(0, 20).map(m => ({
          type: m.type,
          message: truncate(m.message, 200),
          target: m.target || null,
          code: m.code || null
        }))
      };
    }

    return { count: 0, items: [] };
  });

  // --- Section 11: Log Entries ---

  result.logEntries = safeGet("logEntries", () => {
    const oLog = sap.ui.require("sap/base/Log");
    if (!oLog || typeof oLog.getLogEntries !== "function") return [];
    const entries = oLog.getLogEntries();
    return entries.slice(-50).map(e => ({
      level: e.level,
      message: truncate(e.message, 200),
      details: truncate(e.details, 100),
      component: e.component || null
    }));
  }) || [];

  // --- Section 12: Runtime ---

  result.runtime = safeGet("runtime", () => {
    const device = typeof sap.ui.Device !== "undefined" ? sap.ui.Device : null;
    return {
      browser: navigator.userAgent,
      touch: device?.support?.touch ?? null,
      mobile: (device?.system?.phone || device?.system?.tablet) ?? null,
      system: device?.system || null,
      os: device?.os || null,
      orientation: device?.orientation || null
    };
  });

  // --- Section 13: Theming ---

  result.theming = safeGet("theming", () => {
    const info = {
      theme: compatGetTheme(),
      rtl: compatGetRTL()
    };
    // V1-only properties (guarded)
    const cfg = getConfig();
    if (cfg) {
      if (typeof cfg.getFont === "function") {
        try { info.fonts = cfg.getFont(); } catch (e) { /* skip */ }
      }
    }
    return info;
  });

  // --- Section 14: UI5 Resources ---

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

  // --- Section 15: Icons ---

  result.icons = safeGet("icons", () => {
    const icons = new Set();
    document.querySelectorAll("[data-sap-ui-icon-content], span.sapMIcon, span.sapUiIcon").forEach(el => {
      const icon = el.getAttribute("data-sap-ui-icon-content") || el.getAttribute("aria-label");
      if (icon) icons.add(icon);
    });
    return [...icons];
  }) || [];

  return result;
}
