document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const resultContainer = document.getElementById('result');
  const copyBtn = document.getElementById('copyBtn');
  resultContainer.textContent = "Analisi in corso...";

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractSAPUI5Data
    });

    if (results && results[0].result) {
      const data = results[0].result;
      resultContainer.textContent = JSON.stringify(data, null, 2);
      copyBtn.style.display = 'block'; // Mostra il tasto copia
    }
  } catch (err) {
    resultContainer.textContent = "Errore: " + err.message;
  }
});

// Gestione del tasto copia
document.getElementById('copyBtn').addEventListener('click', () => {
  const text = document.getElementById('result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const originalText = btn.textContent;
    btn.textContent = "COPIATO!";
    btn.style.backgroundColor = "#4caf50";
    btn.style.color = "white";
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.backgroundColor = "#e0e0e0";
      btn.style.color = "#333";
    }, 2000);
  });
});

function extractSAPUI5Data() {
  if (typeof sap === 'undefined' || !sap.ui) {
    return { errore: "SAPUI5 non rilevato in questa pagina." };
  }

  const core = sap.ui.getCore();
  const config = core.getConfiguration();

  // Trova il componente principale
  const allComponents = sap.ui.core.Component?.registry?.all() || {};
  const compId = Object.keys(allComponents)[0];
  const oComp = compId ? allComponents[compId] : null;

  const info = {
    framework: {
      versione: sap.ui.version,
      tema: config.getTheme(),
      lingua: config.getLanguage(),
      // Verifica Modalità Debug
      debugMode: sap.ui.getCore().getConfiguration().getDebug() || window["sap-ui-debug"] === true
    }
  };

  if (oComp) {
    const manifest = oComp.getManifest();
    info.app = {
      id: compId,
      namespace: manifest["sap.app"]?.id || "N/A",
      version: manifest["sap.app"]?.applicationVersion?.version || "N/A"
    };

    // Analisi Modelli
    const oModels = oComp.oModels || {};
    info.models = Object.keys(oModels).map(key => {
      const m = oModels[key];
      return {
        name: key || "Default",
        type: m.getMetadata().getName(),
        uri: m.getServiceUrl ? m.getServiceUrl() : "N/A"
      };
    });
  }

  // Info Utente Launchpad
  if (typeof sap.ushell !== 'undefined' && sap.ushell.Container) {
    const user = sap.ushell.Container.getUser();
    info.user = {
      id: user.getId(),
      name: user.getFullName()
    };
  }

  // Analisi URL e Parametri
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  info.url_analysis = {
    full_url: window.location.href,
    parameters: {},
    fiori_intent: hash.startsWith("#") ? hash.split("&")[0] : "No Intent (Standalone)"
  };

  // Estraiamo tutti i parametri query (?param=value)
  for (let [key, value] of urlParams.entries()) {
    info.url_analysis.parameters[key] = value;
  }

  // Check specifico per i parametri tecnici SAP
  info.technical_flags = {
    debug_active: urlParams.has("sap-ui-debug"),
    flex_disabled: urlParams.get("sap-ui-fl-control-error") === "true",
    theme_override: urlParams.get("sap-theme") || "Default dal manifest"
  };

  info.components = [];
  info.views = [];

  // Tutti i componenti registrati
  const _allComponents = sap.ui.core.Component.registry.all();
  for (const compId in _allComponents) {
    const comp = _allComponents[compId];
    const manifest = comp.getManifest && comp.getManifest();

    info.components.push({
      id: compId,
      type: comp.getMetadata().getName(),
      manifest_exists: !!manifest,
      manifest_id: manifest?.["sap.app"]?.id || null,
      manifest_version: manifest?.["sap.app"]?.applicationVersion?.version || null
    });

    // Analisi view associate al componente
    const views = comp.getViews && Object.values(comp.getViews());
    if (views && views.length) {
      views.forEach(view => {
        const viewMeta = view.getMetadata();
        if (view.getController) {
          const controller = view.getController();
          info.views.push({
            component_id: compId,
            view_id: view.getId(),
            view_type: viewMeta.getName(),
            controller_type: controller?.getMetadata()?.getName() || "N/A",
            controller_name: controller?.getMetadata()?.getName() || "N/A"
          });
        }
      });
    }
  }

  // Dentro la parte delle view, in alternativa o in più:
  info.controllers = [];

  sap.ui.core.Component.registry.all().forEach(comp => {
    const views = comp.getViews && Object.values(comp.getViews());
    if (!views) return;

    views.forEach(view => {
      const controller = view.getController();
      if (!controller) return;

      const controllerMeta = controller.getMetadata();
      const controllerName = controllerMeta.getName();
      const methods = [];

      // Esplora il prototype del controller (metodi pubblici)
      let proto = controller;
      while (proto && proto !== Object.prototype) {
        const own = Object.getOwnPropertyNames(proto)
          .filter(k => k !== "constructor" && typeof proto[k] === "function");
        methods.push(...own);
        proto = Object.getPrototypeOf(proto);
      }

      info.controllers.push({
        component_id: comp.getId(),
        view_id: view.getId(),
        controller_type: controllerName,
        methods: methods.filter((m, i, arr) => arr.indexOf(m) === i) // unici
      });
    });
  });

  info.bindings = [];

  sap.ui.core.Component.registry.all().forEach(comp => {
    const views = comp.getViews && Object.values(comp.getViews());
    if (!views) return;

    views.forEach(view => {
      const visit = (o) => {
        const b = o.getBindingInfo("text") || o.getBindingInfo("value");
        if (b && b.path) {
          info.bindings.push({
            parent_view: view.getId(),
            object_id: o.getId(),
            object_type: o.getMetadata().getName(),
            path: b.path,
            model: b.model || "Default"
          });
        }
        (o.getAggregation("content") || []).forEach(visit);
        (o.getAggregation("items") || []).forEach(visit);
      };

      visit(view);
    });
  });

  info.fragments = [];
  info.layouts = [];

  sap.ui.core.Component.registry.all().forEach(comp => {
    const fragments = sap.ui.core.Fragment.registry && sap.ui.core.Fragment.registry._mFragments;
    if (fragments) {
      for (const fragId in fragments) {
        const frag = fragments[fragId];
        info.fragments.push({
          id: fragId,
          type: frag.getMetadata().getName(),
          content: frag.getAggregation("content")?.length || 0
        });
      }
    }

    // Layout (se presente)
    const rootView = comp.getRootControl && comp.getRootControl();
    if (rootView) {
      const layout = rootView.getLayoutData && rootView.getLayoutData();
      if (layout) {
        info.layouts.push({
          control_id: rootView.getId(),
          layout_type: layout.getMetadata().getName()
        });
      }
    }
  });

  info.sap_logs = {
    message_manager: {},
    log_entries: []
  };

  // Se c'è sap.ui.core.message.MessageManager
  if (sap.ui.core.message && sap.ui.core.message.MessageManager) {
    const mm = sap.ui.core.message.MessageManager.getInstance();
    const messages = mm.getMessageModel().getData();
    info.sap_logs.message_manager = {
      count: messages.length,
      first_5: messages.slice(0, 5)
    };
  }

  // Registro dei log di SAPUI5
  if (sap.ui.require && sap.ui.require("sap/base/Log")) {
    const oLog = sap.ui.require("sap/base/Log");
    if (oLog) {
      oLog.getLogEntries().forEach(e => {
        info.sap_logs.log_entries.push({
          level: e.level,
          message: e.message,
          details: e.details
        });
      });
    }
  }

  info.runtime = {
    browser: navigator.userAgent,
    touch: sap.ui.Device.support.touch,
    mobile: sap.ui.Device.system.phone || sap.ui.Device.system.tablet,
    accessibility: sap.ui.getCore().getConfiguration().getAccessibility()
  };

  info.device = {
    system: sap.ui.Device.system,
    platform: sap.ui.Device.os,
    orientation: sap.ui.Device.orientation
  };

  info.theming = {
    icon_theme: sap.ui.getCore().getConfiguration().getIconColorTheme(),
    fonts: sap.ui.getCore().getConfiguration().getFont(),
    rtl: sap.ui.getCore().getConfiguration().getRTL()
  };

  info.icons_used = [];

  // Scansione veloce di icone (es. se usi sap.ui.core.Icon o sap.m.Icon)
  Array.from(document.querySelectorAll("sap-icon, span.sapMIcon, span[role]")).forEach(el => {
    const icon = el.getAttribute("data-sap-ui-icon-content") || el.getAttribute("aria-label");
    if (icon) {
      info.icons_used.push(icon);
    }
  });
  info.icons_used = [...new Set(info.icons_used)]; // unici

  if (sap.ushell && sap.ushell.Container) {
    const personalizationService = sap.ushell.Container.getService("Personalization");
    const userPreferenceService = sap.ushell.Container.getService("UserPreferences");

    info.user_preferences = {
      personalized: !!personalizationService,
      userprefs: !!userPreferenceService
    };

    // Se hai accesso a user preferences
    if (userPreferenceService && userPreferenceService.getPreferences) {
      try {
        const prefs = userPreferenceService.getPreferences();
        info.user_preferences.values = prefs;
      } catch (e) {
        info.user_preferences.error_get = e.message;
      }
    }
  }

  info.flex = {};

  if (sap.ui.fl && sap.ui.fl.registry.Settings) {
    const settings = sap.ui.fl.registry.Settings.getInstance();
    info.flex = {
      flex_enabled: settings.isFlexEnabled(),
      project_id: settings.getUShellContainer().getComponentName() || "N/A"
    };
  }

  info.ui5_resources = {
    scripts: [],
    css: []
  };

  Array.from(document.querySelectorAll("script[src]")).forEach(s => {
    const src = s.getAttribute("src");
    if (src && /sap-ui-core|sap-ui-library|sap-ui-theme/i.test(src)) {
      info.ui5_resources.scripts.push(src);
    }
  });

  Array.from(document.querySelectorAll("link[rel='stylesheet']")).forEach(l => {
    const href = l.getAttribute("href");
    if (href && /sap-ui-theme/i.test(href)) {
      info.ui5_resources.css.push(href);
    }
  });

  return info;
}