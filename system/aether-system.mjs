import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..");

export const paths = {
  system: "config/system.json",
  bootTargets: "config/boot-targets.json",
  recoveryPolicy: "config/recovery-policy.json",
  eventBus: "config/event-bus.json",
  registryHives: "config/registry-hives.json",
  restorePoints: "config/restore-points.json",
  startupApps: "config/startup-apps.json",
  taskScheduler: "config/task-scheduler.json",
  crashReporter: "config/crash-reporter.json",
  updates: "config/updates.json",
  network: "config/network.json",
  accounts: "config/accounts.json",
  storage: "config/storage.json",
  audit: "config/audit.json",
  backup: "config/backup.json",
  policyEngine: "config/policy-engine.json",
  experience: "config/experience.json",
  ecosystem: "config/ecosystem.json",
  securityHardening: "config/security-hardening.json",
  kernel: "kernel/kernel.manifest.json",
  services: "services/services.manifest.json",
  drivers: "drivers/drivers.manifest.json",
  packages: "pkg/registry.json",
  dependencyLock: "pkg/dependency-lock.json",
  security: "security/policy.json",
  ui: "ui/shell.manifest.json",
  log: "logs/system-events.jsonl"
};

export function readJson(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function writeJson(relativePath, data) {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tempPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tempPath, fullPath);
}

export function loadSystemGraph() {
  return {
    system: readJson(paths.system),
    bootTargets: readJson(paths.bootTargets),
    recoveryPolicy: readJson(paths.recoveryPolicy),
    eventBus: readJson(paths.eventBus),
    registryHives: readJson(paths.registryHives),
    restorePoints: readJson(paths.restorePoints),
    startupApps: readJson(paths.startupApps),
    taskScheduler: readJson(paths.taskScheduler),
    crashReporter: readJson(paths.crashReporter),
    updates: readJson(paths.updates),
    network: readJson(paths.network),
    accounts: readJson(paths.accounts),
    storage: readJson(paths.storage),
    audit: readJson(paths.audit),
    backup: readJson(paths.backup),
    policyEngine: readJson(paths.policyEngine),
    experience: readJson(paths.experience),
    ecosystem: readJson(paths.ecosystem),
    securityHardening: readJson(paths.securityHardening),
    kernel: readJson(paths.kernel),
    services: readJson(paths.services),
    drivers: readJson(paths.drivers),
    packages: readJson(paths.packages),
    dependencyLock: readJson(paths.dependencyLock),
    security: readJson(paths.security),
    ui: readJson(paths.ui)
  };
}

function pruneStreamFile(fullPath, maxLines = 500) {
  try {
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    if (lines.length > maxLines) {
      fs.writeFileSync(fullPath, lines.slice(-maxLines).join("\n") + "\n");
    }
  } catch {}
}

export function appendSystemLog(source, message, level = "info") {
  const fullPath = path.join(rootDir, paths.log);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message
  };
  fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`);
  pruneStreamFile(fullPath, 500);
  return record;
}

export function publishEvent(topic, message, payload = {}, level = "info") {
  const graph = loadSystemGraph();
  if (!graph.eventBus.topics.some((candidate) => candidate.id === topic)) {
    throw new Error(`Unknown event topic: ${topic}`);
  }
  const fullPath = path.join(rootDir, graph.eventBus.streamPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    topic,
    level,
    message,
    payload
  };
  fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`);
  pruneStreamFile(fullPath, 500);
  appendSystemLog("eventbus", `${topic}: ${message}`, level);
  return record;
}

export function readEvents(topic = "all", limit = 30) {
  const graph = loadSystemGraph();
  const fullPath = path.join(rootDir, graph.eventBus.streamPath);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => topic === "all" || entry.topic === topic)
    .slice(-limit);
}

export function appendServiceLog(serviceId, message, level = "info") {
  const graph = loadSystemGraph();
  const service = graph.services.services.find((candidate) => candidate.id === serviceId);
  if (!service) throw new Error(`Unknown service: ${serviceId}`);
  const fullPath = path.join(rootDir, "logs", "services", `${serviceId}.jsonl`);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: serviceId,
    daemon: service.daemon,
    message
  };
  fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`);
  pruneStreamFile(fullPath, 500);
  publishEvent("services", `${serviceId}: ${message}`, { service: serviceId, daemon: service.daemon }, level);
  return record;
}

export function readServiceLog(serviceId, limit = 30) {
  const graph = loadSystemGraph();
  if (!graph.services.services.some((service) => service.id === serviceId)) throw new Error(`Unknown service: ${serviceId}`);
  const fullPath = path.join(rootDir, "logs", "services", `${serviceId}.jsonl`);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

export function readSystemLog(limit = 20) {
  const fullPath = path.join(rootDir, paths.log);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

export function validateSystemGraph(graph = loadSystemGraph()) {
  const issues = [];
  const driverIds = new Set(graph.drivers.drivers.map((driver) => driver.id));
  const moduleNames = new Set(graph.kernel.modules.map((module) => module.name));
  const serviceIds = new Set(graph.services.services.map((service) => service.id));
  const packageNames = new Set(graph.packages.packages.map((pkg) => pkg.name));
  const targetIds = new Set(graph.bootTargets.targets.map((target) => target.id));
  const capabilityRights = new Set(graph.security.capabilities.flatMap((capability) => capability.rights));

  if (!targetIds.has(graph.system.boot.defaultTarget)) {
    issues.push(`Default boot target '${graph.system.boot.defaultTarget}' is missing.`);
  }
  if (!targetIds.has(graph.system.boot.safeModeTarget)) {
    issues.push(`Safe mode target '${graph.system.boot.safeModeTarget}' is missing.`);
  }
  if (!graph.system.paths.recoveryPolicy) {
    issues.push("System config does not declare a recovery policy path.");
  }
  if (graph.recoveryPolicy.activePolicy !== graph.kernel.boot.recoveryPolicy) {
    issues.push(`Kernel recovery policy '${graph.kernel.boot.recoveryPolicy}' does not match active policy '${graph.recoveryPolicy.activePolicy}'.`);
  }

  graph.drivers.devices.forEach((device) => {
    if (!driverIds.has(device.driver) && !moduleNames.has(device.driver) && device.driver !== "acpi-power") {
      issues.push(`Device '${device.name}' references missing driver/module '${device.driver}'.`);
    }
  });

  graph.services.services.forEach((service) => {
    service.requires.forEach((dependency) => {
      if (!serviceIds.has(dependency)) issues.push(`Service '${service.id}' requires missing service '${dependency}'.`);
    });
    service.permissions.forEach((permission) => {
      const hasRelatedCapability = [...capabilityRights].some((right) => permission.includes(right) || right.includes(permission.split(".").at(-1)));
      const isSystemPermission = ["kernel.", "boot.", "drivers.", "devices.", "services.", "packages.", "filesystem.", "quarantine.", "recovery.", "events.", "tasks.", "crash.", "updates.", "network.", "firewall.", "accounts.", "auth.", "storage.", "audit.", "backup.", "policy.", "hardening.", "shell.", "settings.", "search.", "ecosystem.", "logs.", "ui.", "notifications."].some((prefix) => permission.startsWith(prefix));
      if (!hasRelatedCapability && !isSystemPermission) issues.push(`Service '${service.id}' declares unknown permission '${permission}'.`);
    });
  });

  graph.bootTargets.targets.forEach((target) => {
    target.services.forEach((service) => {
      if (!serviceIds.has(service)) issues.push(`Boot target '${target.id}' references missing service '${service}'.`);
    });
    target.drivers.forEach((driver) => {
      if (!driverIds.has(driver)) issues.push(`Boot target '${target.id}' references missing driver '${driver}'.`);
    });
  });

  graph.packages.packages.forEach((pkg) => {
    pkg.services.forEach((service) => {
      if (!serviceIds.has(service)) issues.push(`Package '${pkg.name}' references missing service '${service}'.`);
    });
    pkg.drivers.forEach((driver) => {
      if (!driverIds.has(driver)) issues.push(`Package '${pkg.name}' references missing driver '${driver}'.`);
    });
  });

  graph.security.adminActions.forEach((action) => {
    const declared = graph.services.services.some((service) => service.permissions.includes(action));
    if (!declared && action !== "kernel.registry.write") issues.push(`Admin action '${action}' is not declared by any service.`);
  });

  if (!packageNames.has("aether-nexus")) issues.push("Core package 'aether-nexus' is missing from registry.");
  if (!packageNames.has("aether-recovery")) issues.push("Core package 'aether-recovery' is missing from registry.");
  ["aether-eventbus", "aether-taskd", "aether-crashd", "aether-updated", "aether-network", "aether-accounts", "aether-storage", "aether-audit", "aether-backup", "aether-policy", "aether-experience", "aether-ecosystem", "aether-hardening"].forEach((name) => {
    if (!packageNames.has(name)) issues.push(`Core package '${name}' is missing from registry.`);
  });
  graph.eventBus.topics.forEach((topic) => {
    topic.subscribers.forEach((daemon) => {
      const hasService = graph.services.services.some((service) => service.daemon === daemon);
      if (!hasService) issues.push(`Event topic '${topic.id}' references missing subscriber daemon '${daemon}'.`);
    });
  });
  graph.registryHives.hives.forEach((hive) => {
    if (!fs.existsSync(path.join(rootDir, hive.path))) issues.push(`Registry hive '${hive.id}' points to missing path '${hive.path}'.`);
  });
  graph.taskScheduler.tasks.forEach((task) => {
    if (!graph.security.capabilities.some((capability) => capability.holder === task.runAs || capability.rights.includes(task.capability.split(".").at(-1)))) {
      issues.push(`Task '${task.id}' has no matching capability holder for '${task.capability}'.`);
    }
  });
  graph.startupApps.entries.forEach((entry) => {
    if (entry.delaySeconds < 0) issues.push(`Startup entry '${entry.id}' has a negative delay.`);
  });
  graph.updates.manifests.forEach((update) => {
    if (!graph.restorePoints.points.some((point) => point.id === update.rollbackPoint)) issues.push(`Update '${update.version}' references missing rollback point '${update.rollbackPoint}'.`);
  });
  graph.dependencyLock.locks.forEach((lock) => {
    lock.requiredServices.forEach((service) => {
      if (!serviceIds.has(service)) issues.push(`Dependency lock '${lock.package}' references missing service '${service}'.`);
    });
    lock.requiredDrivers.forEach((driver) => {
      if (!driverIds.has(driver)) issues.push(`Dependency lock '${lock.package}' references missing driver '${driver}'.`);
    });
  });
  if (!graph.network.profiles.some((profile) => profile.id === graph.network.activeProfile)) {
    issues.push(`Active network profile '${graph.network.activeProfile}' is missing.`);
  }
  if (!graph.accounts.users.some((user) => user.id === graph.accounts.activeUser)) {
    issues.push(`Active user '${graph.accounts.activeUser}' is missing.`);
  }
  graph.storage.quotas.forEach((quota) => {
    if (!graph.accounts.users.some((user) => user.id === quota.user)) issues.push(`Storage quota references missing user '${quota.user}'.`);
    if (!graph.storage.volumes.some((volume) => volume.id === quota.volume)) issues.push(`Storage quota references missing volume '${quota.volume}'.`);
  });
  graph.backup.plans.forEach((plan) => {
    if (plan.retention < 1) issues.push(`Backup plan '${plan.id}' has invalid retention.`);
  });
  graph.policyEngine.policies.forEach((policy) => {
    if (!["prompt", "enforce", "block", "warn"].includes(policy.effect)) issues.push(`Policy '${policy.id}' has invalid effect '${policy.effect}'.`);
  });
  graph.experience.startMenu.pinnedApps.forEach((appId) => {
    if (!graph.ui.apps?.some((app) => app.id === appId) && !["files", "settings", "terminal", "marketplace", "search", "monitor", "security", "nexus"].includes(appId)) {
      issues.push(`Experience pinned app '${appId}' is not a known shell app.`);
    }
  });
  graph.experience.registeredCommands.forEach((command) => {
    if (!command.keys || !command.command || !command.target) issues.push("Experience command registry contains an incomplete command.");
  });
  graph.experience.defaultApps.forEach((association) => {
    if (!association.type || !association.handler) issues.push("Experience default app association is incomplete.");
  });
  graph.ecosystem.apps.forEach((app) => {
    if (!graph.ecosystem.storefront.channels.some((channel) => channel.id === app.channel)) issues.push(`Ecosystem app '${app.id}' references missing channel '${app.channel}'.`);
    app.capabilities.forEach((capability) => {
      const knownCapability = graph.security.capabilities.some((entry) => entry.rights.includes(capability.split(".").at(-1)));
      const knownRuntimeCapability = ["filesystem.read", "filesystem.write", "notifications", "network", "terminal.exec", "settings.read"].includes(capability);
      if (!knownCapability && !knownRuntimeCapability) issues.push(`Ecosystem app '${app.id}' requests unknown capability '${capability}'.`);
    });
  });
  graph.ecosystem.extensionPoints.forEach((extension) => {
    if (!extension.capability || extension.review !== "required") issues.push(`Extension point '${extension.id}' must require review and a capability.`);
  });
  graph.securityHardening.controls.forEach((control) => {
    if (!["enforced", "warn", "disabled"].includes(control.status)) issues.push(`Hardening control '${control.id}' has invalid status '${control.status}'.`);
    if (!["critical", "high", "medium", "low"].includes(control.severity)) issues.push(`Hardening control '${control.id}' has invalid severity '${control.severity}'.`);
  });
  if (graph.securityHardening.runtimePolicy.defaultDeny !== true) issues.push("Security hardening runtime policy must default deny.");
  if (graph.securityHardening.storePolicy.stableRequiresSignature !== true) issues.push("Stable ecosystem channel must require signatures.");
  if (!graph.securityHardening.threatModel.length) issues.push("Security hardening threat model is empty.");
  graph.ui.integrations.forEach((integration) => {
    if (!["kernel", "services", "drivers", "pkg", "security", "logs", "experience", "ecosystem"].includes(integration)) {
      issues.push(`UI integration '${integration}' is not a known root OS layer.`);
    }
  });
  if (!graph.kernel.subsystems.includes("device-manager")) issues.push("Kernel subsystem 'device-manager' is missing.");
  if (!graph.kernel.subsystems.includes("module-loader")) issues.push("Kernel subsystem 'module-loader' is missing.");

  return issues;
}

export function setServiceStatus(id, status) {
  const graph = loadSystemGraph();
  const service = graph.services.services.find((candidate) => candidate.id === id);
  if (!service) throw new Error(`Unknown service: ${id}`);
  service.status = status;
  writeJson(paths.services, graph.services);
  appendSystemLog("services", `Service ${id} set to ${status}`);
  return service;
}

export function setServiceEnabled(id, enabled) {
  const graph = loadSystemGraph();
  const service = graph.services.services.find((candidate) => candidate.id === id);
  if (!service) throw new Error(`Unknown service: ${id}`);
  if (service.id === "init" && !enabled) throw new Error("init is required and cannot be disabled.");
  service.enabled = enabled;
  service.boot = enabled;
  if (!enabled) service.status = "stopped";
  writeJson(paths.services, graph.services);
  appendSystemLog("services", `Service ${id} ${enabled ? "enabled" : "disabled"}`);
  return service;
}

export function setDriverStatus(id, status) {
  const graph = loadSystemGraph();
  const driver = graph.drivers.drivers.find((candidate) => candidate.id === id);
  if (!driver) throw new Error(`Unknown driver: ${id}`);
  if (driver.required && status !== "running") throw new Error(`Driver ${id} is required and cannot be stopped.`);
  driver.status = status;
  writeJson(paths.drivers, graph.drivers);
  appendSystemLog("drivers", `Driver ${id} set to ${status}`);
  return driver;
}

export function setPackageInstalled(name, installed) {
  const graph = loadSystemGraph();
  const pkg = graph.packages.packages.find((candidate) => candidate.name === name);
  if (!pkg) throw new Error(`Unknown package: ${name}`);
  if (pkg.protected && !installed) throw new Error(`Package ${name} is protected and cannot be removed.`);
  pkg.installed = installed;
  writeJson(paths.packages, graph.packages);
  appendSystemLog("packages", `Package ${name} ${installed ? "installed" : "removed"}`);
  return pkg;
}

export function createRecoverySnapshot(label = "manual") {
  const graph = loadSystemGraph();
  const snapshot = {
    schema: "aether.recovery.snapshot.v1",
    label,
    createdAt: new Date().toISOString(),
    system: graph.system,
    services: graph.services,
    drivers: graph.drivers,
    packages: graph.packages,
    security: graph.security
  };
  const directory = path.join(rootDir, graph.recoveryPolicy.snapshotDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${snapshot.createdAt.replace(/[:.]/g, "-")}-${label.replace(/[^a-z0-9_-]/gi, "-")}.json`;
  const fullPath = path.join(directory, filename);
  fs.writeFileSync(fullPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  pruneRecoverySnapshots(directory, graph.recoveryPolicy.maxSnapshots);
  appendSystemLog("recovery", `Created recovery snapshot ${filename}`);
  publishEvent("recovery", `Created recovery snapshot ${filename}`, { path: path.relative(rootDir, fullPath), label }, "success");
  return {
    ...snapshot,
    path: path.relative(rootDir, fullPath)
  };
}

export function createRestorePoint(name, reason = "manual", author = "operator") {
  const graph = loadSystemGraph();
  const snapshot = createRecoverySnapshot(name);
  const checksum = `sha256:${Buffer.from(`${snapshot.createdAt}:${snapshot.label}:${snapshot.path}`).toString("hex").slice(0, 32)}`;
  const point = {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "restore-point",
    name,
    description: `Restore point created for ${reason}.`,
    author,
    reason,
    createdAt: snapshot.createdAt,
    snapshot: snapshot.path,
    checksum,
    preview: [
      `boot target: ${snapshot.system.boot.defaultTarget}`,
      `services: ${snapshot.services.services.length}`,
      `drivers: ${snapshot.drivers.drivers.length}`,
      `packages: ${snapshot.packages.packages.length}`
    ]
  };
  graph.restorePoints.points = [point, ...graph.restorePoints.points.filter((candidate) => candidate.id !== point.id)].slice(0, 12);
  writeJson(paths.restorePoints, graph.restorePoints);
  publishEvent("recovery", `Created restore point ${point.id}`, { restorePoint: point.id }, "success");
  return point;
}

export function restoreRecoverySnapshot(snapshotPath) {
  if (!snapshotPath) throw new Error("Missing snapshot path.");
  const fullPath = path.resolve(rootDir, snapshotPath);
  if (!fullPath.startsWith(rootDir)) throw new Error("Snapshot path escapes project root.");
  if (!fs.existsSync(fullPath)) throw new Error(`Snapshot not found: ${snapshotPath}`);
  const snapshot = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  ["system", "services", "drivers", "packages", "security"].forEach((key) => {
    if (!snapshot[key]) throw new Error(`Snapshot is missing ${key}.`);
  });
  createRecoverySnapshot("pre-restore");
  writeJson(paths.system, snapshot.system);
  writeJson(paths.services, snapshot.services);
  writeJson(paths.drivers, snapshot.drivers);
  writeJson(paths.packages, snapshot.packages);
  writeJson(paths.security, snapshot.security);
  publishEvent("recovery", `Restored recovery snapshot ${snapshotPath}`, { snapshot: snapshotPath }, "warning");
  appendSystemLog("recovery", `Restored recovery snapshot ${snapshotPath}`, "warning");
  return getRecoveryReport(loadSystemGraph());
}

export function listRestorePoints() {
  return loadSystemGraph().restorePoints.points;
}

export function solvePackagePlan(name, action = "install") {
  const graph = loadSystemGraph();
  const pkg = graph.packages.packages.find((candidate) => candidate.name === name);
  if (!pkg) throw new Error(`Unknown package: ${name}`);
  const lock = graph.dependencyLock.locks.find((candidate) => candidate.package === name);
  const installedNames = new Set(graph.packages.packages.filter((candidate) => candidate.installed).map((candidate) => candidate.name));
  const missingDependencies = (lock?.dependencies ?? [])
    .map((dependency) => dependency.split(" ")[0])
    .filter((dependency) => !installedNames.has(dependency));
  const conflicts = (lock?.conflicts ?? []).filter((conflict) => installedNames.has(conflict));
  const plan = {
    package: name,
    action,
    version: pkg.version,
    strategy: graph.dependencyLock.solver.strategy,
    missingDependencies,
    conflicts,
    requiredServices: lock?.requiredServices ?? pkg.services,
    requiredDrivers: lock?.requiredDrivers ?? pkg.drivers,
    rollback: graph.dependencyLock.solver.rollbackOnFailure ? `restore-point-before-${action}-${name}` : "manual",
    allowed: conflicts.length === 0 && !(action === "remove" && pkg.protected)
  };
  publishEvent("packages", `Solved ${action} plan for ${name}`, plan, plan.allowed ? "success" : "warning");
  return plan;
}

export function createCrashBundle(reason = "manual") {
  const graph = loadSystemGraph();
  const directory = path.join(rootDir, graph.crashReporter.bundleDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const createdAt = new Date().toISOString();
  const bundle = {
    schema: "aether.crash.bundle.v1",
    id: `${createdAt.replace(/[:.]/g, "-")}-${reason.replace(/[^a-z0-9_-]/gi, "-")}`,
    createdAt,
    reason,
    serviceState: graph.services,
    packageRegistry: graph.packages,
    recoveryReport: getRecoveryReport(graph),
    replayMetadata: {
      eventReplayWindow: graph.eventBus.delivery.replayWindow,
      deterministicReplay: graph.kernel.boot.panicPolicy
    }
  };
  const fullPath = path.join(directory, `${bundle.id}.json`);
  fs.writeFileSync(fullPath, `${JSON.stringify(bundle, null, 2)}\n`);
  graph.crashReporter.lastBundles = [{ id: bundle.id, createdAt, reason, status: "ready" }, ...graph.crashReporter.lastBundles].slice(0, 8);
  writeJson(paths.crashReporter, graph.crashReporter);
  pruneRecoverySnapshots(directory, 8);
  publishEvent("services", `Created crash bundle ${bundle.id}`, { path: path.relative(rootDir, fullPath), reason }, "warning");
  return { ...bundle, path: path.relative(rootDir, fullPath) };
}

export function setNetworkProfile(profileId) {
  const graph = loadSystemGraph();
  const profile = graph.network.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Unknown network profile: ${profileId}`);
  graph.network.activeProfile = profileId;
  writeJson(paths.network, graph.network);
  publishEvent("network", `Network profile set to ${profileId}`, { profile }, "warning");
  return profile;
}

export function getStorageReport() {
  const graph = loadSystemGraph();
  return {
    checkedAt: new Date().toISOString(),
    volumes: graph.storage.volumes.map((volume) => ({
      ...volume,
      usedPercent: Math.round((volume.usedGb / volume.capacityGb) * 100)
    })),
    quotas: graph.storage.quotas,
    cleanupTargets: graph.storage.maintenance.cleanupTargets
  };
}

export function runStorageCleanup(target = "all") {
  const graph = loadSystemGraph();
  const targets = target === "all" ? graph.storage.maintenance.cleanupTargets : [target];
  let totalCleanedGb = 0;
  targets.forEach((t) => {
    if (t === "cache") {
      const cacheVol = graph.storage.volumes.find((v) => v.id === "cache");
      if (cacheVol && cacheVol.usedGb > 4) {
        totalCleanedGb += cacheVol.usedGb - 4;
        cacheVol.usedGb = 4;
        cacheVol.health = "healthy";
      }
    } else if (t === "trash") {
      const sysVol = graph.storage.volumes.find((v) => v.id === "system");
      if (sysVol && sysVol.usedGb > 140) {
        const cleaned = Math.min(25, sysVol.usedGb - 140);
        totalCleanedGb += cleaned;
        sysVol.usedGb -= cleaned;
      }
    }
  });
  writeJson(paths.storage, graph.storage);
  appendSystemLog("storage", `Ran storage cleanup for targets [${targets.join(", ")}], reclaimed ${totalCleanedGb}GB`);
  publishEvent("storage", `Ran storage cleanup for targets [${targets.join(", ")}]`, { targets, reclaimedGb: totalCleanedGb }, "success");
  return getStorageReport();
}

export function writeAudit(category, message, actor = "operator", level = "audit") {
  const graph = loadSystemGraph();
  if (!graph.audit.categories.some((candidate) => candidate.id === category)) throw new Error(`Unknown audit category: ${category}`);
  const fullPath = path.join(rootDir, graph.audit.streamPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    category,
    level,
    actor,
    message
  };
  fs.appendFileSync(fullPath, `${JSON.stringify(record)}\n`);
  pruneStreamFile(fullPath, 500);
  publishEvent("audit", `${category}: ${message}`, { actor, category }, level);
  return record;
}

export function readAudit(category = "all", limit = 30) {
  const graph = loadSystemGraph();
  const fullPath = path.join(rootDir, graph.audit.streamPath);
  if (!fs.existsSync(fullPath)) return [];
  return fs.readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => category === "all" || entry.category === category)
    .slice(-limit);
}

export function createBackupRun(planId, reason = "manual") {
  const graph = loadSystemGraph();
  const plan = graph.backup.plans.find((candidate) => candidate.id === planId);
  if (!plan) throw new Error(`Unknown backup plan: ${planId}`);
  if (!plan.enabled) throw new Error(`Backup plan '${planId}' is disabled.`);
  const directory = path.join(rootDir, graph.backup.backupDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const createdAt = new Date().toISOString();
  const backup = {
    schema: "aether.backup.run.v1",
    id: `${createdAt.replace(/[:.]/g, "-")}-${planId}`,
    createdAt,
    plan: planId,
    reason,
    targets: plan.targets,
    encrypted: plan.encrypted,
    status: "ready"
  };
  const fullPath = path.join(directory, `${backup.id}.json`);
  fs.writeFileSync(fullPath, `${JSON.stringify(backup, null, 2)}\n`);
  graph.backup.lastRuns = [{ plan: planId, status: "ready", createdAt, sizeMb: Math.max(8, plan.targets.length * 12) }, ...graph.backup.lastRuns].slice(0, 10);
  writeJson(paths.backup, graph.backup);
  pruneRecoverySnapshots(directory, 10);
  publishEvent("backup", `Backup ${backup.id} created`, { path: path.relative(rootDir, fullPath), plan: planId }, "success");
  return { ...backup, path: path.relative(rootDir, fullPath) };
}

export function evaluatePolicies() {
  const graph = loadSystemGraph();
  const violations = [];
  const publicProfile = graph.network.profiles.find((profile) => profile.id === graph.network.activeProfile && profile.id === "public");
  if (publicProfile && (publicProfile.discovery || publicProfile.sharing)) {
    violations.push({ policy: "public-network-lockdown", message: "Public profile cannot allow discovery or sharing.", severity: "warning" });
  }
  graph.drivers.drivers.forEach((driver) => {
    if (driver.mode === "kernel" && !driver.signed && driver.status === "running") {
      violations.push({ policy: "unsigned-kernel-driver-block", message: `${driver.id} is unsigned and running.`, severity: "critical" });
    }
  });
  getStorageReport().volumes.forEach((volume) => {
    if (volume.usedPercent >= graph.storage.maintenance.warnAtPercent) {
      violations.push({ policy: "storage-warning", message: `${volume.label} is ${volume.usedPercent}% full.`, severity: "warning" });
    }
  });
  graph.policyEngine.violations = violations;
  writeJson(paths.policyEngine, graph.policyEngine);
  publishEvent("policy", `Policy evaluation completed with ${violations.length} violation(s)`, { violations }, violations.length ? "warning" : "success");
  return {
    checkedAt: new Date().toISOString(),
    mode: graph.policyEngine.mode,
    healthy: violations.length === 0,
    violations
  };
}

export function getExperienceReport() {
  const graph = loadSystemGraph();
  return {
    mode: graph.experience.mode,
    pinnedApps: graph.experience.startMenu.pinnedApps,
    taskbarZones: graph.experience.taskbar.zones,
    widgets: graph.experience.widgets,
    commands: graph.experience.registeredCommands,
    defaultApps: graph.experience.defaultApps,
    snapLayouts: graph.experience.snapLayouts
  };
}

export function getEcosystemReport() {
  const graph = loadSystemGraph();
  return {
    registry: graph.ecosystem.identity.localRegistry,
    channels: graph.ecosystem.storefront.channels,
    apps: graph.ecosystem.apps,
    extensionPoints: graph.ecosystem.extensionPoints,
    protocols: graph.ecosystem.protocols,
    publishing: graph.ecosystem.publishing
  };
}

export function getHardeningReport() {
  const graph = loadSystemGraph();
  const weights = graph.securityHardening.scoreWeights;
  const controls = graph.securityHardening.controls;
  const maxScore = controls.reduce((sum, control) => sum + (weights[control.severity] ?? 1), 0);
  const score = controls.reduce((sum, control) => {
    const weight = weights[control.severity] ?? 1;
    if (control.status === "enforced") return sum + weight;
    if (control.status === "warn") return sum + Math.round(weight * 0.55);
    return sum;
  }, 0);
  return {
    mode: graph.securityHardening.mode,
    baseline: graph.securityHardening.baseline,
    score: maxScore ? Math.round((score / maxScore) * 100) : 0,
    controls,
    threatModel: graph.securityHardening.threatModel,
    runtimePolicy: graph.securityHardening.runtimePolicy,
    storePolicy: graph.securityHardening.storePolicy,
    networkPolicy: graph.securityHardening.networkPolicy,
    criticalOpen: controls.filter((control) => control.severity === "critical" && control.status !== "enforced")
  };
}

export function getRecoveryReport(graph = loadSystemGraph()) {
  const issues = [];
  const targetIds = new Set(graph.bootTargets.targets.map((target) => target.id));

  if (!targetIds.has(graph.system.boot.defaultTarget)) {
    issues.push({
      id: "boot-target-valid",
      severity: "critical",
      scope: "config",
      message: `Default boot target '${graph.system.boot.defaultTarget}' is not registered.`
    });
  }

  graph.drivers.drivers.forEach((driver) => {
    if (driver.required && driver.status !== "running") {
      issues.push({
        id: "required-drivers-running",
        severity: "critical",
        scope: "drivers",
        message: `Required driver '${driver.id}' is ${driver.status}.`
      });
    }
    if (driver.mode === "kernel" && graph.drivers.signaturePolicy === "require-signed" && !driver.signed && driver.status === "running") {
      issues.push({
        id: "unsigned-kernel-drivers-blocked",
        severity: "critical",
        scope: "drivers",
        message: `Unsigned kernel driver '${driver.id}' is running.`
      });
    }
  });

  graph.services.services.forEach((service) => {
    if (service.enabled && service.status !== "running") {
      issues.push({
        id: "enabled-services-healthy",
        severity: service.id === "init" ? "critical" : "warning",
        scope: "services",
        message: `Enabled service '${service.id}' is ${service.status}.`
      });
    }
    if (service.enabled && service.health && !["healthy", "inactive"].includes(service.health)) {
      issues.push({
        id: "enabled-services-healthy",
        severity: "warning",
        scope: "services",
        message: `Enabled service '${service.id}' reports health '${service.health}'.`
      });
    }
  });

  graph.packages.packages.forEach((pkg) => {
    if (pkg.protected && !pkg.installed) {
      issues.push({
        id: "protected-packages-installed",
        severity: "critical",
        scope: "pkg",
        message: `Protected package '${pkg.name}' is not installed.`
      });
    }
  });

  if (graph.ui.enabled && !graph.ui.frontend?.entry) {
    issues.push({
      id: "ui-entry-present",
      severity: "warning",
      scope: "ui",
      message: "UI layer is enabled but has no shell entry point."
    });
  }

  return {
    policy: graph.recoveryPolicy.activePolicy,
    checkedAt: new Date().toISOString(),
    healthy: issues.length === 0,
    issues
  };
}

export function repairSystemGraph() {
  const graph = loadSystemGraph();
  const before = getRecoveryReport(graph);
  const actions = [];

  if (graph.recoveryPolicy.repairs.createSnapshotBeforeRepair) {
    const snapshot = createRecoverySnapshot("pre-repair");
    actions.push(`snapshot:${snapshot.path}`);
  }

  const targetIds = new Set(graph.bootTargets.targets.map((target) => target.id));
  if (!targetIds.has(graph.system.boot.defaultTarget)) {
    graph.system.boot.defaultTarget = graph.system.boot.safeModeTarget;
    graph.system.boot.flags = ["safe-mode", "repair-registry", "verify-drivers"];
    actions.push(`boot-target:${graph.system.boot.safeModeTarget}`);
  }

  graph.drivers.drivers = graph.drivers.drivers.map((driver) => {
    if (driver.required && graph.recoveryPolicy.repairs.restoreRequiredDrivers && driver.status !== "running") {
      actions.push(`driver:${driver.id}:running`);
      return { ...driver, status: "running" };
    }
    if (driver.mode === "kernel" && graph.recoveryPolicy.repairs.stopUnsignedKernelDrivers && !driver.signed && driver.status === "running") {
      actions.push(`driver:${driver.id}:stopped-unsigned`);
      return { ...driver, status: "stopped" };
    }
    return driver;
  });

  graph.services.services = graph.services.services.map((service) => {
    if (service.enabled && graph.recoveryPolicy.repairs.restartFaultedServices && service.status !== "running") {
      actions.push(`service:${service.id}:running`);
      return { ...service, status: "running", health: "healthy" };
    }
    return service;
  });

  graph.packages.packages = graph.packages.packages.map((pkg) => {
    if (pkg.protected && graph.recoveryPolicy.repairs.protectCorePackages && !pkg.installed) {
      actions.push(`package:${pkg.name}:installed`);
      return { ...pkg, installed: true };
    }
    return pkg;
  });

  writeJson(paths.system, graph.system);
  writeJson(paths.services, graph.services);
  writeJson(paths.drivers, graph.drivers);
  writeJson(paths.packages, graph.packages);
  appendSystemLog("recovery", actions.length ? `Repair actions applied: ${actions.join(", ")}` : "Repair checked system with no changes");
  publishEvent("recovery", actions.length ? "Repair actions applied" : "Repair checked system with no changes", { actions }, actions.length ? "warning" : "success");

  return {
    before,
    after: getRecoveryReport(loadSystemGraph()),
    actions
  };
}

export function getBootPlan(targetId = loadSystemGraph().system.boot.defaultTarget) {
  const graph = loadSystemGraph();
  const target = graph.bootTargets.targets.find((candidate) => candidate.id === targetId);
  if (!target) throw new Error(`Unknown boot target: ${targetId}`);
  const serviceMap = new Map(graph.services.services.map((service) => [service.id, service]));
  const driverMap = new Map(graph.drivers.drivers.map((driver) => [driver.id, driver]));
  const orderedServices = topologicalServices(target.services, serviceMap);
  return {
    target,
    drivers: target.drivers.map((id) => driverMap.get(id)).filter(Boolean),
    services: orderedServices,
    flags: target.flags
  };
}

export function applyBootTarget(targetId) {
  const graph = loadSystemGraph();
  const plan = getBootPlan(targetId);
  const serviceSet = new Set(plan.services.map((service) => service.id));
  const driverSet = new Set(plan.drivers.map((driver) => driver.id));

  graph.system.boot.defaultTarget = targetId;
  graph.system.boot.flags = plan.flags;
  graph.services.target = targetId;
  graph.services.services = graph.services.services.map((service) => ({
    ...service,
    boot: serviceSet.has(service.id),
    enabled: serviceSet.has(service.id),
    status: serviceSet.has(service.id) ? "running" : "stopped",
    health: serviceSet.has(service.id) ? "healthy" : "inactive"
  }));
  graph.drivers.drivers = graph.drivers.drivers.map((driver) => ({
    ...driver,
    status: driverSet.has(driver.id) || driver.required ? "running" : "stopped"
  }));

  writeJson(paths.system, graph.system);
  writeJson(paths.services, graph.services);
  writeJson(paths.drivers, graph.drivers);
  appendSystemLog("boot", `Applied boot target ${targetId}`);
  publishEvent("services", `Applied boot target ${targetId}`, { target: targetId, services: plan.services.map((service) => service.id) }, "warning");
  return getBootPlan(targetId);
}

function topologicalServices(ids, serviceMap) {
  const wanted = new Set(ids);
  const visited = new Set();
  const ordered = [];

  const visit = (id) => {
    if (visited.has(id)) return;
    const service = serviceMap.get(id);
    if (!service) throw new Error(`Boot plan references missing service: ${id}`);
    service.requires.forEach((dependency) => {
      if (wanted.has(dependency)) visit(dependency);
    });
    visited.add(id);
    ordered.push(service);
  };

  ids.forEach(visit);
  return ordered;
}

function pruneRecoverySnapshots(directory, maxSnapshots) {
  try {
    if (!fs.existsSync(directory)) return;
    const snapshots = fs.readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({
        file,
        fullPath: path.join(directory, file),
        created: fs.statSync(path.join(directory, file)).mtimeMs
      }))
      .sort((a, b) => b.created - a.created);

    snapshots.slice(maxSnapshots).forEach((snapshot) => fs.unlinkSync(snapshot.fullPath));
  } catch {}
}
