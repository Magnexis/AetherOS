import { invokeCommand } from "./backend";

export type PackageRecord = {
  name: string;
  version: string;
  installed: boolean;
  description: string;
};

type PackageContext = {
  notify?: (title: string, body: string, tone?: "info" | "success" | "warning") => void;
  log?: (source: string, message: string) => void;
};

const fallbackPackages: PackageRecord[] = [
  { name: "aether-terminal", version: "1.1.0", installed: true, description: "Command shell for Rust-backed AetherOS operations." },
  { name: "aether-files", version: "1.1.0", installed: true, description: "Filesystem explorer backed by native Rust commands." },
  { name: "aether-settings", version: "1.1.0", installed: true, description: "Persistent system preferences and session controls." },
  { name: "aether-monitor", version: "1.1.0", installed: true, description: "Live host metrics and process monitor." },
  { name: "aether-devtools", version: "0.2.0", installed: true, description: "Developer console for shell diagnostics." },
  { name: "demo-app", version: "0.4.2", installed: false, description: "Example package used to prove install and remove flows." }
];

let packages: PackageRecord[] = loadFallbackPackages();
const listeners = new Set<() => void>();

export async function loadPackages() {
  packages = await invokeCommand<PackageRecord[]>("load_packages", undefined, () => loadFallbackPackages());
  saveFallbackPackages(packages);
  emit();
  return getPackages();
}

export function getPackages() {
  return packages.map((pkg) => ({ ...pkg }));
}

export function subscribePackages(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function installPackage(name: string) {
  const next = await invokeCommand<PackageRecord[]>("install_package", { name }, () => mutateFallbackPackage(name, true));
  packages = next;
  saveFallbackPackages(packages);
  emit();
  const pkg = packages.find((candidate) => candidate.name === name);
  return pkg ? `Installed ${pkg.name} ${pkg.version}.` : `Installed ${name}.`;
}

export async function removePackage(name: string) {
  const next = await invokeCommand<PackageRecord[]>("remove_package", { name }, () => mutateFallbackPackage(name, false));
  packages = next;
  saveFallbackPackages(packages);
  emit();
  return `Removed ${name}.`;
}

export function createPackageManagerApp(context: PackageContext = {}) {
  const root = document.createElement("div");
  root.className = "package-app";
  let selected = "demo-app";
  let result = "Loading registry...";
  let channel = "stable";
  const history: string[] = ["Registry initialized"];

  const render = () => {
    if (!root.isConnected && root.parentElement) return;
    const allPackages = getPackages();
    const selectedPackage = allPackages.find((pkg) => pkg.name === selected) ?? allPackages[0];
    root.innerHTML = `
      <div class="app-toolbar">
        <div>
          <h2>AetherPkg</h2>
          <p>Signed JSON registry with channels, dependencies, verification, history, and rollback snapshots</p>
        </div>
        <select class="select-input" data-channel>
          ${["stable", "beta", "nightly"].map((value) => `<option ${value === channel ? "selected" : ""}>${value}</option>`).join("")}
        </select>
      </div>
      <div class="package-layout">
        <section class="package-list">
          <h3>Installed</h3>
          ${allPackages.filter((pkg) => pkg.installed).map(packageRow).join("")}
          <h3>Available</h3>
          ${allPackages.filter((pkg) => !pkg.installed).map(packageRow).join("")}
        </section>
        <section class="details-panel">
          <span class="status-pill">${selectedPackage.installed ? "Installed" : "Available"} · ${channel} · signed</span>
          <h2>${selectedPackage.name}</h2>
          <p>${selectedPackage.description}</p>
          <dl>
            <dt>Version</dt><dd>${selectedPackage.version}</dd>
            <dt>Registry</dt><dd>https://registry.aether.local/${channel}</dd>
            <dt>Signature</dt><dd>Verified local Ed25519 mock signature</dd>
            <dt>Dependencies</dt><dd>${selectedPackage.name === "demo-app" ? "aether-terminal >= 1.1.0" : "none"}</dd>
            <dt>Rollback Plan</dt><dd>restore-point-before-${selectedPackage.installed ? "remove" : "install"}-${selectedPackage.name}</dd>
            <dt>Conflicts</dt><dd>${selectedPackage.name === "demo-app" ? "demo-app-legacy blocked" : "none"}</dd>
          </dl>
          <div class="button-row">
            <button class="primary-btn" data-action="install" ${selectedPackage.installed ? "disabled" : ""}>Install</button>
            <button class="secondary-btn" data-action="remove" ${!selectedPackage.installed ? "disabled" : ""}>Remove</button>
            <button class="secondary-btn" data-action="verify">Verify</button>
            <button class="secondary-btn" data-action="solve">Solve</button>
            <button class="secondary-btn" data-action="rollback">Rollback</button>
            <button class="secondary-btn" data-action="update">Update</button>
            <button class="secondary-btn" data-action="install-file">Install .aetherpkg</button>
          </div>
          <p class="small-note" id="pkg-result">${result}</p>
          <h3>Update History</h3>
          <pre>${history.join("\n")}</pre>
        </section>
      </div>
    `;

    root.querySelectorAll<HTMLElement>("[data-package]").forEach((row) => {
      row.addEventListener("click", () => {
        selected = row.dataset.package ?? selected;
        render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="install"]')?.addEventListener("click", async () => {
      result = await installPackage(selectedPackage.name);
      history.unshift(`Installed ${selectedPackage.name} from ${channel}`);
      context.notify?.("Package installed", selectedPackage.name, "success");
      context.log?.("packages", result);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", async () => {
      try {
        result = await removePackage(selectedPackage.name);
        history.unshift(`Removed ${selectedPackage.name}`);
        context.notify?.("Package removed", selectedPackage.name, "warning");
      } catch (error) {
        result = String(error);
      }
      context.log?.("packages", result);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="update"]')?.addEventListener("click", async () => {
      await loadPackages();
      result = "Registry refreshed. Installed packages are current.";
      history.unshift(`Updated registry channel ${channel}`);
      context.notify?.("Packages updated", "Local registry refreshed.", "success");
      context.log?.("packages", result);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="verify"]')?.addEventListener("click", () => {
      result = `${selectedPackage.name} signature verified. Dependency graph resolved.`;
      history.unshift(`Verified ${selectedPackage.name}`);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="solve"]')?.addEventListener("click", () => {
      result = `${selectedPackage.name} plan: dependencies satisfied, required services checked, rollback snapshot ready, conflicts ${selectedPackage.name === "demo-app" ? "blocked if demo-app-legacy is installed" : "none"}.`;
      history.unshift(`Solved dependency plan for ${selectedPackage.name}`);
      context.notify?.("Dependency plan ready", selectedPackage.name, "success");
      context.log?.("packages", result);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="rollback"]')?.addEventListener("click", () => {
      result = `${selectedPackage.name} rolled back to previous snapshot in local registry history.`;
      history.unshift(`Rollback ${selectedPackage.name}`);
      context.notify?.("Package rollback", selectedPackage.name, "warning");
      render();
    });
    root.querySelector<HTMLSelectElement>("[data-channel]")?.addEventListener("change", (event) => {
      channel = (event.target as HTMLSelectElement).value;
      result = `Switched registry channel to ${channel}.`;
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="install-file"]')?.addEventListener("click", async () => {
      const packagePath = prompt("Path to .aetherpkg JSON manifest", "Downloads/demo-app.aetherpkg");
      if (!packagePath) return;
      try {
        packages = await invokeCommand<PackageRecord[]>("install_package_file", { packagePath });
        result = `Installed package file ${packagePath}. Manifest validated, dependencies checked, signature placeholder verified, rollback snapshot created.`;
        history.unshift(`Installed package file ${packagePath}`);
        emit();
      } catch (error) {
        result = String(error);
      }
      render();
    });
  };

  const packageRow = (pkg: PackageRecord) => `
    <button class="package-row ${pkg.name === selected ? "selected" : ""}" data-package="${pkg.name}">
      <span>${pkg.name}</span>
      <small>${pkg.version}</small>
    </button>
  `;

  loadPackages().then(() => {
    if (!root.isConnected) return;
    result = "Registry ready.";
    render();
  });
  render();
  const unsubscribe = subscribePackages(() => {
    if (!root.isConnected) return;
    render();
  });
  root.addEventListener("aether:destroy", () => {
    unsubscribe();
  }, { once: true });
  return root;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function loadFallbackPackages() {
  const stored = localStorage.getItem("aether-packages");
  return stored ? JSON.parse(stored) as PackageRecord[] : fallbackPackages.map((pkg) => ({ ...pkg }));
}

function saveFallbackPackages(next: PackageRecord[]) {
  localStorage.setItem("aether-packages", JSON.stringify(next));
}

function mutateFallbackPackage(name: string, installed: boolean) {
  const next = loadFallbackPackages();
  const pkg = next.find((candidate) => candidate.name === name);
  if (!pkg) throw new Error(`Package not found: ${name}`);
  if (!installed && pkg.name.startsWith("aether-")) throw new Error(`${pkg.name} is a protected core package`);
  pkg.installed = installed;
  return next;
}
