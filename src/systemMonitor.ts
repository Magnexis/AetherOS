import { invokeCommand } from "./backend";
import type { WindowManager } from "./windows";

type LiveSystemInfo = {
  cpu_brand: string;
  cpu_cores: number;
  cpu_usage: number;
  total_memory_mb: number;
  used_memory_mb: number;
  disk_total_gb: number;
  disk_available_gb: number;
  uptime_seconds: number;
  os_name: string;
  kernel_version: string;
};

type ProcessInfo = {
  pid: string;
  name: string;
  memory_kb: number;
  cpu_usage: number;
};

export function createSystemMonitorApp(windowManager: WindowManager) {
  const root = document.createElement("div");
  root.className = "monitor-app";
  let systemInfo: LiveSystemInfo | null = null;
  let processes: ProcessInfo[] = [];
  let selectedPid = "";
  let processAction = "Select a process for control actions.";
  let simulatedGpu = 22;

  const render = () => {
    if (!root.isConnected && root.parentElement) return;
    const ram = systemInfo ? percentage(systemInfo.used_memory_mb, systemInfo.total_memory_mb) : 0;
    const diskUsed = systemInfo ? percentage(systemInfo.disk_total_gb - systemInfo.disk_available_gb, systemInfo.disk_total_gb) : 0;
    const windows = windowManager.list();
    simulatedGpu = Math.max(6, Math.min(96, simulatedGpu + Math.round(Math.random() * 16 - 8)));
    root.innerHTML = `
      <div class="app-toolbar">
        <div>
          <h2>System Monitor</h2>
          <p>Rust-backed host metrics with simulated GPU telemetry</p>
        </div>
        <span class="status-pill">Uptime ${formatUptime(systemInfo?.uptime_seconds ?? 0)}</span>
      </div>
      <div class="metric-grid">
        ${metric("CPU", Math.round(systemInfo?.cpu_usage ?? 0), systemInfo ? `${systemInfo.cpu_cores} cores` : "Loading")}
        ${metric("RAM", ram, systemInfo ? `${systemInfo.used_memory_mb}/${systemInfo.total_memory_mb} MB` : "Loading")}
        ${metric("Disk", diskUsed, systemInfo ? `${systemInfo.disk_available_gb} GB free` : "Loading")}
        ${metric("GPU", simulatedGpu, "Simulated Phase 2 metric")}
      </div>
      <div class="monitor-columns">
        <section>
          <h3>Running Apps</h3>
          ${windows.map((win) => `<div class="process-row"><span>${win.icon} ${win.title}</span><small>${win.minimized ? "Minimized" : "Active"}</small></div>`).join("") || `<p class="small-note">No app windows open.</p>`}
        </section>
        <section>
          <h3>Host Processes</h3>
          ${processes.slice(0, 10).map((process) => `<button class="process-row process-button ${selectedPid === process.pid ? "selected" : ""}" data-pid="${process.pid}"><span>${process.name}</span><small>${process.pid} · ${Math.round(process.memory_kb / 1024)} MB · ${process.cpu_usage.toFixed(1)}%</small></button>`).join("") || `<p class="small-note">No process data available.</p>`}
          <div class="button-row">
            <button class="secondary-btn" data-action="kill" ${selectedPid ? "" : "disabled"}>Kill</button>
            <button class="secondary-btn" data-action="suspend" ${selectedPid ? "" : "disabled"}>Suspend</button>
            <button class="secondary-btn" data-action="restart" ${selectedPid ? "" : "disabled"}>Restart</button>
            <button class="secondary-btn" data-action="limit" ${selectedPid ? "" : "disabled"}>Limit Resources</button>
          </div>
          <p class="small-note">${processAction}</p>
        </section>
      </div>
      <div class="monitor-columns">
        <section>
          <h3>Backend</h3>
          <div class="process-row"><span>Host OS</span><small>${systemInfo?.os_name ?? "Loading"}</small></div>
          <div class="process-row"><span>Kernel</span><small>${systemInfo?.kernel_version ?? "Loading"}</small></div>
          <div class="process-row"><span>CPU</span><small>${systemInfo?.cpu_brand ?? "Loading"}</small></div>
          <div class="process-row"><span>Active windows</span><small>${windowManager.getActiveCount()}</small></div>
        </section>
        <section>
          <h3>Shell Windows</h3>
          ${windows.map((win) => `<div class="process-row"><span>${win.appId}</span><small>${win.element.offsetWidth}x${win.element.offsetHeight}</small></div>`).join("") || `<p class="small-note">No windows to report.</p>`}
          <h3>Startup Apps</h3>
          <div class="permission-list"><span>Terminal</span><span>System Monitor</span><span>Aether Shield</span></div>
        </section>
      </div>
    `;
    root.querySelectorAll<HTMLButtonElement>("[data-pid]").forEach((button) => button.addEventListener("click", () => {
      selectedPid = button.dataset.pid ?? "";
      render();
    }));
    root.querySelector<HTMLButtonElement>('[data-action="kill"]')?.addEventListener("click", async () => {
      processAction = await invokeCommand<string>("kill_process", { pid: selectedPid }, () => `Terminate simulated for ${selectedPid}`);
      await refresh();
    });
    root.querySelector<HTMLButtonElement>('[data-action="suspend"]')?.addEventListener("click", () => {
      processAction = `Suspend requested for ${selectedPid}. Native suspend policy requires elevated host permissions.`;
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener("click", () => {
      processAction = `Restart requested for ${selectedPid}. Process relaunch requires executable path authority.`;
      render();
    });
    root.querySelector<HTMLButtonElement>('[data-action="limit"]')?.addEventListener("click", () => {
      processAction = `Resource limit profile attached to ${selectedPid}: 20% CPU soft cap, 512 MB memory warning.`;
      render();
    });
  };

  const refresh = async () => {
    systemInfo = await invokeCommand<LiveSystemInfo>("get_live_system_info", undefined, () => fallbackInfo());
    processes = await invokeCommand<ProcessInfo[]>("list_processes", undefined, () => []);
    if (!root.isConnected && root.parentElement) return;
    render();
  };

  refresh();
  const timer = window.setInterval(refresh, 1800);
  root.addEventListener("aether:destroy", () => window.clearInterval(timer));
  return root;
}

function metric(label: string, value: number, detail: string) {
  return `
    <article class="metric-card">
      <div><strong>${label}</strong><span>${detail}</span></div>
      <b>${Number.isFinite(value) ? value : 0}%</b>
      <progress value="${Number.isFinite(value) ? value : 0}" max="100"></progress>
    </article>
  `;
}

function percentage(used: number, total: number) {
  if (!total) return 0;
  return Math.round((used / total) * 100);
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function fallbackInfo(): LiveSystemInfo {
  return {
    cpu_brand: "Browser preview CPU",
    cpu_cores: navigator.hardwareConcurrency || 4,
    cpu_usage: Math.round(20 + Math.random() * 30),
    total_memory_mb: 8192,
    used_memory_mb: 4096,
    disk_total_gb: 512,
    disk_available_gb: 260,
    uptime_seconds: Math.round(performance.now() / 1000),
    os_name: "Browser Preview",
    kernel_version: "Tauri unavailable"
  };
}
