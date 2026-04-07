/* SAPUI5 Explorer - UI Controller */

let analysisData = null;
let bindingFilter = "";
let entityFilter = "";
let logFilter = { level: 0, text: "" };

// --- Init ---

document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);
document.getElementById("copyBtn").addEventListener("click", copyJSON);
document.getElementById("downloadJsonBtn").addEventListener("click", downloadJSON);
document.getElementById("downloadHtmlBtn").addEventListener("click", downloadHTML);
document.getElementById("tabBar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (btn) switchTab(btn.dataset.tab);
});
document.getElementById("tabBar").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const btns = [...document.querySelectorAll(".tab-btn")];
  const idx = btns.findIndex(b => b.classList.contains("active"));
  const next = e.key === "ArrowRight" ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
  switchTab(btns[next].dataset.tab);
  btns[next].focus();
});
document.getElementById("errorBanner").addEventListener("click", () => {
  document.getElementById("errorBannerDetails").classList.toggle("open");
});

// Collapsible sections - event delegation
document.getElementById("tabContent").addEventListener("click", (e) => {
  const header = e.target.closest(".collapsible-header");
  if (header) {
    header.parentElement.classList.toggle("open");
  }
});

// Filter inputs - event delegation
document.getElementById("tabContent").addEventListener("input", (e) => {
  if (e.target.id === "bindingFilter") {
    bindingFilter = e.target.value.toLowerCase();
    if (analysisData) renderBindings(analysisData);
    document.getElementById("bindingFilter").focus();
  } else if (e.target.id === "entityFilter") {
    entityFilter = e.target.value.toLowerCase();
    if (analysisData) renderOData(analysisData);
    document.getElementById("entityFilter").focus();
  } else if (e.target.id === "logFilterText") {
    logFilter.text = e.target.value.toLowerCase();
    if (analysisData) renderLogs(analysisData);
    document.getElementById("logFilterText").focus();
  }
});
document.getElementById("tabContent").addEventListener("change", (e) => {
  if (e.target.id === "logFilterLevel") {
    logFilter.level = parseInt(e.target.value, 10) || 0;
    if (analysisData) renderLogs(analysisData);
  }
});

// --- Analysis ---

async function runAnalysis() {
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Restricted page check
    if (!tab || !tab.url || /^(chrome|edge|about|chrome-extension|moz-extension):/i.test(tab.url) || tab.url.startsWith("https://chromewebstore.google.com")) {
      showPlaceholder("tab-overview", "&#128683;", "This page is restricted by the browser. Open a SAPUI5 app and retry.");
      btn.textContent = "ANALYZE";
      btn.disabled = false;
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: extractSAPUI5Data
    });

    if (results && results[0] && results[0].result) {
      const data = results[0].result;

      if (data._error) {
        showPlaceholder("tab-overview", "&#128683;", data._error);
        btn.textContent = "ANALYZE";
        btn.disabled = false;
        return;
      }

      analysisData = data;
      renderAll(data);
    }
  } catch (err) {
    showPlaceholder("tab-overview", "&#9888;", "Error: " + err.message);
  }

  btn.textContent = "ANALYZE";
  btn.disabled = false;
}

function renderAll(data) {
  // Version badge
  if (data._meta && data._meta.ui5Version) {
    const vBadge = document.getElementById("ui5Version");
    vBadge.textContent = "UI5 " + data._meta.ui5Version;
    vBadge.hidden = false;
  }

  // Error banner
  const banner = document.getElementById("errorBanner");
  const detailsEl = document.getElementById("errorBannerDetails");
  if (data._errors && data._errors.length > 0) {
    document.getElementById("errorBannerText").textContent =
      data._errors.length + " section(s) had partial errors — click to expand";
    banner.classList.add("visible");
    detailsEl.innerHTML = data._errors.map(e =>
      `<div style="margin-bottom:4px"><strong>${esc(e.section)}</strong>: ${esc(e.error)}</div>`
    ).join("");
    if (data._errors.length <= 3) detailsEl.classList.add("open");
  } else {
    banner.classList.remove("visible");
    detailsEl.classList.remove("open");
    detailsEl.innerHTML = "";
  }

  // Render all tabs
  renderOverview(data);
  renderComponents(data);
  renderOData(data);
  renderBindings(data);
  renderRouting(data);
  renderManifest(data);
  renderLogs(data);
  renderPerformance(data);
  renderRuntime(data);
  renderJSON(data);

  // Update badges
  setBadge("badgeComponents", (data.components || []).length);
  const odataCount = [...new Set((data.models || []).filter(m => m.odataVersion).map(m => m.serviceUrl))].length;
  setBadge("badgeOData", odataCount);
  setBadge("badgeBindings", (data.bindings || []).length);
  const routingCount = (data.routing || []).reduce((s, r) => s + (r.routes || []).length, 0);
  setBadge("badgeRouting", routingCount);
  const logCount = ((data.messages && data.messages.count) || 0) + (data.logEntries || []).length;
  setBadge("badgeLogs", logCount, logCount > 0 ? "warning" : "");
}

// --- Tab Switching ---

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
}

// --- Render: Overview ---

function renderOverview(data) {
  const el = document.getElementById("tab-overview");
  let html = "";

  // Stats row
  html += `<div class="stats-row">
    <div class="stat-box"><div class="stat-number">${(data.components || []).length}</div><div class="stat-label">Components</div></div>
    <div class="stat-box"><div class="stat-number">${(data.views || []).length}</div><div class="stat-label">Views</div></div>
    <div class="stat-box"><div class="stat-number">${(data.bindings || []).length}</div><div class="stat-label">Bindings</div></div>
    <div class="stat-box"><div class="stat-number">${(data.models || []).length}</div><div class="stat-label">Models</div></div>
  </div>`;

  // Truncations
  if (data._truncations && data._truncations.length > 0) {
    html += data._truncations.map(t =>
      `<div class="truncation-notice">&#9888; ${esc(t.section)}: showing ${esc(t.shown)} of ${esc(t.total)}</div>`
    ).join("");
  }

  // Framework card
  if (data.framework) {
    const fw = data.framework;
    const debugHtml = fw.debug
      ? `<span class="status-dot on"></span>ON`
      : `<span class="status-dot off"></span>OFF`;
    html += card("Framework", `
      ${kvRow("Version", fw.version || "?")}
      ${fw.buildTimestamp ? kvRow("Build", esc(fw.buildTimestamp)) : ""}
      ${kvRow("Theme", fw.theme || "?")}
      ${kvRow("Language", fw.language || "?")}
      ${kvRow("Debug", debugHtml)}
      ${kvRow("RTL", fw.rtl ? "Yes" : "No")}
      ${fw.accessibility !== null ? kvRow("Accessibility", fw.accessibility ? "Yes" : "No") : ""}
      ${fw.contentDensity ? kvRow("Density", fw.contentDensity) : ""}
    `);
  }

  // App card
  if (data.app) {
    html += card("Application", `
      ${kvRow("ID", data.app.id || "?")}
      ${data.app.title ? kvRow("Title", esc(data.app.title)) : ""}
      ${kvRow("Namespace", data.app.namespace || "N/A")}
      ${kvRow("Version", data.app.version || "N/A")}
      ${data.app.type ? kvRow("Type", esc(data.app.type)) : ""}
    `);
  }

  // Fiori Elements
  if (data.fioriElements && data.fioriElements.isFioriElements) {
    html += card("Fiori Elements", `
      ${kvRow("Framework", esc(data.fioriElements.framework || "?"))}
      ${data.fioriElements.floorplans.length > 0 ? kvRow("Floorplans", data.fioriElements.floorplans.map(f => `<span class="method-tag">${esc(f)}</span>`).join("")) : ""}
    `);
  }

  // Control stats
  if (data.controlStats) {
    html += card("Controls", `
      ${kvRow("Total", String(data.controlStats.total))}
      ${kvRow("Custom", String(data.controlStats.custom))}
      ${kvRow("Busy", String(data.controlStats.busy))}
    `);
  }

  // Launchpad card
  if (data.launchpad) {
    let lpContent = "";
    if (data.launchpad.user) {
      lpContent += kvRow("User", esc(data.launchpad.user.name || data.launchpad.user.id));
      if (data.launchpad.user.language) lpContent += kvRow("Language", esc(data.launchpad.user.language));
      if (data.launchpad.user.theme) lpContent += kvRow("Theme", esc(data.launchpad.user.theme));
    }
    lpContent += kvRow("Personalization", data.launchpad.personalization ? "Active" : "Inactive");
    if (data.launchpad.services && data.launchpad.services.length > 0) {
      lpContent += kvRow("Services", data.launchpad.services.map(s => `<span class="method-tag">${esc(s)}</span>`).join(""));
    }
    if (data.launchpad.currentApp) {
      lpContent += kvRow("Current App Type", esc(data.launchpad.currentApp.applicationType || "?"));
    }
    html += card("Fiori Launchpad", lpContent);
  }

  // Libraries
  if (data.libraries && data.libraries.length > 0) {
    let libContent = collapsible(`Loaded Libraries (${data.libraries.length})`, () => {
      return `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Library</th><th>Version</th></tr></thead>
        <tbody>${data.libraries.map(l =>
          `<tr><td class="mono">${esc(l.name)}</td><td>${esc(l.version || "?")}</td></tr>`
        ).join("")}</tbody></table></div>`;
    });
    html += `<div class="card"><div class="card-body" style="padding:0">${libContent}</div></div>`;
  }

  // URL card
  if (data.url) {
    let urlContent = kvRow("Fiori Intent", data.url.fioriIntent || "Standalone");
    const flags = data.url.technicalFlags;
    if (flags) {
      if (flags.debugActive) urlContent += kvRow("sap-ui-debug", `<span class="msg-error">${esc(flags.debugValue || "true")}</span>`);
      if (flags.themeOverride) urlContent += kvRow("Theme Override", esc(flags.themeOverride));
      if (flags.flexDisabled) urlContent += kvRow("Flex Errors", '<span class="msg-error">Enabled</span>');
      if (flags.cacheBusterToken) urlContent += kvRow("Cache Buster", esc(flags.cacheBusterToken));
    }
    const paramKeys = Object.keys(data.url.parameters || {});
    if (paramKeys.length > 0) {
      urlContent += `<div style="margin-top:6px;font-size:11px;color:var(--text-light)">URL Parameters (${paramKeys.length}):</div>`;
      paramKeys.slice(0, 10).forEach(k => {
        urlContent += kvRow(esc(k), `<span class="mono">${esc(data.url.parameters[k])}</span>`);
      });
      if (paramKeys.length > 10) urlContent += `<div style="font-size:11px;color:var(--text-light)">...and ${paramKeys.length - 10} more</div>`;
    }
    html += card("URL Analysis", urlContent);
  }

  el.innerHTML = html;
}

// --- Render: Components ---

function renderComponents(data) {
  const el = document.getElementById("tab-components");
  if (!data.components || data.components.length === 0) {
    el.innerHTML = placeholder("&#128230;", "No components found");
    return;
  }

  let html = "";

  data.components.forEach(comp => {
    let body = "";
    body += kvRow("Type", `<span class="mono">${esc(comp.type)}</span>`);
    body += kvRow("Manifest ID", comp.manifestId ? `<span class="mono">${esc(comp.manifestId)}</span>` : "N/A");
    body += kvRow("Version", comp.manifestVersion || "N/A");
    if (comp.title) body += kvRow("Title", esc(comp.title));
    if (comp.appType) body += kvRow("App Type", esc(comp.appType));
    if (comp.ach) body += kvRow("ACH", esc(comp.ach));

    const compModels = (data.models || []).filter(m => m.componentId === comp.id);
    if (compModels.length > 0) {
      body += collapsible(`Models (${compModels.length})`, () => {
        let mhtml = "";
        compModels.forEach(m => {
          mhtml += `<div style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f0f0f0">`;
          mhtml += kvRow("Name", `<strong>${esc(m.name)}</strong>`);
          mhtml += kvRow("Type", `<span class="mono">${esc(m.type)}</span>`);
          if (m.serviceUrl) mhtml += kvRow("Service URL", `<span class="mono" style="font-size:10px">${esc(m.serviceUrl)}</span>`);
          if (m.defaultBindingMode) mhtml += kvRow("Mode", esc(m.defaultBindingMode));
          if (m.hasPendingChanges !== null) mhtml += kvRow("Pending changes", m.hasPendingChanges ? "Yes" : "No");
          mhtml += `</div>`;
        });
        return mhtml;
      });
    }

    const compViews = (data.views || []).filter(v => v.componentId === comp.id);
    if (compViews.length > 0) {
      body += collapsible(`Views (${compViews.length})`, () => {
        let vhtml = "";
        compViews.forEach(v => {
          vhtml += `<div style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f0f0f0">`;
          vhtml += kvRow("View ID", `<span class="mono" style="font-size:10px">${esc(v.viewId)}</span>`);
          vhtml += kvRow("Type", `<span class="mono">${esc(v.viewType)}</span>`);
          if (v.controllerName) vhtml += kvRow("Controller", `<span class="mono">${esc(v.controllerName)}</span>`);

          const ctrl = (data.controllers || []).find(c => c.viewId === v.viewId);
          if (ctrl && ctrl.customMethods.length > 0) {
            vhtml += `<div style="margin-top:4px"><span class="kv-key">Custom Methods (${ctrl.customMethods.length}):</span></div>`;
            vhtml += `<div style="margin-top:2px">${ctrl.customMethods.map(m => `<span class="method-tag">${esc(m)}</span>`).join("")}</div>`;
          }
          vhtml += `</div>`;
        });
        return vhtml;
      });
    }

    html += card(esc(comp.id), body);
  });

  el.innerHTML = html;
}

// --- Render: OData ---

function renderOData(data) {
  const el = document.getElementById("tab-odata");
  const odataModels = (data.models || []).filter(m => m.odataVersion);

  if (odataModels.length === 0) {
    el.innerHTML = placeholder("&#128209;", "No OData services found");
    return;
  }

  // Group by serviceUrl
  const byUrl = {};
  odataModels.forEach(m => {
    const url = m.serviceUrl || "(no URL)";
    if (!byUrl[url]) {
      byUrl[url] = {
        serviceUrl: m.serviceUrl,
        odataVersion: m.odataVersion,
        metadataLoaded: m.metadataLoaded,
        entityTypes: m.entityTypes || [],
        entitySets: m.entitySets || [],
        functionImports: m.functionImports || [],
        annotationUrls: m.annotationUrls || [],
        components: [],
        modelNames: []
      };
    }
    const svc = byUrl[url];
    if (!svc.components.includes(m.componentId)) svc.components.push(m.componentId);
    const displayName = m.name || "default";
    if (!svc.modelNames.includes(displayName)) svc.modelNames.push(displayName);
    if (m.metadataLoaded && !svc.metadataLoaded) {
      svc.metadataLoaded = true;
      svc.entityTypes = m.entityTypes || [];
      svc.entitySets = m.entitySets || [];
      svc.functionImports = m.functionImports || [];
      svc.annotationUrls = m.annotationUrls || [];
    }
  });

  let html = `<input type="text" id="entityFilter" class="filter-input" placeholder="Filter entity types/sets…" value="${esc(entityFilter)}" aria-label="Filter entities">`;

  for (const url in byUrl) {
    const svc = byUrl[url];
    const versionLabel = svc.odataVersion ? svc.odataVersion.toUpperCase() : "?";
    const metaDot = svc.metadataLoaded
      ? `<span class="status-dot on"></span>`
      : `<span class="status-dot off"></span>`;

    const headerHtml = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
      <span class="mono" style="font-size:10px;word-break:break-all;flex:1">${esc(svc.serviceUrl || "(no URL)")}</span>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="badge primary">${esc(versionLabel)}</span>
        ${metaDot}
      </div>
    </div>`;

    let body = "";

    if (svc.components.length > 0) {
      body += kvRow("Components", `<span class="mono" style="font-size:10px">${svc.components.map(c => esc(shortType(c))).join(", ")}</span>`);
    }
    if (svc.modelNames.length > 0) {
      body += kvRow("Model Names", svc.modelNames.map(n => `<span class="method-tag">${esc(n)}</span>`).join(""));
    }
    if (svc.annotationUrls && svc.annotationUrls.length > 0) {
      body += kvRow("Annotations", String(svc.annotationUrls.length));
    }

    if (!svc.metadataLoaded) {
      body += `<div style="margin-top:8px;font-size:11px;color:var(--text-light)">Metadata not loaded yet — analyze after the app has fully initialized.</div>`;
    } else {
      const filteredET = entityFilter
        ? svc.entityTypes.filter(et => et.name && et.name.toLowerCase().includes(entityFilter))
        : svc.entityTypes;
      const filteredES = entityFilter
        ? svc.entitySets.filter(es => es.name && es.name.toLowerCase().includes(entityFilter))
        : svc.entitySets;
      const filteredFI = entityFilter
        ? svc.functionImports.filter(fi => fi.name && fi.name.toLowerCase().includes(entityFilter))
        : svc.functionImports;

      if (filteredET.length > 0) {
        body += collapsible(`Entity Types (${filteredET.length}${filteredET.length !== svc.entityTypes.length ? "/" + svc.entityTypes.length : ""})`, () => {
          let etHtml = "";
          filteredET.forEach(et => {
            const propCount = (et.properties || []).length;
            etHtml += collapsible(`${esc(et.name)} (${propCount} prop${propCount !== 1 ? "s" : ""})`, () => {
              if (!et.properties || et.properties.length === 0) return `<div style="font-size:11px;color:var(--text-light)">No properties</div>`;
              let tHtml = `<div style="overflow-x:auto"><table class="data-table">
                <thead><tr><th>Property</th><th>Type</th><th>Key</th></tr></thead><tbody>`;
              et.properties.forEach(p => {
                tHtml += `<tr>
                  <td><strong>${esc(p.name)}</strong></td>
                  <td class="mono" style="font-size:10px">${esc(p.type || "")}</td>
                  <td style="text-align:center">${p.isKey ? "&#9679;" : ""}</td>
                </tr>`;
              });
              tHtml += `</tbody></table></div>`;
              if (et.navProperties && et.navProperties.length > 0) {
                tHtml += `<div style="margin-top:4px;font-size:11px;color:var(--text-light)">Nav: ${et.navProperties.map(n => `<span class="method-tag">${esc(n.name)}</span>`).join("")}</div>`;
              }
              return tHtml;
            });
          });
          return etHtml;
        });
      }

      if (filteredES.length > 0) {
        body += collapsible(`Entity Sets (${filteredES.length}${filteredES.length !== svc.entitySets.length ? "/" + svc.entitySets.length : ""})`, () => {
          return `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Entity Set</th><th>Entity Type</th></tr></thead>
            <tbody>${filteredES.map(es =>
              `<tr><td><strong>${esc(es.name)}</strong></td><td class="mono" style="font-size:10px">${esc(es.entityType || "")}</td></tr>`
            ).join("")}</tbody></table></div>`;
        });
      }

      if (filteredFI.length > 0) {
        body += collapsible(`Function/Action Imports (${filteredFI.length}${filteredFI.length !== svc.functionImports.length ? "/" + svc.functionImports.length : ""})`, () => {
          return `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Name</th><th>Method</th><th>Return Type</th></tr></thead>
            <tbody>${filteredFI.map(fi =>
              `<tr>
                <td><strong>${esc(fi.name)}</strong></td>
                <td class="mono" style="font-size:10px">${esc(fi.httpMethod || "")}</td>
                <td class="mono" style="font-size:10px">${esc(fi.returnType || "")}</td>
              </tr>`
            ).join("")}</tbody></table></div>`;
        });
      }

      if (svc.entityTypes.length === 0 && svc.entitySets.length === 0 && svc.functionImports.length === 0) {
        body += `<div style="margin-top:8px;font-size:11px;color:var(--text-light)">Metadata loaded but no schema details extracted.</div>`;
      }
    }

    html += `<div class="card" style="margin-bottom:10px">
      <div class="card-header">${headerHtml}</div>
      <div class="card-body">${body}</div>
    </div>`;
  }

  el.innerHTML = html;
}

// --- Render: Bindings ---

function renderBindings(data) {
  const el = document.getElementById("tab-bindings");
  if (!data.bindings || data.bindings.length === 0) {
    el.innerHTML = placeholder("&#128279;", "No bindings found");
    return;
  }

  // Filter
  const filtered = bindingFilter
    ? data.bindings.filter(b =>
        (b.path && b.path.toLowerCase().includes(bindingFilter)) ||
        (b.property && b.property.toLowerCase().includes(bindingFilter)) ||
        (b.controlType && b.controlType.toLowerCase().includes(bindingFilter)))
    : data.bindings;

  // Group by model
  const byModel = {};
  filtered.forEach(b => {
    const key = b.model || "default";
    if (!byModel[key]) byModel[key] = [];
    byModel[key].push(b);
  });

  let html = `<input type="text" id="bindingFilter" class="filter-input" placeholder="Filter by path, property or control…" value="${esc(bindingFilter)}" aria-label="Filter bindings">`;
  html += `<div style="font-size:11px;color:var(--text-light);margin-bottom:6px">Showing ${filtered.length} of ${data.bindings.length}</div>`;

  for (const modelName in byModel) {
    const items = byModel[modelName];
    html += `<div class="card" style="margin-bottom:10px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Model: ${esc(modelName)}</span>
        <span class="badge primary">${items.length}</span>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Property</th><th>Path</th><th>Control</th><th>Kind</th></tr></thead>
          <tbody>`;

    const maxShow = 100;
    items.slice(0, maxShow).forEach(b => {
      html += `<tr>
        <td><strong>${esc(b.property)}</strong></td>
        <td class="mono">${esc(b.path)}</td>
        <td class="mono" style="font-size:10px" title="${esc(b.controlId)}">${esc(shortType(b.controlType))}</td>
        <td style="font-size:10px">${esc(b.kind || "property")}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    if (items.length > maxShow) {
      html += `<div style="padding:6px 8px;font-size:11px;color:var(--text-light)">Showing ${maxShow} of ${items.length}</div>`;
    }
    html += `</div></div>`;
  }

  el.innerHTML = html;
}

// --- Render: Routing ---

function renderRouting(data) {
  const el = document.getElementById("tab-routing");
  if (!data.routing || data.routing.length === 0) {
    el.innerHTML = placeholder("&#128679;", "No routing configuration found");
    return;
  }

  let html = "";
  data.routing.forEach(r => {
    let body = "";
    if (r.config) {
      body += collapsible("Config", () => {
        let c = "";
        for (const k in r.config) {
          c += kvRow(esc(k), `<span class="mono" style="font-size:10px">${esc(typeof r.config[k] === "object" ? JSON.stringify(r.config[k]) : r.config[k])}</span>`);
        }
        return c;
      });
    }
    if (r.currentHash != null) body += kvRow("Current Hash", `<span class="mono">${esc(r.currentHash || "(empty)")}</span>`);
    if (r.currentRoute) body += kvRow("Current Route", `<strong>${esc(r.currentRoute)}</strong>`);

    if (r.routes && r.routes.length > 0) {
      body += `<div style="margin-top:6px;font-weight:600;font-size:11px;color:var(--text-light)">ROUTES (${r.routes.length})</div>`;
      body += `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Name</th><th>Pattern</th><th>Target</th></tr></thead>
        <tbody>${r.routes.map(rt =>
          `<tr>
            <td><strong>${esc(rt.name || "")}</strong></td>
            <td class="mono" style="font-size:10px">${esc(rt.pattern || "")}</td>
            <td class="mono" style="font-size:10px">${esc(rt.target || "")}</td>
          </tr>`
        ).join("")}</tbody></table></div>`;
    }
    if (r.targets && r.targets.length > 0) {
      body += `<div style="margin-top:8px;font-weight:600;font-size:11px;color:var(--text-light)">TARGETS (${r.targets.length})</div>`;
      body += `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Name</th><th>View</th><th>Type</th></tr></thead>
        <tbody>${r.targets.map(t =>
          `<tr>
            <td><strong>${esc(t.name)}</strong></td>
            <td class="mono" style="font-size:10px">${esc(t.viewName || "")}</td>
            <td class="mono" style="font-size:10px">${esc(t.viewType || "")}</td>
          </tr>`
        ).join("")}</tbody></table></div>`;
    }

    html += card(esc(r.componentId), body);
  });

  el.innerHTML = html;
}

// --- Render: Manifest ---

function renderManifest(data) {
  const el = document.getElementById("tab-manifest");
  if (!data.manifestSnapshots || data.manifestSnapshots.length === 0) {
    el.innerHTML = placeholder("&#128221;", "No manifest available");
    return;
  }

  let html = "";
  data.manifestSnapshots.forEach(ms => {
    let body = "";
    body += kvRow("ID", `<span class="mono">${esc(ms.sapApp.id || "?")}</span>`);
    if (ms.sapApp.title) body += kvRow("Title", esc(ms.sapApp.title));
    if (ms.sapApp.type) body += kvRow("Type", esc(ms.sapApp.type));
    if (ms.sapApp.ach) body += kvRow("ACH", esc(ms.sapApp.ach));

    // Data sources
    const dsKeys = Object.keys(ms.sapApp.dataSources || {});
    if (dsKeys.length > 0) {
      body += collapsible(`Data Sources (${dsKeys.length})`, () => {
        let h = `<div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>Name</th><th>Type</th><th>URI</th></tr></thead><tbody>`;
        dsKeys.forEach(k => {
          const ds = ms.sapApp.dataSources[k];
          h += `<tr>
            <td><strong>${esc(k)}</strong></td>
            <td>${esc(ds.type || "")}</td>
            <td class="mono" style="font-size:10px">${esc(ds.uri || "")}</td>
          </tr>`;
        });
        h += `</tbody></table></div>`;
        return h;
      });
    }

    // Dependencies
    if (ms.sapUi5.dependencies && ms.sapUi5.dependencies.libs) {
      const libNames = Object.keys(ms.sapUi5.dependencies.libs);
      body += collapsible(`Declared Libraries (${libNames.length})`, () => {
        return libNames.map(n => `<div class="mono" style="font-size:10px;padding:2px 0">${esc(n)}${ms.sapUi5.dependencies.libs[n].minVersion ? " &middot; min " + esc(ms.sapUi5.dependencies.libs[n].minVersion) : ""}</div>`).join("");
      });
    }

    // Component usages
    if (ms.sapUi5.componentUsages) {
      const usages = Object.keys(ms.sapUi5.componentUsages);
      if (usages.length > 0) {
        body += collapsible(`Component Usages (${usages.length})`, () => {
          return usages.map(u => `<div class="mono" style="font-size:10px;padding:2px 0">${esc(u)} → ${esc(ms.sapUi5.componentUsages[u].name || "")}</div>`).join("");
        });
      }
    }

    // sap.fiori
    if (ms.sapFiori) {
      body += collapsible("sap.fiori", () => {
        let h = "";
        if (ms.sapFiori.registrationIds) h += kvRow("Registration IDs", `<span class="mono" style="font-size:10px">${esc(JSON.stringify(ms.sapFiori.registrationIds))}</span>`);
        if (ms.sapFiori.archeType) h += kvRow("Archetype", esc(ms.sapFiori.archeType));
        return h || `<div style="font-size:11px;color:var(--text-light)">No fields</div>`;
      });
    }

    // Full manifest JSON
    body += collapsible("Full manifest.json", () => {
      return `<pre class="mono" style="font-size:10px;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow:auto;background:#fafbfc;padding:8px;border-radius:4px">${esc(JSON.stringify(ms.full, null, 2))}</pre>`;
    });

    html += card(esc(ms.componentId), body);
  });

  el.innerHTML = html;
}

// --- Render: Logs ---

function renderLogs(data) {
  const el = document.getElementById("tab-logs");
  let html = "";

  // Filter bar
  html += `<div style="display:flex;gap:6px;margin-bottom:8px">
    <select id="logFilterLevel" class="filter-input" style="flex:0 0 120px;margin-bottom:0" aria-label="Filter log level">
      <option value="0"${logFilter.level === 0 ? " selected" : ""}>All levels</option>
      <option value="1"${logFilter.level === 1 ? " selected" : ""}>Fatal</option>
      <option value="2"${logFilter.level === 2 ? " selected" : ""}>Error+</option>
      <option value="3"${logFilter.level === 3 ? " selected" : ""}>Warning+</option>
      <option value="4"${logFilter.level === 4 ? " selected" : ""}>Info+</option>
    </select>
    <input type="text" id="logFilterText" class="filter-input" style="flex:1;margin-bottom:0" placeholder="Filter text…" value="${esc(logFilter.text)}" aria-label="Filter log text">
  </div>`;

  // Messages
  if (data.messages && data.messages.count > 0) {
    html += `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
      <span>Messages</span><span class="badge ${data.messages.count > 0 ? "warning" : ""}">${data.messages.count}</span>
    </div><div class="card-body" style="padding:0">
      <table class="data-table"><thead><tr><th>Type</th><th>Message</th><th>Target</th></tr></thead><tbody>`;
    (data.messages.items || []).forEach(m => {
      const cls = msgClass(m.type);
      html += `<tr>
        <td class="${cls}"><strong>${esc(m.type || "?")}</strong></td>
        <td style="font-size:11px">${esc(m.message || "")}</td>
        <td class="mono" style="font-size:10px">${esc(m.target || "")}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  // Deprecations
  if (data.deprecations && data.deprecations.length > 0) {
    html += `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
      <span>Deprecation Warnings</span><span class="badge warning">${data.deprecations.length}</span>
    </div><div class="card-body" style="padding:0">
      <table class="data-table"><thead><tr><th>Message</th></tr></thead><tbody>`;
    data.deprecations.slice(0, 30).forEach(e => {
      html += `<tr><td style="font-size:11px">${esc(e.message || "")}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  // Log entries (filtered)
  let entries = data.logEntries || [];
  if (logFilter.level > 0) entries = entries.filter(e => e.level <= logFilter.level);
  if (logFilter.text) entries = entries.filter(e => (e.message || "").toLowerCase().includes(logFilter.text));

  if (entries.length > 0) {
    html += `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
      <span>Log Entries</span><span class="badge">${entries.length}${entries.length !== (data.logEntries || []).length ? "/" + (data.logEntries || []).length : ""}</span>
    </div><div class="card-body" style="padding:0">
      <table class="data-table"><thead><tr><th>Level</th><th>Message</th><th>Component</th></tr></thead><tbody>`;
    entries.forEach(e => {
      const cls = logLevelClass(e.level);
      html += `<tr>
        <td class="${cls}"><strong>${logLevelName(e.level)}</strong></td>
        <td style="font-size:11px">${esc(e.message || "")}</td>
        <td class="mono" style="font-size:10px">${esc(e.component || "")}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  if (!data.messages?.count && entries.length === 0 && !(data.deprecations && data.deprecations.length)) {
    html += placeholder("&#128220;", "No messages or log entries");
  }

  el.innerHTML = html;
}

// --- Render: Performance ---

function renderPerformance(data) {
  const el = document.getElementById("tab-performance");
  if (!data.performance) {
    el.innerHTML = placeholder("&#9201;", "No performance data");
    return;
  }
  const p = data.performance;
  let html = "";

  if (p.navigationTiming) {
    html += card("Page Load", `
      ${kvRow("DOMContentLoaded", p.navigationTiming.domContentLoadedMs + " ms")}
      ${kvRow("Load Event", p.navigationTiming.loadEventMs + " ms")}
      ${kvRow("Transfer Size", p.navigationTiming.transferSizeKB + " KB")}
    `);
  }

  if (p.memory) {
    html += card("Memory (Chrome only)", `
      ${kvRow("JS Heap Used", p.memory.usedHeapMB + " MB")}
      ${kvRow("JS Heap Total", p.memory.totalHeapMB + " MB")}
    `);
  }

  if (p.odataRequests) {
    let body = `${kvRow("Requests", String(p.odataRequests.count))}
      ${kvRow("Total Size", p.odataRequests.totalSizeKB + " KB")}
      ${kvRow("Avg Duration", p.odataRequests.avgDurationMs + " ms")}`;
    if (p.odataRequests.slowest && p.odataRequests.slowest.length > 0) {
      body += `<div style="margin-top:6px;font-size:11px;color:var(--text-light)">Slowest:</div>`;
      body += `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>URL</th><th>ms</th><th>KB</th></tr></thead><tbody>${p.odataRequests.slowest.map(s =>
          `<tr><td class="mono" style="font-size:10px;max-width:300px">${esc(s.url)}</td><td>${s.durationMs}</td><td>${s.sizeKB}</td></tr>`
        ).join("")}</tbody></table></div>`;
    }
    html += card("OData Requests", body);
  }

  if (p.measurements && p.measurements.length > 0) {
    html += card(`UI5 Measurements (${p.measurements.length})`,
      `<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>ID</th><th>Duration</th></tr></thead>
        <tbody>${p.measurements.map(m =>
          `<tr><td class="mono" style="font-size:10px">${esc(m.id)}</td><td>${m.duration ?? ""} ms</td></tr>`
        ).join("")}</tbody></table></div>`
    );
  }

  if (!html) html = placeholder("&#9201;", "No performance data captured");
  el.innerHTML = html;
}

// --- Render: Runtime ---

function renderRuntime(data) {
  const el = document.getElementById("tab-runtime");
  let html = "";

  if (data.runtime) {
    const r = data.runtime;
    let deviceContent = "";
    deviceContent += kvRow("Touch", r.touch ? "Yes" : "No");
    deviceContent += kvRow("Mobile", r.mobile ? "Yes" : "No");
    if (r.system) {
      deviceContent += kvRow("Desktop", r.system.desktop ? "Yes" : "No");
      deviceContent += kvRow("Phone", r.system.phone ? "Yes" : "No");
      deviceContent += kvRow("Tablet", r.system.tablet ? "Yes" : "No");
    }
    if (r.os) {
      deviceContent += kvRow("OS", `${r.os.name || "?"} ${r.os.versionStr || ""}`);
    }
    if (r.orientation) {
      deviceContent += kvRow("Orientation", r.orientation.landscape ? "Landscape" : "Portrait");
    }
    html += card("Device (page UA)", deviceContent);
  }

  if (data.theming) {
    let thContent = "";
    thContent += kvRow("Theme", data.theming.theme || "?");
    thContent += kvRow("RTL", data.theming.rtl ? "Yes" : "No");
    if (data.theming.contentDensity) thContent += kvRow("Density", data.theming.contentDensity);
    if (data.theming.fonts) {
      const fonts = typeof data.theming.fonts === "object" ? Object.values(data.theming.fonts).join(", ") : String(data.theming.fonts);
      thContent += kvRow("Fonts", esc(fonts));
    }
    html += card("Theming", thContent);
  }

  if (data.loader) {
    html += card("Loader", `
      ${kvRow("Async", data.loader.async ? "Yes" : "No")}
      ${data.loader.paths !== null ? kvRow("Custom paths", String(data.loader.paths)) : ""}
      ${data.loader.modulesCount !== null ? kvRow("Loaded modules", String(data.loader.modulesCount)) : ""}
    `);
  }

  if (data.fragments && data.fragments.length > 0) {
    let fragContent = "";
    data.fragments.forEach(f => {
      fragContent += kvRow(esc(f.id), `<span class="mono">${esc(f.type)}</span>`);
    });
    html += card(`Fragments (${data.fragments.length})`, fragContent);
  }

  if (data.resources) {
    let resContent = "";
    if (data.resources.scripts.length > 0) {
      resContent += `<div style="margin-bottom:4px"><strong>Scripts (${data.resources.scripts.length})</strong></div>`;
      data.resources.scripts.forEach(s => {
        resContent += `<div class="mono" style="font-size:10px;padding:2px 0;word-break:break-all">${esc(s)}</div>`;
      });
    }
    if (data.resources.css.length > 0) {
      resContent += `<div style="margin-top:6px;margin-bottom:4px"><strong>CSS (${data.resources.css.length})</strong></div>`;
      data.resources.css.forEach(s => {
        resContent += `<div class="mono" style="font-size:10px;padding:2px 0;word-break:break-all">${esc(s)}</div>`;
      });
    }
    if (resContent) html += card("UI5 Resources", resContent);
  }

  if (data.icons && data.icons.length > 0) {
    html += card(`Icons Used (${data.icons.length})`,
      `<div>${data.icons.map(i => `<span class="method-tag">${esc(i)}</span>`).join("")}</div>`
    );
  }

  if (!html) html = placeholder("&#9881;", "No runtime data available");
  el.innerHTML = html;
}

// --- Render: JSON ---

function renderJSON(data) {
  document.getElementById("jsonOutput").textContent = JSON.stringify(data, null, 2);
}

// --- Copy / Export ---

function copyJSON() {
  const text = document.getElementById("jsonOutput").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "COPIED!";
    setTimeout(() => { btn.textContent = "COPY JSON"; }, 1500);
  });
}

function downloadJSON() {
  if (!analysisData) return;
  const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: "application/json" });
  triggerDownload(blob, "sapui5-analysis-" + Date.now() + ".json");
}

function downloadHTML() {
  if (!analysisData) return;
  const json = JSON.stringify(analysisData, null, 2);
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>SAPUI5 Explorer Report</title>
<style>
body{font-family:'Segoe UI',sans-serif;max-width:1100px;margin:20px auto;padding:0 20px;color:#333}
h1{color:#0070f2}h2{border-bottom:2px solid #0070f2;padding-bottom:4px;margin-top:30px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px}
th,td{border:1px solid #dee2e6;padding:6px;text-align:left}th{background:#f4f7f9}
pre{background:#f4f7f9;padding:12px;border-radius:6px;overflow:auto;font-size:11px;max-height:600px}
.kv{display:grid;grid-template-columns:200px 1fr;gap:4px;margin:4px 0}
.label{color:#666;font-weight:600}
</style></head><body>
<h1>SAPUI5 Explorer Report</h1>
<p>Generated: ${new Date().toISOString()}</p>
<p>UI5 Version: <strong>${esc(analysisData._meta?.ui5Version || "?")}</strong></p>
<p>URL: <code>${esc(analysisData.url?.fullUrl || "")}</code></p>

<h2>Components (${(analysisData.components || []).length})</h2>
<table><tr><th>ID</th><th>Type</th><th>Manifest ID</th><th>Version</th></tr>
${(analysisData.components || []).map(c =>
  `<tr><td>${esc(c.id)}</td><td>${esc(c.type)}</td><td>${esc(c.manifestId || "")}</td><td>${esc(c.manifestVersion || "")}</td></tr>`
).join("")}
</table>

<h2>OData Models (${(analysisData.models || []).filter(m => m.odataVersion).length})</h2>
<table><tr><th>Name</th><th>Version</th><th>Service URL</th><th>Loaded</th></tr>
${(analysisData.models || []).filter(m => m.odataVersion).map(m =>
  `<tr><td>${esc(m.name)}</td><td>${esc(m.odataVersion)}</td><td>${esc(m.serviceUrl || "")}</td><td>${m.metadataLoaded ? "Yes" : "No"}</td></tr>`
).join("")}
</table>

<h2>Bindings (${(analysisData.bindings || []).length})</h2>
<table><tr><th>Property</th><th>Path</th><th>Model</th><th>Control</th></tr>
${(analysisData.bindings || []).slice(0, 500).map(b =>
  `<tr><td>${esc(b.property)}</td><td><code>${esc(b.path)}</code></td><td>${esc(b.model)}</td><td>${esc(b.controlType)}</td></tr>`
).join("")}
</table>

<h2>Routing</h2>
${(analysisData.routing || []).map(r => `
  <h3>${esc(r.componentId)}</h3>
  <table><tr><th>Route</th><th>Pattern</th><th>Target</th></tr>
  ${(r.routes || []).map(rt => `<tr><td>${esc(rt.name)}</td><td><code>${esc(rt.pattern)}</code></td><td>${esc(rt.target)}</td></tr>`).join("")}
  </table>
`).join("")}

<h2>Full JSON</h2>
<pre>${esc(json)}</pre>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  triggerDownload(blob, "sapui5-report-" + Date.now() + ".html");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Utility Functions ---

function esc(str) {
  if (str === null || str === undefined) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function card(title, bodyHtml) {
  return `<div class="card"><div class="card-header">${title}</div><div class="card-body">${bodyHtml}</div></div>`;
}

function kvRow(key, valueHtml) {
  return `<div class="kv-row"><span class="kv-key">${key}</span><span class="kv-value">${valueHtml}</span></div>`;
}

function collapsible(title, contentFn) {
  const content = contentFn();
  return `<div class="collapsible">
    <div class="collapsible-header">
      <span class="collapsible-chevron">&#9654;</span> ${title}
    </div>
    <div class="collapsible-body">${content}</div>
  </div>`;
}

function setBadge(id, count, type) {
  const badge = document.getElementById(id);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 999 ? "999+" : count;
    badge.className = "badge" + (type ? " " + type : " primary");
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function showPlaceholder(panelId, icon, text) {
  document.getElementById(panelId).innerHTML = placeholder(icon, text);
}

function placeholder(icon, text) {
  return `<div class="placeholder"><div class="placeholder-icon">${icon}</div><div class="placeholder-text">${text}</div></div>`;
}

function shortType(fullType) {
  if (!fullType) return "?";
  const parts = fullType.split(".");
  return parts[parts.length - 1];
}

function msgClass(type) {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t === "error") return "msg-error";
  if (t === "warning") return "msg-warning";
  if (t === "success") return "msg-success";
  return "msg-info";
}

function logLevelClass(level) {
  if (level === 1) return "msg-error";
  if (level === 2) return "msg-error";
  if (level === 3) return "msg-warning";
  return "";
}

function logLevelName(level) {
  const names = { 1: "FATAL", 2: "ERROR", 3: "WARNING", 4: "INFO", 5: "DEBUG", 6: "TRACE" };
  return names[level] || "L" + level;
}
