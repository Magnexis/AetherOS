import { invokeCommand } from "./backend";
import { appManifestJson, runtimeApps, type AetherAppManifest } from "./platform";

type RuntimeContext = {
  launchRuntimeApp: (app: AetherAppManifest) => void;
  notify: (title: string, body: string, tone?: "info" | "success" | "warning") => void;
  log: (source: string, message: string) => void;
};

export function createAppRuntimeApp(context: RuntimeContext) {
  const root = document.createElement("div");
  root.className = "platform-app";
  let selected = runtimeApps[0].id;
  let diskApps: AetherAppManifest[] = [];
  let permissionPrompt = "Select an app to review permissions.";

  const render = () => {
    const allApps = [...runtimeApps, ...diskApps.filter((app) => !runtimeApps.some((candidate) => candidate.id === app.id))];
    const app = allApps.find((candidate) => candidate.id === selected) ?? allApps[0];
    root.innerHTML = `
      <div class="app-toolbar">
        <div>
          <h2>App Runtime</h2>
          <p>Manifest apps, permissions, lifecycle, sandbox windows, and local app store</p>
        </div>
        <span class="status-pill">aether.app.json</span>
      </div>
      <div class="platform-grid">
        <section class="package-list">
          <h3>Local App Store</h3>
          ${allApps.map((candidate) => `
            <button class="package-row ${candidate.id === selected ? "selected" : ""}" data-app="${candidate.id}">
              <span>${candidate.name}</span><small>${candidate.installed ? "Installed" : candidate.channel ?? "disk"}</small>
            </button>
          `).join("")}
        </section>
        <section class="details-panel">
          <span class="status-pill">${app.installed ? "Installed" : "Available"} · ${app.channel ?? "disk"}</span>
          <h2>${app.name}</h2>
          <p>${app.description}</p>
          <div class="permission-list">${app.permissions.map((permission) => `<span>${permission}</span>`).join("")}</div>
          <p class="small-note">${permissionPrompt}</p>
          <div class="button-row">
            <button class="primary-btn" data-action="launch" ${app.installed ? "" : "disabled"}>Launch Sandbox</button>
            <button class="secondary-btn" data-action="native">Open Native Webview</button>
            <button class="secondary-btn" data-action="reload">Load Disk Manifests</button>
            <button class="secondary-btn" data-action="install" ${app.installed ? "disabled" : ""}>Install</button>
            <button class="secondary-btn" data-action="uninstall" ${app.installed ? "" : "disabled"}>Uninstall</button>
            <button class="secondary-btn" data-action="grant">Grant APIs</button>
          </div>
          <pre>${appManifestJson(app)}</pre>
        </section>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>("[data-app]").forEach((button) => {
      button.addEventListener("click", () => {
        selected = button.dataset.app ?? selected;
        render();
      });
    });
    root.querySelector<HTMLButtonElement>('[data-action="launch"]')?.addEventListener("click", () => {
      context.launchRuntimeApp(app);
      context.log("runtime", `Launched ${app.id}`);
    });
    root.querySelector<HTMLButtonElement>('[data-action="native"]')?.addEventListener("click", async () => {
      try {
        const message = await invokeCommand<string>("open_app_webview", { appId: app.id });
        context.notify("Native app webview", message, "success");
      } catch (error) {
        context.notify("App crash handled", String(error), "warning");
      }
    });
    root.querySelector<HTMLButtonElement>('[data-action="reload"]')?.addEventListener("click", async () => {
      await invokeCommand("ensure_app_runtime_dirs");
      diskApps = await invokeCommand<AetherAppManifest[]>("load_app_manifests", undefined, () => []);
      context.notify("Manifests loaded", `${diskApps.length} disk apps found.`, "success");
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="install"]')?.addEventListener("click", () => {
      app.installed = true;
      context.notify("App installed", app.name, "success");
      context.log("runtime", `Installed ${app.id}`);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="uninstall"]')?.addEventListener("click", () => {
      app.installed = false;
      context.notify("App uninstalled", app.name, "warning");
      context.log("runtime", `Uninstalled ${app.id}`);
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="grant"]')?.addEventListener("click", () => {
      permissionPrompt = `Runtime permission prompt approved for ${app.name}.`;
      context.notify("Capabilities granted", `${app.name}: ${app.permissions.join(", ")}`, "success");
      context.log("runtime", `Granted ${app.permissions.join(", ")} to ${app.id}`);
    });
  };

  invokeCommand("ensure_app_runtime_dirs").then(() => invokeCommand<AetherAppManifest[]>("load_app_manifests", undefined, () => [])).then((apps) => {
    diskApps = apps;
    render();
  });
  render();
  return root;
}

export function createSandboxedRuntimeWindow(app: AetherAppManifest) {
  const root = document.createElement("div");
  root.className = "runtime-window";
  const iframe = document.createElement("iframe");
  iframe.sandbox.add("allow-scripts");
  iframe.srcdoc = `
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin:0; font-family:Segoe UI, sans-serif; color:#edf4ff; background:#0b1220; }
          main { padding:24px; }
          button,input { min-height:34px; border:1px solid #6fd2ff; background:#172235; color:#edf4ff; border-radius:7px; padding:0 12px; }
        </style>
      </head>
      <body>${app.entryHtml ?? `<main><h1>${app.name}</h1><p>Loaded from manifest.</p></main>`}<script>window.Aether={notify:(body)=>{if(typeof body==='string')parent.postMessage({type:'aether-notify',body:body.slice(0,500)}, '*');}};</script></body>
    </html>
  `;
  root.append(iframe);
  return root;
}
