import { invokeCommand, type ShellLogger } from "./backend";
import { getPackages } from "./packageManager";
import type { WindowManager } from "./windows";

type DeveloperConsoleContext = {
  logger: ShellLogger;
  windowManager: WindowManager;
  getState: () => unknown;
};

export function createDeveloperConsoleApp(context: DeveloperConsoleContext) {
  const root = document.createElement("div");
  root.className = "developer-app";
  let commandResult = "Run a backend command to inspect the bridge.";
  let logs = context.logger.list();

  const render = () => {
    if (!root.isConnected && root.parentElement) return;
    const windows = context.windowManager.snapshot();
    root.innerHTML = `
      <div class="app-toolbar">
        <div>
          <h2>Developer Console</h2>
          <p>Shell diagnostics, backend probes, and registry state</p>
        </div>
        <button class="primary-btn" data-action="state">Dump State</button>
      </div>
      <div class="developer-grid">
        <section class="details-panel">
          <h3>Backend Commands</h3>
          <div class="button-row">
            <button class="secondary-btn" data-command="get_live_system_info">System Info</button>
            <button class="secondary-btn" data-command="list_processes">Processes</button>
            <button class="secondary-btn" data-command="get_known_folders">Known Folders</button>
          </div>
          <pre>${escapeText(commandResult)}</pre>
        </section>
        <section class="details-panel">
          <h3>Window Layout</h3>
          <pre>${escapeText(JSON.stringify(windows, null, 2))}</pre>
        </section>
        <section class="details-panel">
          <h3>Package Registry</h3>
          <pre>${escapeText(JSON.stringify(getPackages(), null, 2))}</pre>
        </section>
        <section class="details-panel">
          <h3>Shell Logs</h3>
          ${logs.map((log) => `<div class="process-row"><span>${log.source}</span><small>${log.time}</small></div><p class="small-note">${escapeText(log.message)}</p>`).join("") || `<p class="small-note">No logs yet.</p>`}
        </section>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", async () => {
        const command = button.dataset.command ?? "";
        const result = await invokeCommand(command, undefined, () => ({ preview: "Backend unavailable in browser preview." }));
        if (!root.isConnected) return;
        commandResult = JSON.stringify(result, null, 2);
        context.logger.log("developer", `Ran ${command}`);
        render();
      });
    });
    root.querySelector<HTMLButtonElement>('[data-action="state"]')?.addEventListener("click", () => {
      if (!root.isConnected) return;
      commandResult = JSON.stringify(context.getState(), null, 2);
      context.logger.log("developer", "Dumped persisted shell state");
      render();
    });
  };

  const unsubscribe = context.logger.subscribe((next) => {
    logs = next;
    render();
  });
  root.addEventListener("aether:destroy", () => {
    unsubscribe();
  }, { once: true });
  render();
  return root;
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
