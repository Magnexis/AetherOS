use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use sysinfo::{Disks, System};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
struct SystemInfo {
    cpu_brand: String,
    cpu_cores: usize,
    total_memory_mb: u64,
    used_memory_mb: u64,
    os_name: String,
    kernel_version: String,
}

#[derive(Serialize)]
struct ProcessInfo {
    pid: String,
    name: String,
    memory_kb: u64,
    cpu_usage: f32,
}

#[derive(Serialize)]
struct LiveSystemInfo {
    cpu_brand: String,
    cpu_cores: usize,
    cpu_usage: f32,
    total_memory_mb: u64,
    used_memory_mb: u64,
    disk_total_gb: u64,
    disk_available_gb: u64,
    uptime_seconds: u64,
    os_name: String,
    kernel_version: String,
}

#[derive(Serialize)]
struct FsEntry {
    name: String,
    path: String,
    entry_type: String,
    size: u64,
    modified: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct PackageRecord {
    name: String,
    version: String,
    installed: bool,
    description: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct AetherAppManifest {
    id: String,
    name: String,
    version: String,
    author: String,
    permissions: Vec<String>,
    description: String,
    entry: String,
}

#[derive(Serialize)]
struct StorageInfo {
    app_data_dir: String,
    state_path: String,
    packages_path: String,
    apps_dir: String,
    trash_dir: String,
    quarantine_dir: String,
    search_db: String,
}

#[derive(Serialize)]
struct SearchRecord {
    title: String,
    path: String,
    record_type: String,
    size: u64,
    modified: String,
}

#[derive(Serialize, Deserialize)]
struct TrashEntry {
    name: String,
    original_path: String,
    trash_path: String,
    deleted_at: String,
}

#[derive(Serialize)]
struct ScanFinding {
    path: String,
    hash: String,
    severity: String,
    reason: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut system = System::new_all();
    system.refresh_all();
    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Simulated Aether CPU".to_string());

    SystemInfo {
        cpu_brand,
        cpu_cores: system.cpus().len(),
        total_memory_mb: system.total_memory() / 1024 / 1024,
        used_memory_mb: system.used_memory() / 1024 / 1024,
        os_name: System::name().unwrap_or_else(|| "Aether Host".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Phase 1".to_string()),
    }
}

#[tauri::command]
fn list_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_all();
    system
        .processes()
        .iter()
        .take(16)
        .map(|(pid, process)| ProcessInfo {
            pid: pid.to_string(),
            name: process.name().to_string_lossy().to_string(),
            memory_kb: process.memory(),
            cpu_usage: process.cpu_usage(),
        })
        .collect()
}

#[tauri::command]
fn kill_process(pid: String) -> Result<String, String> {
    let mut system = System::new_all();
    system.refresh_all();
    let target = system
        .processes()
        .iter()
        .find(|(process_pid, _)| process_pid.to_string() == pid)
        .map(|(_, process)| process);
    match target {
        Some(process) => {
            if process.kill() {
                Ok(format!("Terminate signal sent to {}", pid))
            } else {
                Err(format!("Unable to terminate {}", pid))
            }
        }
        None => Err(format!("Process not found: {}", pid)),
    }
}

#[tauri::command]
fn get_live_system_info() -> LiveSystemInfo {
    let mut system = System::new_all();
    system.refresh_all();
    let disks = Disks::new_with_refreshed_list();
    let disk_total = disks.iter().map(|disk| disk.total_space()).sum::<u64>();
    let disk_available = disks.iter().map(|disk| disk.available_space()).sum::<u64>();
    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Aether CPU".to_string());

    LiveSystemInfo {
        cpu_brand,
        cpu_cores: system.cpus().len(),
        cpu_usage: system.global_cpu_usage(),
        total_memory_mb: system.total_memory() / 1024 / 1024,
        used_memory_mb: system.used_memory() / 1024 / 1024,
        disk_total_gb: disk_total / 1024 / 1024 / 1024,
        disk_available_gb: disk_available / 1024 / 1024 / 1024,
        uptime_seconds: System::uptime(),
        os_name: System::name().unwrap_or_else(|| "Aether Host".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "unknown".to_string()),
    }
}

#[tauri::command]
fn get_os_version() -> String {
    format!(
        "{} {}",
        System::name().unwrap_or_else(|| "Unknown OS".to_string()),
        System::os_version().unwrap_or_else(|| "unknown version".to_string())
    )
}

#[tauri::command]
fn echo_command(input: String) -> String {
    format!("Aether core received: {}", input)
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Value, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_state(app: AppHandle, state: Value) -> Result<(), String> {
    let path = state_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FsEntry>, String> {
    let resolved = resolve_path(&path)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(resolved).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        entries.push(FsEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            entry_type: if metadata.is_dir() { "folder" } else { "file" }.to_string(),
            size: metadata.len(),
            modified,
        });
    }
    entries.sort_by(|a, b| a.entry_type.cmp(&b.entry_type).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
fn create_directory(path: String) -> Result<String, String> {
    let resolved = resolve_path(&path)?;
    fs::create_dir_all(&resolved).map_err(|error| error.to_string())?;
    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<String, String> {
    let from_path = resolve_path(&from)?;
    let to_path = resolve_path(&to)?;
    fs::rename(&from_path, &to_path).map_err(|error| error.to_string())?;
    Ok(to_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let resolved = resolve_path(&path)?;
    let metadata = fs::metadata(&resolved).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(resolved).map_err(|error| error.to_string())
    } else {
        fs::remove_file(resolved).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn copy_path(from: String, to: String) -> Result<String, String> {
    let from_path = resolve_path(&from)?;
    let to_path = resolve_path(&to)?;
    let metadata = fs::metadata(&from_path).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        copy_dir_all(&from_path, &to_path)?;
    } else {
        fs::copy(&from_path, &to_path).map_err(|error| error.to_string())?;
    }
    Ok(to_path.to_string_lossy().to_string())
}

#[tauri::command]
fn touch_file(path: String) -> Result<String, String> {
    let resolved = resolve_path(&path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&resolved)
        .map_err(|error| error.to_string())?;
    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let resolved = resolve_path(&path)?;
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &resolved.to_string_lossy()])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(resolved).spawn().map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(resolved).spawn().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_storage_info(app: AppHandle) -> Result<StorageInfo, String> {
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(StorageInfo {
        app_data_dir: data_dir.to_string_lossy().to_string(),
        state_path: state_path(&app)?.to_string_lossy().to_string(),
        packages_path: packages_path(&app)?.to_string_lossy().to_string(),
        apps_dir: apps_dir(&app)?.to_string_lossy().to_string(),
        trash_dir: trash_dir(&app)?.to_string_lossy().to_string(),
        quarantine_dir: quarantine_dir(&app)?.to_string_lossy().to_string(),
        search_db: search_db_path(&app)?.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn clear_cache(app: AppHandle) -> Result<String, String> {
    let cache = app.path().app_cache_dir().map_err(|error| error.to_string())?;
    if cache.exists() {
        fs::remove_dir_all(&cache).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    Ok(format!("Cleared cache at {}", cache.to_string_lossy()))
}

#[tauri::command]
fn reset_shell_state(app: AppHandle) -> Result<String, String> {
    for path in [state_path(&app)?, packages_path(&app)?, search_db_path(&app)?] {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok("AetherOS shell state reset. Restart the shell to rebuild defaults.".to_string())
}

#[tauri::command]
fn export_state(app: AppHandle) -> Result<String, String> {
    let state = if state_path(&app)?.exists() {
        fs::read_to_string(state_path(&app)?).map_err(|error| error.to_string())?
    } else {
        "{}".to_string()
    };
    let packages = load_packages(app)?;
    serde_json::to_string_pretty(&json!({ "state": serde_json::from_str::<Value>(&state).unwrap_or(json!({})), "packages": packages }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn import_state(app: AppHandle, state_json: String) -> Result<String, String> {
    let value: Value = serde_json::from_str(&state_json).map_err(|error| error.to_string())?;
    if let Some(state) = value.get("state") {
        save_state(app.clone(), state.clone())?;
    }
    if let Some(packages) = value.get("packages") {
        let parsed: Vec<PackageRecord> = serde_json::from_value(packages.clone()).map_err(|error| error.to_string())?;
        save_packages_to_path(&packages_path(&app)?, &parsed)?;
    }
    Ok("Imported AetherOS state bundle.".to_string())
}

#[tauri::command]
fn get_known_folders() -> Vec<(String, String)> {
    known_folders()
        .into_iter()
        .map(|(name, path)| (name.to_string(), path.to_string_lossy().to_string()))
        .collect()
}

#[tauri::command]
fn load_packages(app: AppHandle) -> Result<Vec<PackageRecord>, String> {
    let path = packages_path(&app)?;
    if !path.exists() {
        let packages = default_packages();
        save_packages_to_path(&path, &packages)?;
        return Ok(packages);
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_app_manifests(app: AppHandle) -> Result<Vec<AetherAppManifest>, String> {
    ensure_app_runtime_dirs(app.clone())?;
    let mut manifests = Vec::new();
    for entry in fs::read_dir(apps_dir(&app)?).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let manifest_path = entry.path().join("aether.app.json");
        if manifest_path.exists() {
            let text = fs::read_to_string(manifest_path).map_err(|error| error.to_string())?;
            manifests.push(serde_json::from_str(&text).map_err(|error| error.to_string())?);
        }
    }
    Ok(manifests)
}

#[tauri::command]
fn ensure_app_runtime_dirs(app: AppHandle) -> Result<String, String> {
    let dir = apps_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let demo_dir = dir.join("notes.studio");
    fs::create_dir_all(&demo_dir).map_err(|error| error.to_string())?;
    let manifest_path = demo_dir.join("aether.app.json");
    if !manifest_path.exists() {
        let manifest = AetherAppManifest {
            id: "notes.studio".into(),
            name: "Notes Studio Native".into(),
            version: "1.0.0".into(),
            author: "Aether Labs".into(),
            permissions: vec!["filesystem.read".into(), "notifications".into()],
            description: "Native manifest-loaded app stored in the Aether apps folder.".into(),
            entry: "index.html".into(),
        };
        fs::write(&manifest_path, serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        fs::write(demo_dir.join("index.html"), "<h1>Notes Studio Native</h1><p>Loaded from the Aether app runtime folder.</p>")
            .map_err(|error| error.to_string())?;
    }
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn open_app_webview(app: AppHandle, app_id: String) -> Result<String, String> {
    let label = format!("aether-app-{}", app_id.replace('.', "-"));
    let url = tauri::WebviewUrl::App("index.html".into());
    tauri::WebviewWindowBuilder::new(&app, label.clone(), url)
        .title(format!("Aether App: {}", app_id))
        .inner_size(760.0, 520.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(format!("Opened isolated Tauri webview for {}", app_id))
}

#[tauri::command]
fn install_package_file(app: AppHandle, package_path: String) -> Result<Vec<PackageRecord>, String> {
    let resolved = resolve_path(&package_path)?;
    let text = fs::read_to_string(&resolved).map_err(|error| error.to_string())?;
    let manifest: Value = serde_json::from_str(&text).map_err(|error| format!("Invalid .aetherpkg manifest: {}", error))?;
    let name = manifest.get("name").and_then(Value::as_str).ok_or("Package missing name")?.to_string();
    let version = manifest.get("version").and_then(Value::as_str).unwrap_or("0.1.0").to_string();
    let description = manifest.get("description").and_then(Value::as_str).unwrap_or("Installed from local .aetherpkg").to_string();
    let mut packages = load_packages(app.clone())?;
    if let Some(existing) = packages.iter_mut().find(|package| package.name == name) {
        existing.version = version;
        existing.description = description;
        existing.installed = true;
    } else {
        packages.push(PackageRecord { name, version, installed: true, description });
    }
    save_packages_to_path(&packages_path(&app)?, &packages)?;
    Ok(packages)
}

#[tauri::command]
fn install_package(app: AppHandle, name: String) -> Result<Vec<PackageRecord>, String> {
    mutate_package(app, name, true)
}

#[tauri::command]
fn remove_package(app: AppHandle, name: String) -> Result<Vec<PackageRecord>, String> {
    mutate_package(app, name, false)
}

#[tauri::command]
fn build_search_index(app: AppHandle) -> Result<usize, String> {
    let db = Connection::open(search_db_path(&app)?).map_err(|error| error.to_string())?;
    db.execute(
        "CREATE TABLE IF NOT EXISTS files (title TEXT, path TEXT PRIMARY KEY, kind TEXT, size INTEGER, modified TEXT)",
        [],
    ).map_err(|error| error.to_string())?;
    db.execute("DELETE FROM files", []).map_err(|error| error.to_string())?;
    let mut count = 0;
    for (_, folder) in known_folders() {
        index_folder(&db, &folder, 0, &mut count)?;
    }
    Ok(count)
}

#[tauri::command]
fn search_files(app: AppHandle, query: String) -> Result<Vec<SearchRecord>, String> {
    let db = Connection::open(search_db_path(&app)?).map_err(|error| error.to_string())?;
    db.execute(
        "CREATE TABLE IF NOT EXISTS files (title TEXT, path TEXT PRIMARY KEY, kind TEXT, size INTEGER, modified TEXT)",
        [],
    ).map_err(|error| error.to_string())?;
    let pattern = format!("%{}%", query);
    let mut statement = db.prepare("SELECT title, path, kind, size, modified FROM files WHERE title LIKE ?1 OR path LIKE ?1 LIMIT 50")
        .map_err(|error| error.to_string())?;
    let rows = statement.query_map(params![pattern], |row| {
        Ok(SearchRecord {
            title: row.get(0)?,
            path: row.get(1)?,
            record_type: row.get(2)?,
            size: row.get::<_, i64>(3)? as u64,
            modified: row.get(4)?,
        })
    }).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn move_to_trash(app: AppHandle, path: String) -> Result<TrashEntry, String> {
    let resolved = resolve_path(&path)?;
    let trash = trash_dir(&app)?;
    fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
    let name = resolved.file_name().and_then(|name| name.to_str()).unwrap_or("trashed-item").to_string();
    let stamp = System::uptime().to_string();
    let trash_path = trash.join(format!("{}-{}", stamp, name));
    fs::rename(&resolved, &trash_path).map_err(|error| error.to_string())?;
    let entry = TrashEntry {
        name,
        original_path: resolved.to_string_lossy().to_string(),
        trash_path: trash_path.to_string_lossy().to_string(),
        deleted_at: stamp,
    };
    append_json_line(trash.join("trash-index.jsonl"), &entry)?;
    Ok(entry)
}

#[tauri::command]
fn list_trash(app: AppHandle) -> Result<Vec<TrashEntry>, String> {
    let index = trash_dir(&app)?.join("trash-index.jsonl");
    if !index.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(index).map_err(|error| error.to_string())?;
    Ok(text.lines().filter_map(|line| serde_json::from_str(line).ok()).collect())
}

#[tauri::command]
fn restore_from_trash(trash_path: String, original_path: String) -> Result<String, String> {
    let trash = PathBuf::from(trash_path);
    let original = PathBuf::from(original_path);
    if let Some(parent) = original.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(&trash, &original).map_err(|error| error.to_string())?;
    Ok(original.to_string_lossy().to_string())
}

#[tauri::command]
fn permanently_delete(path: String) -> Result<String, String> {
    let resolved = PathBuf::from(path);
    if resolved.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|error| error.to_string())?;
    } else {
        fs::remove_file(&resolved).map_err(|error| error.to_string())?;
    }
    Ok("Permanently deleted item.".to_string())
}

#[tauri::command]
fn scan_path(app: AppHandle, path: String) -> Result<Vec<ScanFinding>, String> {
    let resolved = resolve_path(&path)?;
    let mut findings = Vec::new();
    scan_entry(&resolved, &mut findings)?;
    let scan_log = app.path().app_data_dir().map_err(|error| error.to_string())?.join("scan-history.json");
    fs::write(scan_log, serde_json::to_string_pretty(&findings).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    Ok(findings)
}

#[tauri::command]
fn quarantine_path(app: AppHandle, path: String) -> Result<String, String> {
    let resolved = resolve_path(&path)?;
    let quarantine = quarantine_dir(&app)?;
    fs::create_dir_all(&quarantine).map_err(|error| error.to_string())?;
    let name = resolved.file_name().and_then(|name| name.to_str()).unwrap_or("quarantined-item");
    let destination = quarantine.join(name);
    fs::rename(&resolved, &destination).map_err(|error| error.to_string())?;
    Ok(destination.to_string_lossy().to_string())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("aether-state.json"))
}

fn packages_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("packages.json"))
}

fn apps_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("apps"))
}

fn trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("trash"))
}

fn quarantine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("quarantine"))
}

fn search_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("search-index.sqlite"))
}

fn resolve_path(input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.contains("..") || trimmed.contains('\0') {
        return Err("Invalid path: traversal outside allowed directories is blocked".to_string());
    }
    for (name, path) in known_folders() {
        if trimmed.eq_ignore_ascii_case(name) {
            return Ok(path);
        }
        let slash_prefix = format!("{}/", name);
        let backslash_prefix = format!("{}\\", name);
        if trimmed.to_lowercase().starts_with(&slash_prefix.to_lowercase())
            || trimmed.to_lowercase().starts_with(&backslash_prefix.to_lowercase())
        {
            let relative = trimmed[name.len()..].trim_start_matches(['/', '\\']);
            return Ok(path.join(relative));
        }
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(home_dir().join(path))
    }
}

fn home_dir() -> PathBuf {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn known_folders() -> Vec<(&'static str, PathBuf)> {
    let home = home_dir();
    vec![
        ("Home", home.clone()),
        ("Desktop", home.join("Desktop")),
        ("Documents", home.join("Documents")),
        ("Downloads", home.join("Downloads")),
        ("Pictures", home.join("Pictures")),
        ("System", env::current_dir().unwrap_or_else(|_| home.clone())),
        ("Applications", env::current_exe().ok().and_then(|path| path.parent().map(Path::to_path_buf)).unwrap_or(home)),
    ]
}

fn copy_dir_all(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(from).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let destination = to.join(entry.file_name());
        if entry.metadata().map_err(|error| error.to_string())?.is_dir() {
            copy_dir_all(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn default_packages() -> Vec<PackageRecord> {
    vec![
        PackageRecord { name: "aether-terminal".into(), version: "1.1.0".into(), installed: true, description: "Command shell for Rust-backed AetherOS operations.".into() },
        PackageRecord { name: "aether-files".into(), version: "1.1.0".into(), installed: true, description: "Filesystem explorer backed by native Rust commands.".into() },
        PackageRecord { name: "aether-settings".into(), version: "1.1.0".into(), installed: true, description: "Persistent system preferences and session controls.".into() },
        PackageRecord { name: "aether-monitor".into(), version: "1.1.0".into(), installed: true, description: "Live host metrics and process monitor.".into() },
        PackageRecord { name: "aether-devtools".into(), version: "0.2.0".into(), installed: true, description: "Developer console for shell diagnostics.".into() },
        PackageRecord { name: "demo-app".into(), version: "0.4.2".into(), installed: false, description: "Example package used to prove install and remove flows.".into() },
    ]
}

fn save_packages_to_path(path: &Path, packages: &[PackageRecord]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, serde_json::to_string_pretty(packages).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

fn mutate_package(app: AppHandle, name: String, installed: bool) -> Result<Vec<PackageRecord>, String> {
    let path = packages_path(&app)?;
    let mut packages = load_packages(app)?;
    let package = packages.iter_mut().find(|package| package.name == name).ok_or_else(|| format!("Package not found: {}", name))?;
    if !installed && package.name.starts_with("aether-") {
        return Err(format!("{} is a protected core package", package.name));
    }
    package.installed = installed;
    save_packages_to_path(&path, &packages)?;
    Ok(packages)
}

fn index_folder(db: &Connection, folder: &Path, depth: usize, count: &mut usize) -> Result<(), String> {
    if depth > 2 || !folder.exists() {
        return Ok(());
    }
    let Ok(entries) = fs::read_dir(folder) else {
        return Ok(());
    };
    for entry in entries.flatten().take(250) {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_default();
        let kind = if metadata.is_dir() { "folder" } else { "file" };
        db.execute(
            "INSERT OR REPLACE INTO files (title, path, kind, size, modified) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                entry.file_name().to_string_lossy().to_string(),
                entry.path().to_string_lossy().to_string(),
                kind,
                metadata.len() as i64,
                modified
            ],
        ).map_err(|error| error.to_string())?;
        *count += 1;
        if metadata.is_dir() {
            index_folder(db, &entry.path(), depth + 1, count)?;
        }
    }
    Ok(())
}

fn append_json_line<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    let mut text = if path.exists() { fs::read_to_string(&path).map_err(|error| error.to_string())? } else { String::new() };
    text.push_str(&serde_json::to_string(value).map_err(|error| error.to_string())?);
    text.push('\n');
    fs::write(path, text).map_err(|error| error.to_string())
}

fn scan_entry(path: &Path, findings: &mut Vec<ScanFinding>) -> Result<(), String> {
    if path.is_dir() {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())?.flatten().take(500) {
            scan_entry(&entry.path(), findings)?;
        }
        return Ok(());
    }
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return Ok(());
    };
    let suspicious = [".exe", ".scr", ".bat", ".cmd", ".ps1", ".vbs"].iter().any(|extension| name.to_lowercase().ends_with(extension))
        || name.to_lowercase().contains("keygen")
        || name.to_lowercase().contains("crack");
    if suspicious {
        let file = fs::File::open(path).map_err(|error| error.to_string())?;
        let mut buffer = Vec::new();
        file.take(1024 * 1024).read_to_end(&mut buffer).map_err(|error| error.to_string())?;
        let hash = hex::encode(Sha256::digest(&buffer));
        findings.push(ScanFinding {
            path: path.to_string_lossy().to_string(),
            hash,
            severity: if name.to_lowercase().contains("crack") { "high" } else { "medium" }.to_string(),
            reason: "Suspicious extension or name matched Aether Shield rules.".to_string(),
        });
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_live_system_info,
            list_processes,
            kill_process,
            get_os_version,
            echo_command,
            load_state,
            save_state,
            list_directory,
            create_directory,
            rename_path,
            delete_path,
            copy_path,
            touch_file,
            open_path,
            get_storage_info,
            clear_cache,
            reset_shell_state,
            export_state,
            import_state,
            get_known_folders,
            load_packages,
            load_app_manifests,
            ensure_app_runtime_dirs,
            open_app_webview,
            install_package_file,
            install_package,
            remove_package,
            build_search_index,
            search_files,
            move_to_trash,
            list_trash,
            restore_from_trash,
            permanently_delete,
            scan_path,
            quarantine_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherOS");
}

fn main() {
    run();
}
