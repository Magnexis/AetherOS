export async function invokeCommand<T>(command: string, args?: Record<string, unknown>, fallback?: () => T | Promise<T>): Promise<T> {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("Invalid IPC command name");
  }
  if (args && typeof args === "object") {
    for (const key of ["path", "from", "to", "packagePath"]) {
      const val = args[key];
      if (typeof val === "string" && (val.includes("..") || val.includes("\0"))) {
        if (fallback) return fallback();
        throw new Error(`Invalid IPC path argument (${key}): traversal blocked`);
      }
    }
  }
  try {
    const api = await import("@tauri-apps/api/core");
    return await api.invoke<T>(command, args);
  } catch (error) {
    if (fallback) return fallback();
    throw error;
  }
}

export type PersistedState = {
  settings?: Record<string, unknown>;
  session?: Record<string, unknown>;
  windowLayout?: Array<Record<string, unknown>>;
  notifications?: AetherNotification[];
};

export async function loadPersistedState(): Promise<PersistedState> {
  return invokeCommand<PersistedState>("load_state", undefined, () => {
    const stored = localStorage.getItem("aether-state");
    if (!stored) return {};
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem("aether-state");
      return {};
    }
  });
}

export async function savePersistedState(state: PersistedState) {
  return invokeCommand<void>("save_state", { state }, () => {
    localStorage.setItem("aether-state", JSON.stringify(state));
  });
}

export async function sendNativeNotification(title: string, body: string, enabled = true) {
  if (!enabled || typeof Notification === "undefined") return "Native notifications disabled.";
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return "Native notification sent.";
  }
  return "Native notification permission denied.";
}

export type AetherNotification = {
  id: string;
  title: string;
  body: string;
  time: string;
  tone: "info" | "success" | "warning";
};

export class NotificationStore {
  private notifications: AetherNotification[] = [];
  private listeners = new Set<(notifications: AetherNotification[]) => void>();

  setInitial(notifications: AetherNotification[]) {
    this.notifications = notifications.slice(0, 30);
    this.emit();
  }

  add(title: string, body: string, tone: AetherNotification["tone"] = "info") {
    const notification = {
      id: crypto.randomUUID(),
      title,
      body,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      tone
    };
    this.notifications = [notification, ...this.notifications].slice(0, 30);
    this.emit();
    return notification;
  }

  list() {
    return [...this.notifications];
  }

  subscribe(listener: (notifications: AetherNotification[]) => void) {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export type ShellLog = {
  id: string;
  time: string;
  source: string;
  message: string;
};

export class ShellLogger {
  private logs: ShellLog[] = [];
  private listeners = new Set<(logs: ShellLog[]) => void>();

  log(source: string, message: string) {
    this.logs = [{
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      source,
      message
    }, ...this.logs].slice(0, 100);
    this.emit();
  }

  list() {
    return [...this.logs];
  }

  subscribe(listener: (logs: ShellLog[]) => void) {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = this.list();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
