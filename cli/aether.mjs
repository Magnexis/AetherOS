#!/usr/bin/env node
import {
  appendSystemLog,
  appendServiceLog,
  applyBootTarget,
  createCrashBundle,
  createBackupRun,
  createRecoverySnapshot,
  createRestorePoint,
  evaluatePolicies,
  getBootPlan,
  getEcosystemReport,
  getExperienceReport,
  getHardeningReport,
  getRecoveryReport,
  getStorageReport,
  listRestorePoints,
  loadSystemGraph,
  publishEvent,
  readAudit,
  readEvents,
  readServiceLog,
  readSystemLog,
  repairSystemGraph,
  restoreRecoverySnapshot,
  runStorageCleanup,
  setNetworkProfile,
  setDriverStatus,
  setPackageInstalled,
  setServiceEnabled,
  setServiceStatus,
  solvePackagePlan,
  writeAudit,
  validateSystemGraph
} from "../system/aether-system.mjs";

const [, , command = "help", ...args] = process.argv;

try {
  if (command === "help") {
    printHelp();
  } else if (command === "doctor") {
    const issues = validateSystemGraph();
    if (issues.length) {
      console.log("AetherOS doctor found issues:");
      issues.forEach((issue) => console.log(`- ${issue}`));
      process.exitCode = 1;
    } else {
      appendSystemLog("doctor", "System graph validation passed");
      console.log("AetherOS doctor: all system layers are linked.");
    }
  } else if (command === "status") {
    const graph = loadSystemGraph();
    const runningServices = graph.services.services.filter((service) => service.status === "running").length;
    const runningDrivers = graph.drivers.drivers.filter((driver) => driver.status === "running").length;
    const installedPackages = graph.packages.packages.filter((pkg) => pkg.installed).length;
    console.log(`Kernel: ${graph.kernel.name} ${graph.kernel.version} (${graph.kernel.mode})`);
    console.log(`Services: ${runningServices}/${graph.services.services.length} running`);
    console.log(`Drivers: ${runningDrivers}/${graph.drivers.drivers.length} running`);
    console.log(`Packages: ${installedPackages}/${graph.packages.packages.length} installed`);
    console.log(`Security: ${graph.security.model}`);
    console.log(`Boot target: ${graph.system.boot.defaultTarget}`);
  } else if (command === "targets") {
    const graph = loadSystemGraph();
    graph.bootTargets.targets.forEach((target) => {
      console.log(`${target.id}\t${target.name}\tservices=${target.services.length}\tdrivers=${target.drivers.length}\tflags=${target.flags.join(",")}`);
    });
  } else if (command === "boot") {
    const [action, targetId] = args;
    if (action === "plan") {
      printBootPlan(getBootPlan(targetId));
    } else if (action === "apply") {
      requireArg(targetId, "boot target");
      const plan = applyBootTarget(targetId);
      console.log(`Applied boot target '${plan.target.id}'.`);
      printBootPlan(plan);
    } else {
      throw new Error("Boot command must be 'plan' or 'apply'.");
    }
  } else if (command === "recovery") {
    const [action = "status", label, ...rest] = args;
    if (action === "status" || action === "diagnose") {
      printRecoveryReport(getRecoveryReport());
    } else if (action === "snapshot") {
      const snapshot = createRecoverySnapshot(label ?? "manual");
      console.log(`Snapshot: ${snapshot.path}`);
      console.log(`Created: ${snapshot.createdAt}`);
    } else if (action === "restore") {
      requireArg(label, "snapshot path");
      printRecoveryReport(restoreRecoverySnapshot(label));
    } else if (action === "points") {
      listRestorePoints().forEach((point) => console.log(`${point.id}\t${point.createdAt}\t${point.author}\t${point.reason}\t${point.snapshot || "no-snapshot"}`));
    } else if (action === "point") {
      requireArg(label, "restore point name");
      const point = createRestorePoint(label, rest.join(" ") || "manual");
      console.log(`${point.id}\t${point.createdAt}\t${point.checksum}`);
    } else if (action === "repair") {
      const result = repairSystemGraph();
      console.log("Recovery repair complete.");
      console.log(`Actions: ${result.actions.length ? result.actions.join(", ") : "none"}`);
      printRecoveryReport(result.after);
    } else {
      throw new Error("Recovery command must be status, diagnose, snapshot, or repair.");
    }
  } else if (command === "services") {
    const graph = loadSystemGraph();
    graph.services.services.forEach((service) => {
      console.log(`${service.id}\t${service.status}\t${service.daemon}\tboot=${service.boot}\tenabled=${service.enabled}\thealth=${service.health}\trestart=${service.restart}`);
    });
  } else if (command === "service") {
    const [id, action, ...rest] = args;
    requireArg(id, "service id");
    requireArg(action, "service status/action");
    if (action === "logs") {
      const logs = readServiceLog(id, Number(rest[0] ?? 30));
      logs.forEach((entry) => console.log(`${entry.timestamp}\t${entry.level}\t${entry.daemon}\t${entry.message}`));
    } else if (action === "log") {
      const record = appendServiceLog(id, rest.join(" ") || "manual service log");
      console.log(`${record.timestamp}\t${record.service}\t${record.message}`);
    } else if (["enable", "disable"].includes(action)) {
      const service = setServiceEnabled(id, action === "enable");
      console.log(`${service.id} -> ${service.enabled ? "enabled" : "disabled"}`);
    } else {
      requireStatus(action);
      const service = setServiceStatus(id, action);
      console.log(`${service.id} -> ${service.status}`);
    }
  } else if (command === "drivers") {
    const graph = loadSystemGraph();
    graph.drivers.drivers.forEach((driver) => console.log(`${driver.id}\t${driver.status}\t${driver.className}\t${driver.mode}\tsigned=${driver.signed}`));
  } else if (command === "driver") {
    const [id, status] = args;
    requireArg(id, "driver id");
    requireStatus(status);
    const driver = setDriverStatus(id, status);
    console.log(`${driver.id} -> ${driver.status}`);
  } else if (command === "packages") {
    const graph = loadSystemGraph();
    graph.packages.packages.forEach((pkg) => console.log(`${pkg.name}\t${pkg.version}\t${pkg.installed ? "installed" : "available"}\tprotected=${pkg.protected}`));
  } else if (command === "pkg") {
    const [action, name] = args;
    requireArg(action, "install/remove");
    requireArg(name, "package name");
    if (action === "solve") {
      printPackagePlan(solvePackagePlan(name, args[2] ?? "install"));
    } else {
      if (!["install", "remove"].includes(action)) throw new Error("Package action must be install, remove, or solve.");
      const plan = solvePackagePlan(name, action);
      if (!plan.allowed) throw new Error(`Package ${action} is blocked by conflicts or protection.`);
      const pkg = setPackageInstalled(name, action === "install");
      console.log(`${pkg.name} -> ${pkg.installed ? "installed" : "available"}`);
    }
  } else if (command === "events") {
    const [topic = "all", limit = "30"] = args;
    readEvents(topic, Number(limit)).forEach((entry) => console.log(`${entry.timestamp}\t${entry.level}\t${entry.topic}\t${entry.message}`));
  } else if (command === "event") {
    const [topic, ...message] = args;
    requireArg(topic, "event topic");
    const record = publishEvent(topic, message.join(" ") || "manual event", { source: "cli" });
    console.log(`${record.timestamp}\t${record.topic}\t${record.message}`);
  } else if (command === "registry") {
    const graph = loadSystemGraph();
    graph.registryHives.hives.forEach((hive) => console.log(`${hive.id}\t${hive.owner}\tprotected=${hive.protected}\t${hive.path}`));
  } else if (command === "startup") {
    const graph = loadSystemGraph();
    graph.startupApps.entries.forEach((entry) => console.log(`${entry.id}\t${entry.enabled ? "enabled" : "disabled"}\tdelay=${entry.delaySeconds}s\timpact=${entry.impact}\t${entry.name}`));
  } else if (command === "tasks") {
    const graph = loadSystemGraph();
    graph.taskScheduler.tasks.forEach((task) => console.log(`${task.id}\t${task.enabled ? "enabled" : "disabled"}\t${task.trigger}\t${task.capability}\t${task.action}`));
  } else if (command === "updates") {
    const graph = loadSystemGraph();
    console.log(`Channel: ${graph.updates.activeChannel}\trestartRequired=${graph.updates.restartRequired}`);
    graph.updates.manifests.forEach((update) => console.log(`${update.version}\t${update.channel}\t${update.status}\trestart=${update.requiresRestart}\trollback=${update.rollbackPoint}`));
  } else if (command === "crash") {
    const [action = "bundle", ...reason] = args;
    if (action !== "bundle") throw new Error("Crash command must be bundle.");
    const bundle = createCrashBundle(reason.join(" ") || "manual");
    console.log(`${bundle.id}\t${bundle.path}`);
  } else if (command === "network") {
    const [action = "status", value] = args;
    const graph = loadSystemGraph();
    if (action === "status") {
      console.log(`Profile: ${graph.network.activeProfile}`);
      graph.network.interfaces.forEach((iface) => console.log(`${iface.id}\t${iface.type}\t${iface.state}\t${iface.address || "no-address"}\t${iface.name}`));
    } else if (action === "profile") {
      requireArg(value, "network profile");
      const profile = setNetworkProfile(value);
      console.log(`${profile.id}\t${profile.firewall}\tdiscovery=${profile.discovery}\tsharing=${profile.sharing}`);
    } else if (action === "firewall") {
      graph.network.firewallRules.forEach((rule) => console.log(`${rule.id}\t${rule.enabled ? "enabled" : "disabled"}\t${rule.direction}\t${rule.action}\t${rule.app}:${rule.port}/${rule.protocol}`));
    } else {
      throw new Error("Network command must be status, profile, or firewall.");
    }
  } else if (command === "accounts") {
    const graph = loadSystemGraph();
    console.log(`Active user: ${graph.accounts.activeUser}`);
    graph.accounts.users.forEach((user) => console.log(`${user.id}\t${user.role}\tencrypted=${user.encrypted}\t${user.displayName}`));
  } else if (command === "storage") {
    const [action = "status", target = "all"] = args;
    if (action === "cleanup") {
      const report = runStorageCleanup(target);
      console.log(`Storage cleanup complete.`);
      report.volumes.forEach((volume) => console.log(`${volume.id}\t${volume.usedGb}/${volume.capacityGb}GB\t${volume.usedPercent}%\tencrypted=${volume.encrypted}\t${volume.health}`));
    } else {
      const report = getStorageReport();
      report.volumes.forEach((volume) => console.log(`${volume.id}\t${volume.usedGb}/${volume.capacityGb}GB\t${volume.usedPercent}%\tencrypted=${volume.encrypted}\t${volume.health}`));
    }
  } else if (command === "audit") {
    const [action = "read", category = "all", ...message] = args;
    if (action === "write") {
      const record = writeAudit(category, message.join(" ") || "manual audit event");
      console.log(`${record.timestamp}\t${record.category}\t${record.message}`);
    } else {
      readAudit(category, Number(message[0] ?? 30)).forEach((entry) => console.log(`${entry.timestamp}\t${entry.level}\t${entry.category}\t${entry.actor}\t${entry.message}`));
    }
  } else if (command === "backup") {
    const [action = "plans", planId, ...reason] = args;
    const graph = loadSystemGraph();
    if (action === "plans") {
      graph.backup.plans.forEach((plan) => console.log(`${plan.id}\t${plan.enabled ? "enabled" : "disabled"}\t${plan.schedule}\tretention=${plan.retention}\t${plan.targets.join(",")}`));
    } else if (action === "run") {
      requireArg(planId, "backup plan");
      const run = createBackupRun(planId, reason.join(" ") || "manual");
      console.log(`${run.id}\t${run.path}`);
    } else {
      throw new Error("Backup command must be plans or run.");
    }
  } else if (command === "policy") {
    const result = evaluatePolicies();
    console.log(`Mode: ${result.mode}`);
    console.log(`Health: ${result.healthy ? "healthy" : "violations"}`);
    result.violations.forEach((violation) => console.log(`${violation.severity}\t${violation.policy}\t${violation.message}`));
  } else if (command === "experience") {
    const report = getExperienceReport();
    const [section = "summary"] = args;
    if (section === "commands") {
      report.commands.forEach((entry) => console.log(`${entry.keys}\t${entry.command}\t${entry.target}`));
    } else if (section === "defaults") {
      report.defaultApps.forEach((entry) => console.log(`${entry.type}\t${entry.handler}`));
    } else if (section === "snap") {
      report.snapLayouts.forEach((layout) => console.log(`${layout.id}\t${layout.name}\t${layout.slots.join(",")}`));
    } else {
      console.log(`Mode: ${report.mode}`);
      console.log(`Pinned: ${report.pinnedApps.join(", ")}`);
      console.log(`Taskbar zones: ${report.taskbarZones.map((zone) => zone.id).join(", ")}`);
      console.log(`Widgets: ${report.widgets.filter((widget) => widget.enabled).map((widget) => widget.name).join(", ")}`);
    }
  } else if (command === "ecosystem") {
    const report = getEcosystemReport();
    const [section = "summary"] = args;
    if (section === "apps") {
      report.apps.forEach((app) => console.log(`${app.id}\t${app.channel}\t${app.trust}\tinstalled=${app.installed}\t${app.name}`));
    } else if (section === "extensions") {
      report.extensionPoints.forEach((extension) => console.log(`${extension.id}\t${extension.capability}\treview=${extension.review}`));
    } else if (section === "protocols") {
      report.protocols.forEach((protocol) => console.log(`${protocol.scheme}://\t${protocol.handler}\t${protocol.description}`));
    } else if (section === "publish") {
      console.log(`Required files: ${report.publishing.requiredFiles.join(", ")}`);
      console.log(`Steps: ${report.publishing.steps.join(" -> ")}`);
      console.log(`Quality gates: ${report.publishing.qualityGates.join(", ")}`);
    } else {
      console.log(`Registry: ${report.registry}`);
      console.log(`Channels: ${report.channels.map((channel) => channel.id).join(", ")}`);
      console.log(`Apps: ${report.apps.length}`);
      console.log(`Extension points: ${report.extensionPoints.length}`);
      console.log(`Protocols: ${report.protocols.map((protocol) => protocol.scheme).join(", ")}`);
    }
  } else if (command === "hardening") {
    const report = getHardeningReport();
    const [section = "summary"] = args;
    if (section === "controls") {
      report.controls.forEach((control) => console.log(`${control.status}\t${control.severity}\t${control.domain}\t${control.id}\t${control.name}`));
    } else if (section === "threats") {
      report.threatModel.forEach((threat) => console.log(`${threat.id}\t${threat.risk}\t${threat.mitigation}`));
    } else if (section === "policy") {
      console.log(`runtime.defaultDeny=${report.runtimePolicy.defaultDeny}`);
      console.log(`runtime.promptOnFirstUse=${report.runtimePolicy.promptOnFirstUse}`);
      console.log(`store.stableRequiresSignature=${report.storePolicy.stableRequiresSignature}`);
      console.log(`network.blockUnsignedRuntimeNetwork=${report.networkPolicy.blockUnsignedRuntimeNetwork}`);
    } else {
      console.log(`Mode: ${report.mode}`);
      console.log(`Baseline: ${report.baseline.name} ${report.baseline.version}`);
      console.log(`Score: ${report.score}`);
      console.log(`Controls: ${report.controls.length}`);
      console.log(`Critical open: ${report.criticalOpen.length}`);
    }
  } else if (command === "kernel") {
    const graph = loadSystemGraph();
    console.log(`${graph.kernel.name} ${graph.kernel.version}`);
    console.log(`ABI: ${graph.kernel.abi}`);
    console.log(`Subsystems: ${graph.kernel.subsystems.join(", ")}`);
    console.log(`Modules:`);
    graph.kernel.modules.forEach((module) => console.log(`- ${module.name} ${module.version} ${module.loaded ? "loaded" : "available"} ${module.trust}`));
  } else if (command === "config") {
    const graph = loadSystemGraph();
    console.log(JSON.stringify(graph.system, null, 2));
  } else if (command === "logs") {
    readSystemLog(Number(args[0] ?? 20)).forEach((entry) => console.log(`${entry.timestamp}\t${entry.level}\t${entry.source}\t${entry.message}`));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`aether: ${error.message}`);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`AetherOS CLI

Commands:
  aether help
  aether doctor
  aether status
  aether targets
  aether boot plan [target]
  aether boot apply <target>
  aether recovery status
  aether recovery snapshot [label]
  aether recovery restore <snapshot>
  aether recovery points
  aether recovery point <name> [reason]
  aether recovery repair
  aether events [topic] [limit]
  aether event <topic> <message>
  aether kernel
  aether registry
  aether startup
  aether tasks
  aether updates
  aether crash bundle [reason]
  aether network status
  aether network profile <id>
  aether network firewall
  aether accounts
  aether storage
  aether audit [category] [limit]
  aether audit write <category> <message>
  aether backup plans
  aether backup run <plan> [reason]
  aether policy
  aether experience [commands|defaults|snap]
  aether ecosystem [apps|extensions|protocols|publish]
  aether hardening [controls|threats|policy]
  aether config
  aether services
  aether service <id> <running|stopped|faulted|enable|disable|logs|log>
  aether drivers
  aether driver <id> <running|stopped|faulted>
  aether packages
  aether pkg <install|remove|solve> <name>
  aether logs [limit]
`);
}

function requireArg(value, label) {
  if (!value) throw new Error(`Missing ${label}.`);
}

function requireStatus(status) {
  if (!["running", "stopped", "faulted"].includes(status)) throw new Error("Status must be running, stopped, or faulted.");
}

function printBootPlan(plan) {
  console.log(`Target: ${plan.target.id} (${plan.target.name})`);
  console.log(`Description: ${plan.target.description}`);
  console.log(`Flags: ${plan.flags.join(", ") || "none"}`);
  console.log("Drivers:");
  plan.drivers.forEach((driver) => {
    console.log(`- ${driver.id}\t${driver.status}\t${driver.className}\t${driver.mode}`);
  });
  console.log("Services:");
  plan.services.forEach((service, index) => {
    console.log(`${index + 1}. ${service.id}\t${service.status}\t${service.daemon}\trequires=[${service.requires.join(",") || "none"}]`);
  });
}

function printRecoveryReport(report) {
  console.log(`Policy: ${report.policy}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log(`Health: ${report.healthy ? "healthy" : "needs-attention"}`);
  if (!report.issues.length) {
    console.log("Issues: none");
    return;
  }
  console.log("Issues:");
  report.issues.forEach((issue) => {
    console.log(`- ${issue.severity}\t${issue.scope}\t${issue.id}\t${issue.message}`);
  });
}

function printPackagePlan(plan) {
  console.log(`Package: ${plan.package} ${plan.version}`);
  console.log(`Action: ${plan.action}`);
  console.log(`Allowed: ${plan.allowed}`);
  console.log(`Strategy: ${plan.strategy}`);
  console.log(`Missing dependencies: ${plan.missingDependencies.join(", ") || "none"}`);
  console.log(`Conflicts: ${plan.conflicts.join(", ") || "none"}`);
  console.log(`Required services: ${plan.requiredServices.join(", ") || "none"}`);
  console.log(`Required drivers: ${plan.requiredDrivers.join(", ") || "none"}`);
  console.log(`Rollback: ${plan.rollback}`);
}
