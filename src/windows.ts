export type AppId = "files" | "terminal" | "settings" | "monitor" | "packages" | "developer" | "runtime" | "marketplace" | "ecosystem" | "experience" | "services" | "security" | "search" | "sdk" | "updates" | "control" | "assistant" | "kernel" | "nexus" | "boot" | "registry" | "devices" | "permissions" | "tasks" | "crash" | "events" | "network" | "accounts" | "storage" | "audit" | "backup" | "policy";

export type WindowOptions = {
  appId: AppId;
  title: string;
  icon: string;
  width: number;
  height: number;
  content: HTMLElement;
  state?: Partial<WindowSnapshot>;
  allowMultiple?: boolean;
  workspace?: number;
};

export type ManagedWindow = {
  id: string;
  appId: AppId;
  title: string;
  icon: string;
  element: HTMLElement;
  body: HTMLElement;
  minimized: boolean;
  maximized: boolean;
  workspace: number;
  controller?: AbortController;
};

type WindowListener = (windows: ManagedWindow[], activeId: string | null) => void;

export type WindowSnapshot = {
  appId: AppId;
  left: number;
  top: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  workspace: number;
};

export class WindowManager {
  private host: HTMLElement;
  private windows = new Map<string, ManagedWindow>();
  private zIndex = 20;
  private activeId: string | null = null;
  private listeners = new Set<WindowListener>();
  private workspace = 0;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  subscribe(listener: WindowListener) {
    this.listeners.add(listener);
    listener(this.list(), this.activeId);
    return () => this.listeners.delete(listener);
  }

  open(options: WindowOptions) {
    const existing = options.allowMultiple ? undefined : this.findByApp(options.appId);
    if (existing) {
      existing.minimized = false;
      existing.element.classList.remove("is-minimized");
      this.focus(existing.id);
      return existing;
    }

    const id = `${options.appId}-${crypto.randomUUID()}`;
    const shell = document.createElement("section");
    shell.className = "aether-window";
    shell.dataset.windowId = id;
    shell.style.width = `${options.state?.width ?? options.width}px`;
    shell.style.height = `${options.state?.height ?? options.height}px`;
    shell.style.left = `${options.state?.left ?? Math.max(32, 160 + this.windows.size * 28)}px`;
    shell.style.top = `${options.state?.top ?? Math.max(56, 86 + this.windows.size * 24)}px`;

    const chrome = document.createElement("header");
    chrome.className = "window-chrome";
    chrome.innerHTML = `
      <div class="window-title"><span>${options.icon}</span><strong>${options.title}</strong></div>
      <div class="window-controls">
        <button class="icon-btn" data-action="minimize" title="Minimize">_</button>
        <button class="icon-btn" data-action="maximize" title="Maximize">□</button>
        <button class="icon-btn danger" data-action="close" title="Close">×</button>
      </div>
    `;

    const body = document.createElement("main");
    body.className = "window-body";
    body.append(options.content);
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.title = "Resize";
    shell.append(chrome, body, resizeHandle);
    this.host.append(shell);

    const controller = new AbortController();
    const managed: ManagedWindow = {
      id,
      appId: options.appId,
      title: options.title,
      icon: options.icon,
      element: shell,
      body,
      minimized: false,
      maximized: false,
      workspace: options.state?.workspace ?? options.workspace ?? this.workspace,
      controller
    };
    this.windows.set(id, managed);
    shell.dataset.workspace = String(managed.workspace);
    if (options.state?.maximized) {
      managed.maximized = true;
      shell.classList.add("is-maximized");
    }
    if (options.state?.minimized) {
      managed.minimized = true;
      shell.classList.add("is-minimized");
    }
    this.attachChrome(managed, chrome, resizeHandle);
    this.focus(id);
    this.applyWorkspaceVisibility();
    this.emit();
    return managed;
  }

  close(id: string) {
    const win = this.windows.get(id);
    if (!win) return;
    win.element.dispatchEvent(new CustomEvent("aether:destroy"));
    win.body.dispatchEvent(new CustomEvent("aether:destroy"));
    Array.from(win.body.children).forEach((child) => child.dispatchEvent(new CustomEvent("aether:destroy")));
    if (win.body.firstElementChild && !Array.from(win.body.children).includes(win.body.firstElementChild)) {
      win.body.firstElementChild.dispatchEvent(new CustomEvent("aether:destroy"));
    }
    win.body.querySelectorAll("*").forEach((el) => el.dispatchEvent(new CustomEvent("aether:destroy")));
    win.controller?.abort();
    win.element.remove();
    this.windows.delete(id);
    if (this.activeId === id) {
      const visible = this.list().filter((candidate) => !candidate.minimized && candidate.workspace === this.workspace);
      this.activeId = visible.at(-1)?.id ?? this.list().at(-1)?.id ?? null;
      if (this.activeId) this.focus(this.activeId);
    }
    this.emit();
  }

  destroyAll() {
    Array.from(this.windows.keys()).forEach((id) => this.close(id));
  }

  dispose() {
    this.destroyAll();
    this.listeners.clear();
  }

  minimize(id: string) {
    const win = this.windows.get(id);
    if (!win) return;
    win.minimized = true;
    win.element.classList.add("is-minimized");
    if (this.activeId === id) this.activeId = null;
    this.emit();
  }

  toggleMaximize(id: string) {
    const win = this.windows.get(id);
    if (!win) return;
    win.maximized = !win.maximized;
    win.element.classList.toggle("is-maximized", win.maximized);
    this.focus(id);
    this.emit();
  }

  focus(id: string) {
    const win = this.windows.get(id);
    if (!win) return;
    this.activeId = id;
    this.zIndex += 1;
    win.minimized = false;
    win.element.classList.remove("is-minimized");
    win.element.style.zIndex = String(this.zIndex);
    this.windows.forEach((candidate) => {
      candidate.element.classList.toggle("is-active", candidate.id === id);
    });
    this.emit();
  }

  toggleApp(appId: AppId, openApp: () => ManagedWindow) {
    const win = this.findByApp(appId);
    if (!win) return openApp();
    if (win.minimized || this.activeId !== win.id) {
      this.focus(win.id);
      return win;
    }
    this.minimize(win.id);
    return win;
  }

  getActiveCount() {
    return this.list().filter((win) => !win.minimized && win.workspace === this.workspace).length;
  }

  list() {
    return Array.from(this.windows.values());
  }

  snapshot(): WindowSnapshot[] {
    return this.list().map((win) => ({
      appId: win.appId,
      left: win.element.offsetLeft,
      top: win.element.offsetTop,
      width: win.element.offsetWidth,
      height: win.element.offsetHeight,
      minimized: win.minimized,
      maximized: win.maximized,
      workspace: win.workspace
    }));
  }

  focusNext() {
    const visible = this.list().filter((win) => !win.minimized && win.workspace === this.workspace);
    if (!visible.length) return;
    const currentIndex = visible.findIndex((win) => win.id === this.activeId);
    const next = visible[(currentIndex + 1) % visible.length];
    this.focus(next.id);
  }

  restoreApp(appId: AppId) {
    const win = this.findByApp(appId);
    if (win) this.focus(win.id);
  }

  private findByApp(appId: AppId) {
    return this.list().find((win) => win.appId === appId && win.workspace === this.workspace);
  }

  switchWorkspace(workspace: number) {
    this.workspace = workspace;
    this.activeId = null;
    this.applyWorkspaceVisibility();
    this.emit();
  }

  getWorkspace() {
    return this.workspace;
  }

  moveToWorkspace(id: string, workspace: number) {
    const win = this.windows.get(id);
    if (!win) return;
    win.workspace = workspace;
    win.element.dataset.workspace = String(workspace);
    this.applyWorkspaceVisibility();
    this.emit();
  }

  tileVisible() {
    const visible = this.list().filter((win) => !win.minimized && win.workspace === this.workspace);
    if (!visible.length) return;
    const columns = visible.length === 1 ? 1 : 2;
    const rows = Math.ceil(visible.length / columns);
    visible.forEach((win, index) => {
      win.maximized = false;
      win.element.classList.remove("is-maximized");
      const column = index % columns;
      const row = Math.floor(index / columns);
      win.element.style.left = `calc(${column} * 50vw + 8px)`;
      win.element.style.top = `calc(44px + ${row} * ((100vh - 126px) / ${rows}))`;
      win.element.style.width = `calc(${100 / columns}vw - 16px)`;
      win.element.style.height = `calc((100vh - 126px) / ${rows} - 8px)`;
    });
    this.emit();
  }

  private attachChrome(win: ManagedWindow, chrome: HTMLElement, resizeHandle: HTMLElement) {
    const signal = win.controller?.signal;
    win.element.addEventListener("pointerdown", () => this.focus(win.id), { signal });
    chrome.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = button.dataset.action;
        if (action === "close") this.close(win.id);
        if (action === "minimize") this.minimize(win.id);
        if (action === "maximize") this.toggleMaximize(win.id);
      }, { signal });
    });

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    chrome.addEventListener("pointerdown", (event) => {
      if ((event.target as HTMLElement).closest("button") || win.maximized) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = win.element.offsetLeft;
      startTop = win.element.offsetTop;
      chrome.setPointerCapture(event.pointerId);
    }, { signal });

    chrome.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const nextLeft = Math.max(6, Math.min(window.innerWidth - 180, startLeft + event.clientX - startX));
      const nextTop = Math.max(44, Math.min(window.innerHeight - 100, startTop + event.clientY - startY));
      win.element.style.left = `${nextLeft}px`;
      win.element.style.top = `${nextTop}px`;
      window.dispatchEvent(new CustomEvent("aether:snap-preview", { detail: event.clientX < 24 ? "left" : event.clientX > window.innerWidth - 24 ? "right" : "" }));
    }, { signal });

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (event.clientX < 20) this.snap(win, "left");
      if (event.clientX > window.innerWidth - 20) this.snap(win, "right");
      window.dispatchEvent(new CustomEvent("aether:snap-preview", { detail: "" }));
      if (chrome.hasPointerCapture(event.pointerId)) chrome.releasePointerCapture(event.pointerId);
    };

    chrome.addEventListener("pointerup", endDrag, { signal });
    chrome.addEventListener("pointercancel", endDrag, { signal });
    chrome.addEventListener("lostpointercapture", endDrag, { signal });

    chrome.addEventListener("dblclick", () => this.toggleMaximize(win.id), { signal });

    let resizing = false;
    let startWidth = 0;
    let startHeight = 0;

    resizeHandle.addEventListener("pointerdown", (event) => {
      if (win.maximized) return;
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      startWidth = win.element.offsetWidth;
      startHeight = win.element.offsetHeight;
      resizeHandle.setPointerCapture(event.pointerId);
      this.focus(win.id);
    }, { signal });

    resizeHandle.addEventListener("pointermove", (event) => {
      if (!resizing) return;
      win.element.style.width = `${Math.max(360, startWidth + event.clientX - startX)}px`;
      win.element.style.height = `${Math.max(280, startHeight + event.clientY - startY)}px`;
      this.emit();
    }, { signal });

    const endResize = (event: PointerEvent) => {
      if (!resizing) return;
      resizing = false;
      if (resizeHandle.hasPointerCapture(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId);
      this.emit();
    };

    resizeHandle.addEventListener("pointerup", endResize, { signal });
    resizeHandle.addEventListener("pointercancel", endResize, { signal });
    resizeHandle.addEventListener("lostpointercapture", endResize, { signal });
  }

  private snap(win: ManagedWindow, side: "left" | "right") {
    win.maximized = false;
    win.element.classList.remove("is-maximized");
    win.element.style.top = "44px";
    win.element.style.height = "calc(100vh - 126px)";
    win.element.style.width = "50vw";
    win.element.style.left = side === "left" ? "0" : "50vw";
    this.emit();
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((listener) => listener(snapshot, this.activeId));
  }

  private applyWorkspaceVisibility() {
    this.windows.forEach((win) => {
      win.element.classList.toggle("is-workspace-hidden", win.workspace !== this.workspace);
      win.element.classList.toggle("is-active", win.id === this.activeId && win.workspace === this.workspace);
    });
  }
}
