import { CommandPalette } from "./commandPalette";
import { createAssistantApp } from "./assistantApp";
import { createAccountManagerApp } from "./accountManager";
import { createAuditViewerApp } from "./auditViewer";
import { createBackupManagerApp } from "./backupManager";
import { loadPersistedState, NotificationStore, savePersistedState, sendNativeNotification, ShellLogger, type PersistedState } from "./backend";
import { createBootManagerApp } from "./bootManager";
import { createControlPanelApp } from "./controlPanel";
import { createCrashReporterApp } from "./crashReporter";
import { createDeviceManagerApp } from "./deviceManager";
import { createEventViewerApp } from "./eventViewer";
import { createEcosystemHubApp } from "./ecosystemHub";
import { createAppRuntimeApp, createSandboxedRuntimeWindow } from "./appRuntime";
import { createExperienceCenterApp } from "./experienceCenter";
import { createDeveloperConsoleApp } from "./developerConsole";
import { createFileExplorerApp } from "./fileExplorer";
import { createLauncher, launcherApps } from "./launcher";
import { createKernelLabApp } from "./kernelLab";
import { createMarketplaceApp } from "./marketplace";
import { createNexusApp } from "./nexus";
import { createNetworkCenterApp } from "./networkCenter";
import { createPackageManagerApp, getPackages, loadPackages } from "./packageManager";
import { createPermissionCenterApp } from "./permissionCenter";
import { createPolicyCenterApp } from "./policyCenter";
import type { AetherAppManifest } from "./platform";
import { createRegistryEditorApp } from "./registryEditor";
import { createSdkCenterApp } from "./sdkCenter";
import { createSearchApp } from "./searchApp";
import { createSecurityCenterApp } from "./securityCenter";
import { createServiceManagerApp } from "./serviceManager";
import { createNotificationCenter, createSessionOverlay, type SessionState } from "./session";
import { type AetherSettings, createSettingsApp } from "./settings";
import { createStorageManagerApp } from "./storageManager";
import { createSystemMonitorApp } from "./systemMonitor";
import { createTaskSchedulerApp } from "./taskScheduler";
import { createTerminalApp } from "./terminal";
import { createUpdateCenterApp } from "./updateCenter";
import { type AppId, WindowManager, type WindowSnapshot } from "./windows";

const defaultSettings: AetherSettings = {
  theme: "dark",
  animations: true,
  compactDock: false,
  developerMode: false,
  performanceProfile: "Balanced",
  nativeNotifications: true,
  doNotDisturb: false
};

export class AetherDesktop {
  private root: HTMLElement;
  private windowHost: HTMLElement;
  private taskbarApps: HTMLElement;
  private clock: HTMLElement;
  private manager: WindowManager;
  private settings: AetherSettings = { ...defaultSettings };
  private session: SessionState = { userName: "matth", locked: false, lastLogin: "" };
  private persistedState: PersistedState = {};
  private notifications = new NotificationStore();
  private logger = new ShellLogger();
  private savedLayout: WindowSnapshot[] = [];
  private palette!: CommandPalette;
  private saveTimer = 0;
  private abortController = new AbortController();
  private clockTimer = 0;
  private unsubscribers: Array<() => void> = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = "aether-root";
    this.root.innerHTML = `
      <div class="wallpaper">
        <div class="boot-screen" id="boot-screen">
          <section>
            <h1>AetherOS</h1>
            <p id="boot-log">Powering shell services...</p>
            <progress value="20" max="100"></progress>
          </section>
        </div>
        <header class="top-bar">
          <button class="brand-button" id="launcher-button">AetherOS</button>
          <div class="status-cluster">
            <span id="clock">--:--</span>
            <button class="status-button" id="network">Network: Online</button>
            <button class="status-button" id="power">Battery: 86%</button>
            <button class="status-button" id="notify">Notifications <span id="notify-count">0</span></button>
            <button class="profile-button" id="profile">M</button>
          </div>
        </header>
        <main class="desktop-surface">
          <div class="desktop-icons">
            <button data-desktop-app="files"><b>▣</b><span>Files</span></button>
            <button data-desktop-app="terminal"><b>⌁</b><span>Terminal</span></button>
            <button data-desktop-app="settings"><b>⚙</b><span>Settings</span></button>
            <button data-desktop-app="marketplace"><b>◌</b><span>Market</span></button>
            <button data-desktop-app="ecosystem"><b>◎</b><span>Hub</span></button>
            <button data-desktop-app="experience"><b>⊞</b><span>Shell</span></button>
            <button data-desktop-app="search"><b>⌕</b><span>Search</span></button>
            <button data-desktop-app="assistant"><b>✦</b><span>Assistant</span></button>
            <button data-desktop-app="kernel"><b>◇</b><span>Kernel</span></button>
            <button data-desktop-app="nexus"><b>✧</b><span>Nexus</span></button>
          </div>
          <div id="window-host" class="window-host"></div>
        </main>
        <div class="workspace-overview" id="workspace-overview"></div>
        <footer class="dock">
          <button class="dock-launcher" id="dock-launcher">⊞</button>
          <div class="workspace-strip">
            <button class="workspace-btn selected" data-workspace="0">1</button>
            <button class="workspace-btn" data-workspace="1">2</button>
            <button class="workspace-btn" data-workspace="2">3</button>
            <button class="workspace-btn" data-workspace="3">4</button>
            <button class="workspace-btn" id="tile-windows">Tile</button>
            <button class="workspace-btn" id="overview-windows">Overview</button>
          </div>
          <div class="system-tray">
            <button class="tray-btn" data-tray="audio">Audio</button>
            <button class="tray-btn" data-tray="shield">Shield</button>
            <button class="tray-btn" data-tray="pkgd">Pkgd</button>
            <button class="tray-btn" data-tray="hidden">⌃</button>
          </div>
          <div class="dock-apps"></div>
        </footer>
        <div class="desktop-menu" id="desktop-menu"></div>
        <div class="taskbar-menu" id="taskbar-menu"></div>
        <div class="taskbar-preview" id="taskbar-preview"></div>
        <div class="snap-preview" id="snap-preview"></div>
      </div>
    `;

    this.windowHost = this.root.querySelector("#window-host") as HTMLElement;
    this.taskbarApps = this.root.querySelector(".dock-apps") as HTMLElement;
    this.clock = this.root.querySelector("#clock") as HTMLElement;
    this.manager = new WindowManager(this.windowHost);
    this.bindShell();
    this.renderDock();
    this.applySettings();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    this.updateClock();
    this.bootstrap();
  }

  openApp(appId: AppId | string) {
    const normalized = this.normalizeAppId(appId);
    if (!normalized) return;
    const app = launcherApps.find((candidate) => candidate.id === normalized);
    if (!app) return;
    this.manager.toggleApp(normalized, () => {
      this.logger.log("shell", `Opening ${app.name}`);
      this.notifications.add("App opened", app.name);
      return this.manager.open({
      appId: normalized,
      title: app.name,
      icon: app.icon,
      width: ["monitor", "developer", "settings", "marketplace", "ecosystem", "experience", "kernel", "nexus", "boot", "registry", "devices", "permissions", "tasks", "crash", "events", "network", "accounts", "storage", "audit", "backup", "policy"].includes(normalized) ? 900 : 720,
      height: normalized === "terminal" ? 460 : normalized === "marketplace" || normalized === "ecosystem" || normalized === "experience" || normalized === "kernel" || normalized === "nexus" || normalized === "registry" || normalized === "devices" ? 600 : 520,
      content: this.createAppContent(normalized),
      state: this.savedLayout.find((win) => win.appId === normalized)
      });
    });
    this.queueSave();
  }

  launchRuntimeApp(app: AetherAppManifest) {
    this.manager.open({
      appId: "runtime",
      title: app.name,
      icon: "▤",
      width: 620,
      height: 420,
      content: createSandboxedRuntimeWindow(app),
      allowMultiple: true
    });
    this.notify("Sandbox app launched", app.name, "success");
  }

  setTheme(theme: "dark" | "light") {
    this.updateSettings({ theme });
  }

  private bindShell() {
    const launcher = createLauncher({
      openApp: (appId) => this.openApp(appId),
      lockSession: () => this.lockSession(),
      restartShell: () => this.restartShell(),
      sleepShell: () => this.sleepShell(),
      shutdownShell: () => this.shutdownShell()
    });
    const notificationCenter = createNotificationCenter({
      getNotifications: () => this.notifications.list(),
      getQuickSettings: () => ({
        theme: this.settings.theme,
        doNotDisturb: this.settings.doNotDisturb,
        compactDock: this.settings.compactDock,
        performanceProfile: this.settings.performanceProfile
      }),
      toggleTheme: () => this.setTheme(this.settings.theme === "dark" ? "light" : "dark"),
      toggleDoNotDisturb: () => this.updateSettings({ doNotDisturb: !this.settings.doNotDisturb }),
      toggleCompactDock: () => this.updateSettings({ compactDock: !this.settings.compactDock }),
      openApp: (app) => this.openApp(app),
      lockSession: () => this.lockSession()
    });
    const sessionOverlay = createSessionOverlay({
      session: this.session,
      updateSession: (patch) => this.updateSession(patch),
      notify: (title, body, tone) => this.notify(title, body, tone)
    });
    document.body.append(launcher.element);
    document.body.append(notificationCenter.element, sessionOverlay.element);
    this.root.querySelector("#launcher-button")?.addEventListener("click", launcher.toggle);
    this.root.querySelector("#dock-launcher")?.addEventListener("click", launcher.toggle);
    this.root.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => {
      button.addEventListener("click", () => {
        const workspace = Number(button.dataset.workspace ?? 0);
        this.manager.switchWorkspace(workspace);
        this.root.querySelectorAll(".workspace-btn").forEach((candidate) => candidate.classList.remove("selected"));
        button.classList.add("selected");
        this.notify("Workspace switched", `Workspace ${workspace + 1}`);
      });
    });
    this.root.querySelector("#tile-windows")?.addEventListener("click", () => {
      this.manager.tileVisible();
      this.notify("Windows tiled", `Workspace ${this.manager.getWorkspace() + 1}`, "success");
    });
    this.root.querySelector("#overview-windows")?.addEventListener("click", () => this.showWorkspaceOverview());
    this.root.querySelector(".desktop-surface")?.addEventListener("contextmenu", (event) => {
      if ((event.target as HTMLElement).closest(".aether-window")) return;
      event.preventDefault();
      this.showDesktopMenu(event as MouseEvent);
    });
    this.root.querySelectorAll<HTMLElement>("[data-desktop-app]").forEach((button) => {
      button.addEventListener("dblclick", () => this.openApp(button.dataset.desktopApp ?? ""));
      button.addEventListener("click", () => button.classList.toggle("selected"));
    });
    this.root.querySelector("#network")?.addEventListener("click", notificationCenter.toggle);
    this.root.querySelector("#power")?.addEventListener("click", notificationCenter.toggle);
    this.root.querySelector("#notify")?.addEventListener("click", notificationCenter.toggle);
    this.root.querySelector("#profile")?.addEventListener("click", () => this.lockSession());
    this.root.querySelectorAll<HTMLButtonElement>("[data-tray]").forEach((button) => {
      button.addEventListener("click", () => this.showTrayMenu(button));
    });
    this.unsubscribers.push(this.notifications.subscribe((items) => {
      const count = this.root.querySelector("#notify-count");
      if (count) count.textContent = String(items.length);
      notificationCenter.render();
      this.queueSave();
    }));

    this.unsubscribers.push(this.manager.subscribe(() => {
      this.renderDock();
      this.queueSave();
    }));
    this.palette = new CommandPalette([
      { label: "Open Terminal", keywords: "shell command", run: () => this.openApp("terminal") },
      { label: "Open Settings", keywords: "preferences appearance", run: () => this.openApp("settings") },
      { label: "Open File Explorer", keywords: "files folders", run: () => this.openApp("files") },
      { label: "Open System Monitor", keywords: "cpu ram processes", run: () => this.openApp("monitor") },
      { label: "Open Package Manager", keywords: "aetherpkg install remove", run: () => this.openApp("packages") },
      { label: "Open Marketplace", keywords: "store ecosystem apps extensions widgets verified marketplace", run: () => this.openApp("marketplace") },
      { label: "Open Ecosystem Hub", keywords: "ecosystem hub store protocols publishing extension points reviews developer app economy", run: () => this.openApp("ecosystem") },
      { label: "Open Experience Center", keywords: "windows familiar better start taskbar widgets snap shortcuts default apps shell experience", run: () => this.openApp("experience") },
      { label: "Open Developer Console", keywords: "logs diagnostics backend", run: () => this.openApp("developer") },
      { label: "Open App Runtime", keywords: "manifest sandbox store third party", run: () => this.openApp("runtime") },
      { label: "Open Service Manager", keywords: "services boot logs daemon", run: () => this.openApp("services") },
      { label: "Open Security Center", keywords: "virus identity permissions shield users", run: () => this.openApp("security") },
      { label: "Open System Search", keywords: "spotlight index files apps commands", run: () => this.openApp("search") },
      { label: "Open Aether SDK", keywords: "sdk scaffolder cli app template", run: () => this.openApp("sdk") },
      { label: "Open Update Center", keywords: "updates rollback recovery channel", run: () => this.openApp("updates") },
      { label: "Open Control Panel", keywords: "devices firewall environment startup recovery advanced", run: () => this.openApp("control") },
      { label: "Open Aether Assistant", keywords: "assistant helper install demo app gaming files yesterday", run: () => this.openApp("assistant") },
      { label: "Open Kernel Lab", keywords: "single address space sasos protection domain hypervisor compatibility formal verification semantic filesystem database time travel deterministic replay capability object tokens confused deputy zero copy ipc stream scheduler cfs mlfq ebpf zram vfs namespaces isolation hot swap live patch gpu fpga osdev kernel", run: () => this.openApp("kernel") },
      { label: "Open Aether Nexus", keywords: "nexus command center automation self healing system graph command mesh time ribbon workspace choreography crazy modes hyperflow repair", run: () => this.openApp("nexus") },
      { label: "Open Boot Manager", keywords: "advanced startup normal recovery diagnostic safe mode last known good boot target", run: () => this.openApp("boot") },
      { label: "Open Aether Registry", keywords: "registry editor hive hklm hkcu kernel services drivers user shell config", run: () => this.openApp("registry") },
      { label: "Open Device Manager", keywords: "device manager driver rollback hardware matching blocked signature warnings buses", run: () => this.openApp("devices") },
      { label: "Open Permission Center", keywords: "permission prompt capability grant approve deny filesystem notifications terminal packages network settings", run: () => this.openApp("permissions") },
      { label: "Open Task Scheduler", keywords: "task scheduler login interval event idle capability token", run: () => this.openApp("tasks") },
      { label: "Open Crash Reporter", keywords: "crash bundle logs active windows service state recovery report replay metadata", run: () => this.openApp("crash") },
      { label: "Open Event Viewer", keywords: "event bus services packages files recovery scans notifications stream logs", run: () => this.openApp("events") },
      { label: "Open Network Center", keywords: "network firewall vpn dns ethernet wifi profile secure dns", run: () => this.openApp("network") },
      { label: "Open Account Manager", keywords: "accounts users auth pin password elevation session encrypted profile", run: () => this.openApp("accounts") },
      { label: "Open Storage Manager", keywords: "storage volumes quotas cleanup trim cache encryption disk", run: () => this.openApp("storage") },
      { label: "Open Audit Viewer", keywords: "audit auth admin policy network storage backup log export", run: () => this.openApp("audit") },
      { label: "Open Backup Manager", keywords: "backup restore retention encrypted plan recovery sync", run: () => this.openApp("backup") },
      { label: "Open Policy Center", keywords: "policy enforce rules compliance account network driver update storage", run: () => this.openApp("policy") },
      { label: "Open Native Settings", keywords: "windows better settings system privacy storage apps accounts shortcuts", run: () => this.openApp("settings") },
      { label: "Keyboard Shortcuts", keywords: "hotkeys commands keystrokes accelerators", run: () => this.openApp("settings") },
      { label: "Tile Windows", keywords: "compositor tiling workspace snap", run: () => this.manager.tileVisible() },
      { label: "Workspace Overview", keywords: "mission control all windows templates", run: () => this.showWorkspaceOverview() },
      { label: "Toggle Theme", keywords: "dark light appearance", run: () => this.setTheme(this.settings.theme === "dark" ? "light" : "dark") },
      { label: "Lock Session", keywords: "security login", run: () => this.lockSession() },
      { label: "Search Packages", keywords: getPackages().map((pkg) => pkg.name).join(" "), run: () => this.openApp("packages") },
      { label: "Show About", keywords: "version info", run: () => this.showToast("AetherOS ecosystem foundation: marketplace, native settings, runtime, SDK, shield, updates, and services.") }
    ]);

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && (key === "k" || (event.shiftKey && key === "p"))) {
        event.preventDefault();
        this.palette.open();
      }
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        launcher.toggle();
      }
      if (event.ctrlKey && key === ",") {
        event.preventDefault();
        this.openApp("settings");
      }
      if (event.ctrlKey && event.shiftKey && key === "t") {
        event.preventDefault();
        this.openApp("terminal");
      }
      if (event.ctrlKey && event.shiftKey && key === "f") {
        event.preventDefault();
        this.openApp("files");
      }
      if (event.ctrlKey && event.shiftKey && key === "m") {
        event.preventDefault();
        this.openApp("marketplace");
      }
      if (event.ctrlKey && event.shiftKey && key === "h") {
        event.preventDefault();
        this.openApp("ecosystem");
      }
      if (event.ctrlKey && event.shiftKey && key === "e") {
        event.preventDefault();
        this.openApp("experience");
      }
      if (event.ctrlKey && event.shiftKey && key === "s") {
        event.preventDefault();
        this.openApp("search");
      }
      if (event.ctrlKey && event.shiftKey && key === "a") {
        event.preventDefault();
        this.openApp("assistant");
      }
      if (event.ctrlKey && event.shiftKey && key === "x") {
        event.preventDefault();
        this.openApp("nexus");
      }
      if (event.altKey && event.key === "Tab") {
        event.preventDefault();
        this.manager.focusNext();
      }
      if (event.ctrlKey && event.altKey && key === "l") {
        event.preventDefault();
        this.lockSession();
      }
      if (event.ctrlKey && event.altKey && key === "o") {
        event.preventDefault();
        this.showWorkspaceOverview();
      }
      if (event.ctrlKey && event.altKey && key === "t") {
        event.preventDefault();
        this.manager.tileVisible();
      }
      if (event.ctrlKey && event.altKey && key === "m") {
        event.preventDefault();
        this.openApp("monitor");
      }
      if (event.ctrlKey && event.altKey && key === "s") {
        event.preventDefault();
        this.openApp("security");
      }
      if (event.ctrlKey && event.altKey && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        this.manager.switchWorkspace(Number(event.key) - 1);
      }
      if (event.key === "Escape") {
        this.root.querySelector("#workspace-overview")?.classList.remove("visible");
        this.hideMenus();
      }
    }, { signal: this.abortController.signal });
    window.addEventListener("message", (event) => {
      const isSameOrigin = event.origin === window.location.origin;
      const isSandboxedIframe = event.origin === "null" && event.source !== null &&
        Array.from(document.querySelectorAll(".runtime-window iframe")).some((iframe) => (iframe as HTMLIFrameElement).contentWindow === event.source);
      if (!isSameOrigin && !isSandboxedIframe) return;
      if (typeof event.data !== "object" || event.data === null) return;
      if (event.data.type !== "aether-notify") return;
      if (typeof event.data.body !== "string") return;
      const body = event.data.body.slice(0, 500);
      this.notify("Runtime app", body, "success");
    }, { signal: this.abortController.signal });
    window.addEventListener("aether:snap-preview", ((event: CustomEvent<string>) => {
      const preview = this.root.querySelector<HTMLElement>("#snap-preview");
      if (!preview) return;
      const side = event.detail;
      preview.classList.toggle("visible", side === "left" || side === "right");
      preview.style.left = side === "right" ? "50vw" : "0";
    }) as EventListener, { signal: this.abortController.signal });
  }

  private renderDock() {
    const windows = this.manager.list();
    this.taskbarApps.innerHTML = launcherApps.map((app) => {
      const win = windows.find((candidate) => candidate.appId === app.id);
      const workspaceWins = windows.filter((candidate) => candidate.appId === app.id && candidate.workspace === this.manager.getWorkspace());
      return `<button class="dock-icon ${workspaceWins.length ? "running" : ""}" data-app="${app.id}" title="${app.name}"><span>${app.icon}</span>${workspaceWins.length ? `<em>${workspaceWins.length}</em>` : ""}</button>`;
    }).join("");
    this.taskbarApps.querySelectorAll<HTMLButtonElement>("[data-app]").forEach((button) => {
      button.addEventListener("click", () => this.openApp(button.dataset.app ?? ""));
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.showTaskbarMenu(event, button.dataset.app ?? "");
      });
      button.addEventListener("mouseenter", () => this.showTaskbarPreview(button, button.dataset.app ?? ""));
      button.addEventListener("mouseleave", () => this.hideTaskbarPreview());
    });
  }

  private createAppContent(appId: AppId) {
    if (appId === "files") return createFileExplorerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "terminal") return createTerminalApp({ openApp: (app) => this.openApp(app), setTheme: (theme) => this.setTheme(theme), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "settings") return createSettingsApp({ getSettings: () => this.settings, updateSettings: (patch) => this.updateSettings(patch), lockSession: () => this.lockSession(), openApp: (app) => this.openApp(app) });
    if (appId === "monitor") return createSystemMonitorApp(this.manager);
    if (appId === "developer") return createDeveloperConsoleApp({ logger: this.logger, windowManager: this.manager, getState: () => this.collectState() });
    if (appId === "runtime") return createAppRuntimeApp({ launchRuntimeApp: (app) => this.launchRuntimeApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "marketplace") return createMarketplaceApp({ openApp: (app) => this.openApp(app), launchRuntimeApp: (app) => this.launchRuntimeApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "ecosystem") return createEcosystemHubApp({ openApp: (app) => this.openApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "experience") return createExperienceCenterApp({ openApp: (app) => this.openApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "services") return createServiceManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "security") return createSecurityCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "search") return createSearchApp({ execute: (action) => this.executeSearchAction(action), log: (source, message) => this.logger.log(source, message) });
    if (appId === "sdk") return createSdkCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "updates") return createUpdateCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "control") return createControlPanelApp({ openApp: (app) => this.openApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "boot") return createBootManagerApp({ openApp: (app) => this.openApp(app), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "registry") return createRegistryEditorApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "devices") return createDeviceManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "permissions") return createPermissionCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "tasks") return createTaskSchedulerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "crash") return createCrashReporterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "events") return createEventViewerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "network") return createNetworkCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "accounts") return createAccountManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "storage") return createStorageManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "audit") return createAuditViewerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "backup") return createBackupManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "policy") return createPolicyCenterApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "assistant") return createAssistantApp({ openApp: (app) => this.openApp(app), updateSettings: (patch) => this.updateSettings(patch), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "kernel") return createKernelLabApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
    if (appId === "nexus") return createNexusApp({ openApp: (app) => this.openApp(app), updateSettings: (patch) => this.updateSettings(patch), notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message), windowManager: this.manager });
    return createPackageManagerApp({ notify: (title, body, tone) => this.notify(title, body, tone), log: (source, message) => this.logger.log(source, message) });
  }

  private updateSettings(patch: Partial<AetherSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.applySettings();
    this.logger.log("settings", `Updated ${Object.keys(patch).join(", ")}`);
    this.notifications.add("Setting changed", Object.keys(patch).join(", "), "success");
    this.showToast(`Updated ${Object.keys(patch).join(", ")}.`);
    this.queueSave();
  }

  private applySettings() {
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.dataset.animations = String(this.settings.animations);
    this.root.classList.toggle("compact-dock", this.settings.compactDock);
    this.root.classList.toggle("developer-mode", this.settings.developerMode);
    this.root.dataset.profile = this.settings.performanceProfile;
  }

  private updateClock() {
    this.clock.textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  private normalizeAppId(appId: AppId | string): AppId | null {
    const value = appId.toLowerCase();
    if (value.includes("file")) return "files";
    if (value.includes("term")) return "terminal";
    if (value.includes("setting")) return "settings";
    if (value.includes("monitor")) return "monitor";
    if (value.includes("package") || value.includes("pkg")) return "packages";
    if (value.includes("ecosystem hub") || value === "ecosystem" || value.includes("app economy") || value.includes("publishing")) return "ecosystem";
    if (value.includes("experience") || value.includes("start menu") || value.includes("taskbar") || value.includes("windows familiar") || value.includes("snap layout") || value.includes("widgets")) return "experience";
    if (value.includes("market") || value.includes("store")) return "marketplace";
    if (value.includes("runtime")) return "runtime";
    if (value.includes("service")) return "services";
    if (value.includes("security") || value.includes("virus") || value.includes("shield")) return "security";
    if (value.includes("search")) return "search";
    if (value.includes("sdk")) return "sdk";
    if (value.includes("update")) return "updates";
    if (value.includes("driver manager") || value.includes("device manager") || value.includes("hardware") || value.includes("blocked driver")) return "devices";
    if (value.includes("control") || value.includes("firewall")) return "control";
    if (value.includes("boot") || value.includes("startup target") || value.includes("safe mode") || value.includes("last known good")) return "boot";
    if (value.includes("registry") || value.includes("hive") || value.includes("hklm") || value.includes("hkcu")) return "registry";
    if (value.includes("permission") || value.includes("capability grant") || value.includes("approve")) return "permissions";
    if (value.includes("task scheduler") || value.includes("scheduled task") || value.includes("run at login") || value.includes("idle")) return "tasks";
    if (value.includes("crash") || value.includes("bundle") || value.includes("replay metadata")) return "crash";
    if (value.includes("event") || value.includes("event bus") || value.includes("event viewer")) return "events";
    if (value.includes("network") || value.includes("firewall") || value.includes("vpn") || value.includes("dns") || value.includes("wifi")) return "network";
    if (value.includes("account") || value.includes("user") || value.includes("pin") || value.includes("elevation")) return "accounts";
    if (value.includes("storage") || value.includes("volume") || value.includes("quota") || value.includes("disk") || value.includes("cleanup")) return "storage";
    if (value.includes("audit") || value.includes("compliance")) return "audit";
    if (value.includes("backup") || value.includes("restore plan") || value.includes("retention")) return "backup";
    if (value.includes("policy") || value.includes("enforce") || value.includes("rule")) return "policy";
    if (value.includes("assistant") || value.includes("aether helper")) return "assistant";
    if (value.includes("nexus") || value.includes("automation") || value.includes("self-heal") || value.includes("command center") || value.includes("command mesh") || value.includes("time ribbon") || value.includes("hyperflow") || value.includes("choreography")) return "nexus";
    if (value.includes("kernel") || value.includes("scheduler") || value.includes("ebpf") || value.includes("zram") || value.includes("namespace") || value.includes("vfs") || value.includes("capability") || value.includes("ipc") || value.includes("stream") || value.includes("hot") || value.includes("gpu") || value.includes("fpga") || value.includes("sasos") || value.includes("hypervisor") || value.includes("formal") || value.includes("semantic") || value.includes("replay")) return "kernel";
    return launcherApps.some((app) => app.id === value) ? value as AppId : null;
  }

  private showToast(message: string) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 2400);
  }

  private async bootstrap() {
    this.persistedState = await loadPersistedState();
    this.settings = { ...this.settings, ...(this.persistedState.settings as Partial<AetherSettings> ?? {}) };
    this.session = { ...this.session, ...(this.persistedState.session as Partial<SessionState> ?? {}) };
    this.savedLayout = (this.persistedState.windowLayout ?? []) as unknown as WindowSnapshot[];
    this.notifications.setInitial(this.persistedState.notifications ?? []);
    await loadPackages();
    this.applySettings();
    this.logger.log("session", "Restored persisted shell state");
    this.notifications.add("Session restored", "Settings, package registry, and window layout loaded.", "success");
    if (this.savedLayout.length) {
      this.savedLayout.filter((win) => !win.minimized).forEach((win) => this.openApp(win.appId));
    } else {
      this.openApp("files");
      this.openApp("terminal");
    }
    this.runBootSequence();
  }

  private notify(title: string, body: string, tone: "info" | "success" | "warning" = "info") {
    this.notifications.add(title, body, tone);
    this.showToast(`${title}: ${body}`);
    if (!this.settings.doNotDisturb) {
      sendNativeNotification(title, body, this.settings.nativeNotifications).catch(() => undefined);
    }
  }

  private lockSession() {
    this.updateSession({ locked: true });
    this.notify("Session locked", "AetherOS is waiting at the lock screen.", "warning");
  }

  private updateSession(patch: Partial<SessionState>) {
    this.session = { ...this.session, ...patch };
    document.querySelector(".lock-overlay")?.classList.toggle("visible", this.session.locked);
    this.logger.log("session", `Session ${this.session.locked ? "locked" : "unlocked"}`);
    this.queueSave();
  }

  private collectState(): PersistedState {
    return {
      settings: this.settings as unknown as Record<string, unknown>,
      session: this.session as unknown as Record<string, unknown>,
      windowLayout: this.manager.snapshot() as unknown as Array<Record<string, unknown>>,
      notifications: this.notifications.list()
    };
  }

  private executeSearchAction(action: string) {
    if (action === "lock") {
      this.lockSession();
      return;
    }
    if (action.startsWith("runtime:")) {
      this.openApp("runtime");
      return;
    }
    this.openApp(action);
  }

  private queueSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const state = this.collectState();
      this.persistedState = state;
      savePersistedState(state).catch((error) => this.logger.log("state", String(error)));
    }, 350);
  }

  private runBootSequence() {
    const boot = this.root.querySelector<HTMLElement>("#boot-screen");
    const log = this.root.querySelector<HTMLElement>("#boot-log");
    const progress = this.root.querySelector<HTMLProgressElement>("#boot-screen progress");
    const steps = ["Starting service manager", "Loading app manifests", "Building search index bridge", "Restoring startup apps", "AetherOS ready"];
    steps.forEach((step, index) => {
      window.setTimeout(() => {
        if (log) log.textContent = step;
        if (progress) progress.value = 20 + index * 20;
        this.logger.log("boot", step);
        if (index === steps.length - 1) boot?.classList.add("hidden");
      }, 250 + index * 360);
    });
  }

  private showWorkspaceOverview() {
    const overview = this.root.querySelector<HTMLElement>("#workspace-overview");
    if (!overview) return;
    const windows = this.manager.list();
    overview.innerHTML = `
      <section>
        <div class="app-toolbar">
          <div>
            <h2>Workspace Overview</h2>
            <p>Mission Control view with all windows, workspace moves, names, and templates</p>
          </div>
          <button class="secondary-btn" data-close>Close</button>
        </div>
        <div class="workspace-template-row">
          <button class="secondary-btn" data-template="Focus">Focus Template</button>
          <button class="secondary-btn" data-template="Development">Development Template</button>
          <button class="secondary-btn" data-template="Operations">Operations Template</button>
        </div>
        <div class="overview-grid">
          ${[0, 1, 2, 3].map((workspace) => `
            <article class="details-panel">
              <h3>Workspace ${workspace + 1}</h3>
              ${windows.filter((win) => win.workspace === workspace).map((win) => `
                <div class="overview-window">
                  <strong>${win.icon} ${win.title}</strong>
                  <div class="button-row">
                    ${[0, 1, 2, 3].filter((target) => target !== workspace).map((target) => `<button class="secondary-btn" data-window="${win.id}" data-move="${target}">Move ${target + 1}</button>`).join("")}
                  </div>
                </div>
              `).join("") || `<p class="small-note">No windows.</p>`}
            </article>
          `).join("")}
        </div>
      </section>
    `;
    overview.classList.add("visible");
    overview.querySelector("[data-close]")?.addEventListener("click", () => overview.classList.remove("visible"));
    overview.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => button.addEventListener("click", () => {
      this.manager.moveToWorkspace(button.dataset.window ?? "", Number(button.dataset.move ?? 0));
      this.showWorkspaceOverview();
    }));
    overview.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((button) => button.addEventListener("click", () => {
      this.notify("Workspace template saved", button.dataset.template ?? "Template", "success");
    }));
  }

  private showDesktopMenu(event: MouseEvent) {
    const menu = this.root.querySelector<HTMLElement>("#desktop-menu");
    if (!menu) return;
    menu.innerHTML = `
      <button data-action="new-folder">New folder</button>
      <button data-action="new-file">New file</button>
      <button data-action="wallpaper">Change wallpaper</button>
      <button data-action="display">Display settings</button>
      <button data-action="sort">Sort icons</button>
      <button data-action="refresh">Refresh shell</button>
    `;
    this.positionMenu(menu, event.clientX, event.clientY);
    menu.querySelector('[data-action="new-folder"]')?.addEventListener("click", () => this.notify("Desktop folder created", "New Folder added to Desktop.", "success"));
    menu.querySelector('[data-action="new-file"]')?.addEventListener("click", () => this.notify("Desktop file created", "New File.txt added to Desktop.", "success"));
    menu.querySelector('[data-action="wallpaper"]')?.addEventListener("click", () => {
      this.root.classList.toggle("alt-wallpaper");
      this.notify("Wallpaper changed", "Aether wallpaper profile toggled.", "success");
    });
    menu.querySelector('[data-action="display"]')?.addEventListener("click", () => this.openApp("settings"));
    menu.querySelector('[data-action="sort"]')?.addEventListener("click", () => this.notify("Desktop sorted", "Icons sorted by name.", "success"));
    menu.querySelector('[data-action="refresh"]')?.addEventListener("click", () => this.restartShell());
    window.setTimeout(() => window.addEventListener("click", this.hideMenusOnce, { once: true }), 0);
  }

  private showTaskbarMenu(event: MouseEvent, appId: string) {
    const menu = this.root.querySelector<HTMLElement>("#taskbar-menu");
    const app = launcherApps.find((candidate) => candidate.id === appId);
    if (!menu || !app) return;
    menu.innerHTML = `
      <button data-action="open">Open ${app.name}</button>
      <button data-action="pin">Pin / unpin</button>
      <button data-action="preview">Show preview</button>
      <button data-action="settings">App settings</button>
      <button data-action="close">Close menu</button>
    `;
    this.positionMenu(menu, event.clientX, event.clientY);
    menu.querySelector('[data-action="open"]')?.addEventListener("click", () => this.openApp(appId));
    menu.querySelector('[data-action="pin"]')?.addEventListener("click", () => this.notify("Taskbar pin changed", app.name, "success"));
    menu.querySelector('[data-action="preview"]')?.addEventListener("click", () => this.showTaskbarPreview(event.currentTarget as HTMLElement, appId));
    menu.querySelector('[data-action="settings"]')?.addEventListener("click", () => this.openApp("settings"));
    menu.querySelector('[data-action="close"]')?.addEventListener("click", () => this.hideMenus());
    window.setTimeout(() => window.addEventListener("click", this.hideMenusOnce, { once: true }), 0);
  }

  private showTaskbarPreview(button: HTMLElement, appId: string) {
    const preview = this.root.querySelector<HTMLElement>("#taskbar-preview");
    const app = launcherApps.find((candidate) => candidate.id === appId);
    if (!preview || !app) return;
    const windows = this.manager.list().filter((win) => win.appId === appId && win.workspace === this.manager.getWorkspace());
    const rect = button.getBoundingClientRect();
    preview.innerHTML = `
      <strong>${app.icon} ${app.name}</strong>
      ${windows.map((win) => `<button data-window="${win.id}">${win.title}<span>${win.minimized ? "Minimized" : "Running"}</span></button>`).join("") || `<p class="small-note">Pinned app. No active window.</p>`}
    `;
    preview.style.left = `${Math.min(window.innerWidth - 260, Math.max(8, rect.left - 90))}px`;
    preview.style.top = `${Math.max(48, rect.top - 146)}px`;
    preview.classList.add("visible");
    preview.querySelectorAll<HTMLButtonElement>("[data-window]").forEach((item) => item.addEventListener("click", () => this.manager.focus(item.dataset.window ?? "")));
  }

  private hideTaskbarPreview() {
    this.root.querySelector("#taskbar-preview")?.classList.remove("visible");
  }

  private showTrayMenu(button: HTMLElement) {
    const label = button.dataset.tray ?? "system";
    const menu = this.root.querySelector<HTMLElement>("#taskbar-menu");
    if (!menu) return;
    menu.innerHTML = `
      <button data-action="audio">Volume mixer</button>
      <button data-action="network">Network controls</button>
      <button data-action="power">Power profile</button>
      <button data-action="hidden">Hidden tray icons</button>
      <button data-action="app">Open related app</button>
    `;
    const rect = button.getBoundingClientRect();
    this.positionMenu(menu, rect.left, rect.top - 178);
    menu.querySelector('[data-action="audio"]')?.addEventListener("click", () => this.openApp("settings"));
    menu.querySelector('[data-action="network"]')?.addEventListener("click", () => this.notify("Network", "Stable LAN profile active."));
    menu.querySelector('[data-action="power"]')?.addEventListener("click", () => this.updateSettings({ performanceProfile: "Balanced" }));
    menu.querySelector('[data-action="hidden"]')?.addEventListener("click", () => this.notify("Hidden tray", "Aether Sync, Indexer, and Runtime Guard are running."));
    menu.querySelector('[data-action="app"]')?.addEventListener("click", () => this.openApp(label === "shield" ? "security" : label === "pkgd" ? "packages" : "settings"));
    window.setTimeout(() => window.addEventListener("click", this.hideMenusOnce, { once: true }), 0);
  }

  private positionMenu(menu: HTMLElement, x: number, y: number) {
    this.hideMenus();
    menu.style.left = `${Math.min(window.innerWidth - 210, Math.max(8, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 250, Math.max(48, y))}px`;
    menu.classList.add("visible");
  }

  private hideMenusOnce = () => this.hideMenus();

  private hideMenus() {
    this.root.querySelector("#desktop-menu")?.classList.remove("visible");
    this.root.querySelector("#taskbar-menu")?.classList.remove("visible");
    this.hideTaskbarPreview();
  }

  private restartShell() {
    this.notify("Shell restarted", "AetherOS refreshed windows, dock, and boot services.", "success");
    this.manager.destroyAll();
    this.renderDock();
    this.queueSave();
  }

  private sleepShell() {
    this.notify("Sleep mode", "Shell dimmed and background work paused in mock mode.", "warning");
  }

  private shutdownShell() {
    this.notify("Shutdown mock", "AetherOS would now close the shell session.", "warning");
  }

  dispose() {
    window.clearInterval(this.clockTimer);
    window.clearTimeout(this.saveTimer);
    this.abortController.abort();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.manager.dispose();
  }

  destroy() {
    this.dispose();
  }
}
