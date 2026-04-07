# SAPUI5 Explorer — Piano Miglioramenti

Stato: **v1.2 rilasciata** — la maggior parte di P0/P1/P2/P3 è completata. Restano P4 polish opzionali e refactor.

## Legenda priorità
- **P0** bug bloccante / regressione UI
- **P1** bug funzionale o API privata da sostituire
- **P2** miglioramento qualità/accuratezza dei dati
- **P3** nuova feature
- **P4** polish UX / nice-to-have

---

## Decisioni prese (2026-04-07)

1. **Compat ampia**: supporto da UI5 1.x (1.71 LTS) fino a 2.x. Tutti i fallback V1 mantenuti.
2. **Architettura**: tutto nel popup, niente service worker.
3. **Report HTML standalone**: nice-to-have, implementato dopo l'export JSON.
4. **Popup width**: 560 px con `overflow-x:auto` su `.tab-bar` come fallback.

---

## ✅ Completato in v1.2

### P0 — Layout & bug visibili
- [x] **Tab bar troncata** → popup `width: 560px`, padding `.tab-btn` 11px, scroll orizzontale visibile (`overflow-x: auto`, `overflow-y: hidden`).
- [x] **`<title>`** aggiunto in `popup.html`.
- [x] **Pagine ristrette** (`chrome://`, Web Store): check su `tab.url` con placeholder dedicato in `runAnalysis()`.

### P1 — Bug funzionali / API private
- [x] **`comp.oModels` privato sostituito**: nomi modello presi dal manifest + `comp.getModel(name)`, fallback su `oModels` come ultima risorsa.
- [x] **Binding scan generico**: rifattorizzato su `control.mBindingInfos` + `control.getObjectBinding()`. Distingue `kind: property | aggregation | object`. Whitelist `BINDING_PROPS` rimossa.
- [x] **Cross-component fix**: `views`/`controllers` raccolti in array locali per componente, `componentId` settato direttamente nel push.
- [x] **v4 Action/Function imports**: estratti dal MetaModel filtrando per `$kind === "ActionImport" | "FunctionImport"`.
- [x] **`MAX_CONTROLS`** alzato 5000 → 20000, `MAX_DEPTH` 30 → 50.
- [x] **Truncation tracciata**: array `result._truncations` esposto, mostrato come notice gialla nell'overview (`.truncation-notice`).
- [x] **Loader private API** segnalata via `loader._privateApi` (non più nel banner errori).

### P2 — Qualità dati estratti
- [x] **Routing** completo: config, routes, targets, `currentHash`, `currentRoute` via `getRouter().getRouteInfoByHash()`.
- [x] **Manifest snapshots** per componente (`sap.app`, `sap.ui5`, `sap.fiori`, full JSON).
- [x] **Data sources** dal manifest (sezione dedicata in tab Manifest).
- [x] **Annotation models**: `m.getServiceAnnotations()` v2 → conteggio mostrato per servizio.
- [x] **Dependencies** (`sap.ui5/dependencies/libs`): estratte in `manifestSnapshots`.
- [x] **Custom controls**: contati durante traversal (`controlStats.custom`).
- [x] **Busy controls**: contati durante traversal (`controlStats.busy`).
- [x] **Memory hints**: `controlStats.total` mostrato in overview + `performance.memory` in tab Perf.
- [x] **`runtime.browser`**: card rinominata "Device (page UA)" per chiarezza.
- [x] **Loaded libraries con versione** (`sap.ui.getVersionInfo()` + fallback `Core.getLoadedLibraries`).
- [x] **Loader config** (`async`, custom paths, modules count).
- [x] **Build timestamp** UI5 (in `framework`).
- [x] **Cache buster token** dall'URL.
- [x] **Content density** (compact/cozy/condensed) dal body class.
- [x] **`sap.app` esteso**: title, description, type, ach.
- [x] **`sap.fiori`** snapshot.
- [x] **`sap.ui5/componentUsages`** mostrati nel tab Manifest.
- [x] **Default binding mode** per modello.
- [x] **Pending changes** v2 (`hasPendingChanges`).
- [x] **Annotation URLs** per modello.
- [x] **FLP esteso**: user language/theme/density, services probe (CrossAppNav, URLParsing, AppLifeCycle, UserInfo, NavTargetResolution, ShellNavigation), `currentApp` via AppLifeCycle.
- [x] **Performance**: `sap.ui.performance.Measurement.getAllMeasurements()`, OData requests via Resource Timing (count, totale KB, avg ms, top 5 slowest), navigation timing, `performance.memory`.
- [x] **Deprecation warnings**: filtrati dai log e mostrati in sezione dedicata del tab Logs.
- [x] **Fiori Elements detect**: `sap.suite.ui.generic.template` / `sap.fe` + floorplans (ListReport, ObjectPage, ALP, OVP).

### P3 — Nuove feature
- [x] **Tab "Routing"** con tabelle route → pattern → target e targets dettagliati.
- [x] **Tab "Manifest"** con dataSources, dependencies, componentUsages, sap.fiori, full manifest JSON collassabile.
- [x] **Tab "Performance"** con page load, memory, OData requests, UI5 measurements.
- [x] **Search/filter**:
  - filtro testo nei Bindings (path/property/control);
  - filtro testo nelle Entity Types/Sets/Function Imports (OData);
  - filtro livello + testo nei Logs.
- [x] **Export to file**: pulsanti "Download JSON" e "Export HTML".
- [ ] ~~Persistenza analisi~~ — deciso di non persistere: l'analisi è ricalcolata a ogni apertura del popup.
- [x] **Report HTML standalone** condivisibile (componenti, OData, bindings, routing + JSON inline).

### P4 — Polish
- [x] **Dark mode** via `prefers-color-scheme` con override basato su variabili CSS (`--bg`, `--card-bg`, `--soft-bg`, `--row-border`, `--tag-bg`, `--tag-fg`, `--error-bg`, `--error-border`, `--warning-bg`).
- [x] **Accessibility base**: `aria-label`, `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected` aggiornato su switch, keyboard nav ← → sui tab.
- [x] **Fonts theming** in `renderRuntime` ora formattato (no più JSON.stringify raw).
- [x] **`<title>`** aggiunto.

---

## ⏳ Da fare

### P3 — Nuove feature (rimanenti)
- [ ] **Auto re-analyze opzionale**: toggle che riascolta `chrome.tabs.onUpdated` e rilancia l'analisi su navigazione SPA (hash change).
- [ ] **Diff fra due analisi**: salvare snapshot e mostrare differenze (utile per regressioni).
- [ ] **Click-to-inspect**: dato un controlId, evidenziarlo nella pagina (`sap.ui.getCore().byId(id).$().css(...)`).

### P4 — Polish (rimanenti)
- [ ] **i18n** della UI estensione (almeno EN/IT) — `chrome.i18n` con `_locales/`.
- [ ] **Loading state** più chiaro: spinner o skeleton invece del solo testo "Analyzing...".
- [ ] **Empty states**: icone più descrittive e suggerimenti azione.
- [ ] **Tooltip** sui badge (es. spiegare "OData", "Bindings").
- [ ] **Collapsible state persistente** dentro la sessione del popup.
- [ ] **Versioning compat** dichiarato nel README (UI5 minima testata).
- [ ] **Focus visibile** sui tab (outline custom su `:focus-visible`).

### Refactor architetturale
- [ ] **Spostare `extractSAPUI5Data` in `engine.js` standalone**, iniettato via `files: ["engine.js"]` invece di `func:` (oggi viene caricato anche nel popup inutilmente perché `popup.html` lo include come `<script>`).
- [ ] **Modularizzare `popup.js`** in `render/*.js` (overview, components, odata, ...) — file ora ~900 righe.
- [ ] **Test fixture**: usare `sapui5-basic-app/` come pagina di test riproducibile + script Playwright che apre l'estensione e snapshotta l'output JSON.
- [ ] **Tipizzare con JSDoc** lo schema di `result` per autocompletamento e contratto stabile.

### Estensioni schema dati ancora da valutare

Voci dalla ricerca su docs SAP / UI5 Inspector non ancora implementate. Tutte semi-private, da pesare per costo/beneficio.

#### Framework / loader
- [ ] **Preload mode**: `sap-ui-preload`, `xx-preload`, async vs sync bootstrap.
- [ ] **CSP-compliant bootstrap** detection.

#### Component / manifest
- [ ] **`sap.ui5/extends`**: estensioni applicate (Adaptation Project / variants).
- [ ] **`sap.platform.abap` / `sap.platform.hcp`**: deployment target.
- [ ] **Diff** fra dependencies dichiarate e librerie effettivamente caricate.

#### Routing
- [ ] **History stack**: `sap.ui.core.routing.History.getInstance().aHistory` (privata) — direzione last navigation.

#### Modelli / OData
- [ ] **Count cached entities** per modello v2 (`m.oData` keys count) e v4 (`m.mContexts`).
- [ ] **Pending changes detail** v2: `m.getPendingChanges()` (sintesi).
- [ ] **Refresh interval** dei modelli OData.
- [ ] **CSRF token** presente sì/no (senza esporne il valore).
- [ ] **Headers custom** configurati su OData model.
- [ ] **Batch groups** v2: `m.getDeferredGroups?.()`.
- [ ] **i18n bundles**: per ciascun componente, leggere `comp.getModel("i18n")` e fornire conteggio chiavi + lingua corrente.

#### Controlli / View
- [ ] **UIAreas**: `getCore().getUIArea(...)` lista, root nodes, dirty state.
- [ ] **Fragment usage**: per ogni fragment XML caricato, tracciare il tipo radice.
- [ ] **Focused element**: `document.activeElement` mappato a controlId.
- [ ] **View più popolose** (top N per numero controlli).

#### EventBus / Messaging
- [ ] **EventBus subscriptions** del componente: `comp.getEventBus().mEventRegistry` (privata).
- [ ] **Global EventBus** subscriptions analoghe.
- [ ] **MessageProcessor count** registrati su Messaging.

#### FLP / shell
- [ ] **Plugin Manager**: plugin attivi nel FLP.

#### Diagnostica avanzata
- [ ] **Sync XHR detection**: contare warning di sync XHR nei log (anti-pattern UI5).
- [ ] **Flexibility / Adaptation**: `sap.ui.fl` presente? variants applicate?
- [ ] **Draft handling** v4: tabelle con `IsActiveEntity` / `HasDraftEntity`.

#### Sicurezza / config
- [ ] **`window["sap-ui-config"]`** snapshot completo (modalità, libs preload, theme roots).
- [ ] **Theme roots custom**: `getConfiguration().getThemeRoot?.()`.

> Nota: molte di queste API sono "semi-private". Strategia: provare l'API pubblica, fallback graceful, marcare con flag dedicato (come `loader._privateApi`) invece di affollare il banner errori.

---

## Riferimenti
- UI5 Inspector ufficiale (Chrome): https://chromewebstore.google.com/detail/ui5-inspector/bebecogbafbighhaildooiibipcnbngo
- Repo UI5/inspector: https://github.com/UI5/inspector
- Diagnostics window: https://sapui5.hana.ondemand.com/sdk/docs/topics/6ec18e80b0ce47f290bc2645b0cc86e6.html
- Debugging guide: https://sapui5.hana.ondemand.com/sdk/docs/topics/c9b0f8cca852443f9b8d3bf8ba5626ab.html
- Component API: https://sdk.openui5.org/api/sap.ui.core.Component
- Advanced concepts components: https://github.com/SAP-docs/sapui5/blob/main/docs/04_Essentials/advanced-concepts-for-sapui5-components-ecbc417.md
