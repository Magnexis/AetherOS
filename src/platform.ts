import { invokeCommand } from "./backend";
import { getPackages } from "./packageManager";

export type RuntimePermission = "filesystem.read" | "filesystem.write" | "notifications" | "settings.read" | "terminal.exec" | "packages.manage";

export type AetherAppManifest = {
  id: string;
  name: string;
  version: string;
  author: string;
  channel?: "stable" | "beta" | "nightly";
  installed?: boolean;
  permissions: RuntimePermission[];
  description: string;
  entryHtml?: string;
};

export const runtimeApps: AetherAppManifest[] = [
  {
    id: "notes.studio",
    name: "Notes Studio",
    version: "1.0.0",
    author: "Aether Labs",
    channel: "stable",
    installed: true,
    permissions: ["filesystem.read", "notifications"],
    description: "A sandboxed note workspace that proves third-party app manifests and runtime APIs.",
    entryHtml: "<main><h1>Notes Studio</h1><p>Sandboxed app runtime active.</p><button onclick=\"if(window.Aether){window.Aether.notify('Notes Studio saved a draft');}else{parent.postMessage({type:'aether-notify',body:'Notes Studio saved a draft'}, '*');}\">Save Draft</button></main>"
  },
  {
    id: "paint.micro",
    name: "Micro Paint",
    version: "0.8.4",
    author: "Local Registry",
    channel: "beta",
    installed: false,
    permissions: ["filesystem.write", "notifications"],
    description: "Small drawing app package with declared write permissions.",
    entryHtml: "<main><h1>Micro Paint</h1><p>Canvas runtime placeholder with sandboxed APIs.</p><input type=\"color\" value=\"#6fd2ff\"></main>"
  },
  {
    id: "dev.runner",
    name: "Dev Runner",
    version: "0.3.0",
    author: "Aether SDK",
    channel: "nightly",
    installed: false,
    permissions: ["terminal.exec", "packages.manage"],
    description: "Developer-created service and command runner example.",
    entryHtml: "<main><h1>Dev Runner</h1><p>Uses elevated APIs after capability grants.</p></main>"
  }
];

export type ServiceRecord = {
  id: string;
  name: string;
  status: "running" | "stopped" | "crashed";
  boot: boolean;
  restartPolicy: "never" | "on-failure" | "always";
  permissions: string[];
  logs: string[];
};

export const services: ServiceRecord[] = [
  { id: "indexer", name: "Aether Indexer", status: "running", boot: true, restartPolicy: "always", permissions: ["filesystem.read"], logs: ["Indexer booted", "Initial file crawl complete"] },
  { id: "pkgd", name: "Package Registry Daemon", status: "running", boot: true, restartPolicy: "on-failure", permissions: ["network.registry", "packages.manage"], logs: ["Registry cache loaded"] },
  { id: "shield", name: "Aether Shield", status: "running", boot: true, restartPolicy: "always", permissions: ["filesystem.scan"], logs: ["Realtime protection enabled"] },
  { id: "demo-service", name: "Developer Demo Service", status: "stopped", boot: false, restartPolicy: "never", permissions: ["notifications"], logs: ["Created from Developer Console"] }
];

export type UpdateRecord = {
  version: string;
  channel: "stable" | "beta" | "nightly";
  status: "available" | "downloaded" | "applied" | "rollback";
  notes: string;
};

export const updates: UpdateRecord[] = [
  { version: "0.3.0", channel: "stable", status: "available", notes: "App runtime, service manager, search index, and protection center." },
  { version: "0.3.1-beta", channel: "beta", status: "available", notes: "Compositor workspace previews and package rollback snapshots." },
  { version: "0.4.0-nightly", channel: "nightly", status: "available", notes: "Experimental semantic search hooks and SDK packaging CLI." }
];

export type ThreatRecord = {
  id: string;
  name: string;
  path: string;
  severity: "low" | "medium" | "high";
  status: "detected" | "quarantined" | "allowed";
};

export const threats: ThreatRecord[] = [
  { id: "pua-demo", name: "PUA.Demo.Bundle", path: "Downloads/demo-app.pkg", severity: "low", status: "detected" }
];

export type SearchHit = {
  type: "app" | "package" | "setting" | "command" | "service" | "file" | "update";
  title: string;
  subtitle: string;
  action: string;
};

export async function buildSearchIndex(): Promise<SearchHit[]> {
  const knownFolders = await invokeCommand<[string, string][]>("get_known_folders", undefined, () => [["Home", "Home"], ["Documents", "Documents"]]);
  return [
    ...runtimeApps.map((app) => ({ type: "app" as const, title: app.name, subtitle: app.description, action: `runtime:${app.id}` })),
    ...getPackages().map((pkg) => ({ type: "package" as const, title: pkg.name, subtitle: pkg.description, action: "packages" })),
    ...services.map((service) => ({ type: "service" as const, title: service.name, subtitle: `${service.status} · ${service.restartPolicy}`, action: "services" })),
    ...knownFolders.map(([name, path]) => ({ type: "file" as const, title: name, subtitle: path, action: "files" })),
    ...updates.map((update) => ({ type: "update" as const, title: update.version, subtitle: update.notes, action: "updates" })),
    { type: "app" as const, title: "Control Panel", subtitle: "Devices, firewall, environment, startup, recovery", action: "control" },
    { type: "app" as const, title: "Experience Center", subtitle: "Start, taskbar, widgets, snap layouts, shortcuts, and default apps", action: "experience" },
    { type: "app" as const, title: "Ecosystem Hub", subtitle: "Store channels, extension points, protocols, publishing, and app trust", action: "ecosystem" },
    { type: "app" as const, title: "Aether Assistant", subtitle: "Local helper for files, packages, settings, and recovery", action: "assistant" },
    { type: "app" as const, title: "Kernel Lab", subtitle: "SASOS, compatibility VMs, formal verification, semantic FS, replay, capabilities, IPC, scheduling, eBPF, ZRAM, VFS", action: "kernel" },
    { type: "app" as const, title: "Aether Nexus", subtitle: "System graph, automations, workspace choreography, self-healing, command mesh, and time ribbon", action: "nexus" },
    { type: "app" as const, title: "Boot Manager", subtitle: "Normal, recovery, diagnostic, safe mode, and last known good startup", action: "boot" },
    { type: "app" as const, title: "Aether Registry", subtitle: "Kernel, services, drivers, user, shell, task, and startup hives", action: "registry" },
    { type: "app" as const, title: "Device Manager", subtitle: "Devices, drivers, hardware matching, rollback, and signature warnings", action: "devices" },
    { type: "app" as const, title: "Permission Center", subtitle: "App capability prompts and grant audit", action: "permissions" },
    { type: "app" as const, title: "Task Scheduler", subtitle: "Login, interval, event, idle, and capability-token tasks", action: "tasks" },
    { type: "app" as const, title: "Crash Reporter", subtitle: "Crash bundles with logs, service state, and replay metadata", action: "crash" },
    { type: "app" as const, title: "Event Viewer", subtitle: "System event bus topics and replay windows", action: "events" },
    { type: "setting", title: "Appearance", subtitle: "Theme, animation, dock density", action: "settings" },
    { type: "setting", title: "Identity", subtitle: "Users, PIN, permissions, admin actions", action: "security" },
    { type: "command", title: "Open Terminal", subtitle: "Launch command shell", action: "terminal" },
    { type: "command", title: "Lock Session", subtitle: "Return to secure lock screen", action: "lock" }
  ];
}

export function appManifestJson(app: AetherAppManifest) {
  return JSON.stringify({
    id: app.id,
    name: app.name,
    version: app.version,
    author: app.author,
    entry: "index.html",
    permissions: app.permissions,
    channel: app.channel
  }, null, 2);
}
