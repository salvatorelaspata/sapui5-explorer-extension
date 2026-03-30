/* SAPUI5 Explorer - UI Controller */

let analysisData = null;

// --- Init ---

document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);
document.getElementById("copyBtn").addEventListener("click", copyJSON);
document.getElementById("tabBar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (btn) switchTab(btn.dataset.tab);
});
document.getElementById("errorBanner").addEventListener("click", () => {
  document.getElementById("errorBannerDetails").classList.toggle("open");
});

// Collapsible sections - event delegation (inline onclick blocked by CSP)
document.getElementById("tabContent").addEventListener("click", (e) => {
  const header = e.target.closest(".collapsible-header");
  if (header) {
    header.parentElement.classList.toggle("open");
  }
});

// --- Analysis ---

async function runAnalysis() {
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

      // Version badge
      if (data._meta?.ui5Version) {
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
        // Auto-expand if few errors so user sees them immediately
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
      renderLogs(data);
      renderRuntime(data);
      renderJSON(data);

      // Update badges
      setBadge("badgeComponents", (data.components || []).length);
      const odataCount = [...new Set((data.models || []).filter(m => m.odataVersion).map(m => m.serviceUrl))].length;
      setBadge("badgeOData", odataCount);
      setBadge("badgeBindings", (data.bindings || []).length);
      const logCount = (data.messages?.count || 0) + (data.logEntries || []).length;
      setBadge("badgeLogs", logCount, logCount > 0 ? "warning" : "");

      switchTab("overview");
    }
  } catch (err) {
    showPlaceholder("tab-overview", "&#9888;", "Error: " + err.message);
  }

  btn.textContent = "ANALYZE";
  btn.disabled = false;
}

// --- Tab Switching ---

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
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

  // Framework card
  if (data.framework) {
    const fw = data.framework;
    const debugHtml = fw.debug
      ? `<span class="status-dot on"></span>ON`
      : `<span class="status-dot off"></span>OFF`;
    html += card("Framework", `
      ${kvRow("Version", fw.version || "?")}
      ${kvRow("Theme", fw.theme || "?")}
      ${kvRow("Language", fw.language || "?")}
      ${kvRow("Debug", debugHtml)}
      ${kvRow("RTL", fw.rtl ? "Yes" : "No")}
      ${fw.accessibility !== null ? kvRow("Accessibility", fw.accessibility ? "Yes" : "No") : ""}
    `);
  }

  // App card
  if (data.app) {
    html += card("Application", `
      ${kvRow("ID", data.app.id || "?")}
      ${kvRow("Namespace", data.app.namespace || "N/A")}
      ${kvRow("Version", data.app.version || "N/A")}
    `);
  }

  // Launchpad card
  if (data.launchpad) {
    html += card("Fiori Launchpad", `
      ${data.launchpad.user ? kvRow("User", data.launchpad.user.name || data.launchpad.user.id) : kvRow("User", "N/A")}
      ${kvRow("Personalization", data.launchpad.personalization ? "Active" : "Inactive")}
    `);
  }

  // URL card
  if (data.url) {
    let urlContent = kvRow("Fiori Intent", data.url.fioriIntent || "Standalone");
    const flags = data.url.technicalFlags;
    if (flags) {
      if (flags.debugActive) urlContent += kvRow("sap-ui-debug", `<span class="msg-error">${esc(flags.debugValue || "true")}</span>`);
      if (flags.themeOverride) urlContent += kvRow("Theme Override", esc(flags.themeOverride));
      if (flags.flexDisabled) urlContent += kvRow("Flex Errors", '<span class="msg-error">Enabled</span>');
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

    // Models for this component
    const compModels = (data.models || []).filter(m => m.componentId === comp.id);
    if (compModels.length > 0) {
      body += collapsible(`Models (${compModels.length})`, () => {
        let mhtml = "";
        compModels.forEach(m => {
          mhtml += `<div style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f0f0f0">`;
          mhtml += kvRow("Name", `<strong>${esc(m.name)}</strong>`);
          mhtml += kvRow("Type", `<span class="mono">${esc(m.type)}</span>`);
          if (m.serviceUrl) mhtml += kvRow("Service URL", `<span class="mono" style="font-size:10px">${esc(m.serviceUrl)}</span>`);
          mhtml += `</div>`;
        });
        return mhtml;
      });
    }

    // Views for this component
    const compViews = (data.views || []).filter(v => v.componentId === comp.id);
    if (compViews.length > 0) {
      body += collapsible(`Views (${compViews.length})`, () => {
        let vhtml = "";
        compViews.forEach(v => {
          vhtml += `<div style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f0f0f0">`;
          vhtml += kvRow("View ID", `<span class="mono" style="font-size:10px">${esc(v.viewId)}</span>`);
          vhtml += kvRow("Type", `<span class="mono">${esc(v.viewType)}</span>`);
          if (v.controllerName) vhtml += kvRow("Controller", `<span class="mono">${esc(v.controllerName)}</span>`);

          // Custom methods for this view's controller
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
        components: [],
        modelNames: []
      };
    }
    const svc = byUrl[url];
    if (!svc.components.includes(m.componentId)) svc.components.push(m.componentId);
    const displayName = m.name || "default";
    if (!svc.modelNames.includes(displayName)) svc.modelNames.push(displayName);
    // Take metadata from whichever model has it loaded
    if (m.metadataLoaded && !svc.metadataLoaded) {
      svc.metadataLoaded = true;
      svc.entityTypes = m.entityTypes || [];
      svc.entitySets = m.entitySets || [];
      svc.functionImports = m.functionImports || [];
    }
  });

  let html = "";

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

    if (!svc.metadataLoaded) {
      body += `<div style="margin-top:8px;font-size:11px;color:var(--text-light)">Metadata not loaded yet — analyze after the app has fully initialized.</div>`;
    } else {
      // Entity Types
      if (svc.entityTypes.length > 0) {
        body += collapsible(`Entity Types (${svc.entityTypes.length})`, () => {
          let etHtml = "";
          svc.entityTypes.forEach(et => {
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

      // Entity Sets
      if (svc.entitySets.length > 0) {
        body += collapsible(`Entity Sets (${svc.entitySets.length})`, () => {
          return `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Entity Set</th><th>Entity Type</th></tr></thead>
            <tbody>${svc.entitySets.map(es =>
              `<tr><td><strong>${esc(es.name)}</strong></td><td class="mono" style="font-size:10px">${esc(es.entityType || "")}</td></tr>`
            ).join("")}</tbody></table></div>`;
        });
      }

      // Function Imports
      if (svc.functionImports.length > 0) {
        body += collapsible(`Function Imports (${svc.functionImports.length})`, () => {
          return `<div style="overflow-x:auto"><table class="data-table">
            <thead><tr><th>Name</th><th>Method</th><th>Return Type</th></tr></thead>
            <tbody>${svc.functionImports.map(fi =>
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

  // Group by model
  const byModel = {};
  data.bindings.forEach(b => {
    const key = b.model || "default";
    if (!byModel[key]) byModel[key] = [];
    byModel[key].push(b);
  });

  let html = "";

  for (const modelName in byModel) {
    const items = byModel[modelName];
    html += `<div class="card" style="margin-bottom:10px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Model: ${esc(modelName)}</span>
        <span class="badge primary">${items.length}</span>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto">
        <table class="data-table">
          <thead><tr><th>Property</th><th>Path</th><th>Control</th></tr></thead>
          <tbody>`;

    const maxShow = 50;
    items.slice(0, maxShow).forEach(b => {
      html += `<tr>
        <td><strong>${esc(b.property)}</strong></td>
        <td class="mono">${esc(b.path)}</td>
        <td class="mono" style="font-size:10px" title="${esc(b.controlId)}">${esc(shortType(b.controlType))}</td>
      </tr>`;
    });

    html += `</tbody></table>`;
    if (items.length > maxShow) {
      html += `<div style="padding:6px 8px;font-size:11px;color:var(--text-light)">Showing ${maxShow} of ${items.length} bindings</div>`;
    }
    html += `</div></div>`;
  }

  el.innerHTML = html;
}

// --- Render: Logs ---

function renderLogs(data) {
  const el = document.getElementById("tab-logs");
  let html = "";

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

  // Log entries
  if (data.logEntries && data.logEntries.length > 0) {
    html += `<div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
      <span>Log Entries</span><span class="badge">${data.logEntries.length}</span>
    </div><div class="card-body" style="padding:0">
      <table class="data-table"><thead><tr><th>Level</th><th>Message</th><th>Component</th></tr></thead><tbody>`;
    data.logEntries.forEach(e => {
      const cls = logLevelClass(e.level);
      html += `<tr>
        <td class="${cls}"><strong>${logLevelName(e.level)}</strong></td>
        <td style="font-size:11px">${esc(e.message || "")}</td>
        <td class="mono" style="font-size:10px">${esc(e.component || "")}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  if (!html) {
    html = placeholder("&#128220;", "No messages or log entries");
  }

  el.innerHTML = html;
}

// --- Render: Runtime ---

function renderRuntime(data) {
  const el = document.getElementById("tab-runtime");
  let html = "";

  // Device
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
    html += card("Device", deviceContent);
  }

  // Theming
  if (data.theming) {
    let thContent = "";
    thContent += kvRow("Theme", data.theming.theme || "?");
    thContent += kvRow("RTL", data.theming.rtl ? "Yes" : "No");
    if (data.theming.fonts) thContent += kvRow("Fonts", esc(JSON.stringify(data.theming.fonts)));
    html += card("Theming", thContent);
  }

  // Fragments
  if (data.fragments && data.fragments.length > 0) {
    let fragContent = "";
    data.fragments.forEach(f => {
      fragContent += kvRow(esc(f.id), `<span class="mono">${esc(f.type)}</span>`);
    });
    html += card(`Fragments (${data.fragments.length})`, fragContent);
  }

  // Resources
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

  // Icons
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

// --- Copy ---

function copyJSON() {
  const text = document.getElementById("jsonOutput").textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "COPIED!";
    btn.style.background = "var(--success)";
    btn.style.color = "white";
    btn.style.borderColor = "var(--success)";
    setTimeout(() => {
      btn.textContent = "COPY JSON";
      btn.style.background = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    }, 1500);
  });
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
  if (level === 1) return "msg-error";   // FATAL
  if (level === 2) return "msg-error";   // ERROR
  if (level === 3) return "msg-warning"; // WARNING
  return "";
}

function logLevelName(level) {
  const names = { 1: "FATAL", 2: "ERROR", 3: "WARNING", 4: "INFO", 5: "DEBUG", 6: "TRACE" };
  return names[level] || "L" + level;
}
