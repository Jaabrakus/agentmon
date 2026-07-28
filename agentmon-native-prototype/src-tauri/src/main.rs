use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, ChildStdout, Command, Output, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};

const MAX_TRANSIENT_PROMPT_BYTES: usize = 128 * 1024;
const COMPANION_PORT: u16 = 4765;
const PROVIDER_KEYCHAIN_SERVICE: &str = "com.agentmon.desktop.model-provider";
static PROVIDER_CREDENTIAL_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default)]
struct CompanionManager {
    child: Option<Child>,
    stdout: Option<BufReader<ChildStdout>>,
    pairing_code: Option<String>,
    desktop_token: Option<String>,
}

impl CompanionManager {
    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdout = None;
        self.pairing_code = None;
        self.desktop_token = None;
    }
}

impl Drop for CompanionManager {
    fn drop(&mut self) {
        self.stop();
    }
}

fn find_project_root() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("AGENTMON_PROJECT_ROOT") {
        let configured = PathBuf::from(configured);
        fs::create_dir_all(&configured).map_err(|error| {
            format!("Could not create the configured Agentmon habitat: {error}")
        })?;
        return Ok(configured);
    }
    let mut candidates = Vec::new();
    if let Ok(current) = env::current_dir() {
        candidates.extend(current.ancestors().map(Path::to_path_buf));
    }
    if let Ok(executable) = env::current_exe() {
        candidates.extend(executable.ancestors().map(Path::to_path_buf));
    }
    candidates.extend(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .map(Path::to_path_buf),
    );

    candidates
        .into_iter()
        .find(|candidate| {
            candidate
                .join(".agentmon/roster/main/agentmon.json")
                .is_file()
                || candidate
                    .join("plugins/agentmon-codex/desktop-app/desktop-downlink-service.mjs")
                    .is_file()
        })
        .map(Ok)
        .unwrap_or_else(default_habitat_root)
}

fn default_habitat_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    let user_home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "The user folder could not be located.".to_string())?;
    #[cfg(target_os = "macos")]
    let root = user_home.join("Library/Application Support/Agentmon/Habitat");

    #[cfg(target_os = "windows")]
    let root = env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .map(PathBuf::from)
        .ok_or_else(|| "The Windows application-data folder could not be located.".to_string())?
        .join("Agentmon/Habitat");

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let root = env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or_else(|| "The application-data folder could not be located.".to_string())?
        .join("agentmon/habitat");

    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create the local Agentmon habitat: {error}"))?;
    Ok(root)
}

fn bundled_resource_root() -> Option<PathBuf> {
    let executable = env::current_exe().ok()?;
    #[cfg(target_os = "macos")]
    return executable
        .parent()
        .and_then(Path::parent)
        .map(|contents| contents.join("Resources"));
    #[cfg(target_os = "windows")]
    return executable
        .parent()
        .map(|directory| directory.join("resources"));
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return executable
        .parent()
        .map(|directory| directory.join("resources"));
}

fn find_engine_root(project_root: &Path) -> Result<PathBuf, String> {
    let relative = "plugins/agentmon-codex/desktop-app/desktop-downlink-service.mjs";
    if project_root.join(relative).is_file() {
        return Ok(project_root.to_path_buf());
    }
    let bundled = bundled_resource_root()
        .map(|root| root.join("runtime"))
        .filter(|root| root.join(relative).is_file());
    bundled.ok_or_else(|| "The bundled Agentmon engine runtime is missing.".to_string())
}

fn find_node() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(resources) = bundled_resource_root() {
        candidates.push(resources.join("bin/node.exe"));
        candidates.push(resources.join("bin/node"));
    }
    if let Some(search_path) = env::var_os("PATH") {
        for directory in env::split_paths(&search_path) {
            candidates.push(directory.join(if cfg!(target_os = "windows") {
                "node.exe"
            } else {
                "node"
            }));
        }
    }
    #[cfg(target_os = "macos")]
    candidates.extend([
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ]);
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            "The bundled Agentmon runtime is missing and Node.js was not found on PATH.".into()
        })
}

fn find_codex() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(configured) = env::var_os("AGENTMON_CODEX_BIN") {
        candidates.push(PathBuf::from(configured));
    }
    #[cfg(target_os = "macos")]
    candidates.extend([
        PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
        PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ]);
    if let Some(search_path) = env::var_os("PATH") {
        for directory in env::split_paths(&search_path) {
            candidates.push(directory.join(if cfg!(target_os = "windows") {
                "codex.exe"
            } else {
                "codex"
            }));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            "Codex was not found. Install Codex or set AGENTMON_CODEX_BIN, then try again.".into()
        })
}

fn command_output_with_timeout(
    mut command: Command,
    timeout: Duration,
    label: &str,
) -> Result<Output, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start {label}: {error}"))?;
    child_output_with_timeout(&mut child, timeout, label)
}

fn child_output_with_timeout(
    child: &mut Child,
    timeout: Duration,
    label: &str,
) -> Result<Output, String> {
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Could not read {label} output."))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Could not read {label} errors."))?;
    let stdout_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).map(|_| bytes)
    });
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).map(|_| bytes)
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not inspect {label}: {error}"))?
        {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(format!(
                "{label} timed out after {} seconds and was stopped.",
                timeout.as_secs()
            ));
        }
        thread::sleep(Duration::from_millis(50));
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| format!("Could not join the {label} output reader."))?
        .map_err(|error| format!("Could not read {label} output: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| format!("Could not join the {label} error reader."))?
        .map_err(|error| format!("Could not read {label} errors: {error}"))?;
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

async fn run_blocking<T, F>(job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| format!("The local background task could not finish: {error}"))?
}

fn run_codex_json(codex: &Path, root: &Path, args: &[&str]) -> Result<Value, String> {
    let mut command = Command::new(codex);
    command.args(args).current_dir(root);
    let output = command_output_with_timeout(command, Duration::from_secs(15), "Codex setup")?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            format!("Codex setup failed with status {}.", output.status)
        } else {
            message
        });
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Codex returned an invalid setup receipt: {error}"))
}

fn plugin_status_from_list(value: &Value) -> Value {
    let installed = value
        .get("installed")
        .and_then(Value::as_array)
        .and_then(|plugins| {
            plugins.iter().find(|plugin| {
                plugin.get("pluginId").and_then(Value::as_str)
                    == Some("agentmon-codex@agentmon-local")
            })
        });
    json!({
        "installed": installed.is_some(),
        "enabled": installed.and_then(|plugin| plugin.get("enabled")).and_then(Value::as_bool).unwrap_or(false),
        "version": installed.and_then(|plugin| plugin.get("version")).and_then(Value::as_str),
    })
}

fn codex_plugin_status_value() -> Result<Value, String> {
    let root = find_project_root()?;
    let codex = find_codex()?;
    let list = run_codex_json(&codex, &root, &["plugin", "list", "--json"])?;
    let mut status = plugin_status_from_list(&list);
    status["codexFound"] = Value::Bool(true);
    status["projectRoot"] = Value::String(root.display().to_string());
    Ok(status)
}

fn same_location(left: &Path, right: &Path) -> bool {
    left.canonicalize().unwrap_or_else(|_| left.to_path_buf())
        == right.canonicalize().unwrap_or_else(|_| right.to_path_buf())
}

fn ensure_agentmon_marketplace(codex: &Path, root: &Path) -> Result<(), String> {
    let listing = run_codex_json(codex, root, &["plugin", "marketplace", "list", "--json"])?;
    let existing = listing
        .get("marketplaces")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("name").and_then(Value::as_str) == Some("agentmon-local"))
        });
    if let Some(existing) = existing {
        let existing_root = existing
            .get("root")
            .and_then(Value::as_str)
            .map(PathBuf::from);
        if existing_root
            .as_deref()
            .is_some_and(|path| same_location(path, root))
        {
            return Ok(());
        }
        run_codex_json(
            codex,
            root,
            &[
                "plugin",
                "marketplace",
                "remove",
                "agentmon-local",
                "--json",
            ],
        )?;
    }
    let root_arg = root
        .to_str()
        .ok_or_else(|| "The Agentmon project path is not valid UTF-8.".to_string())?;
    run_codex_json(
        codex,
        root,
        &["plugin", "marketplace", "add", root_arg, "--json"],
    )?;
    Ok(())
}

fn deploy_main_runtime(root: &Path) -> Result<bool, String> {
    let engine_root = find_engine_root(root)?;
    let script = engine_root.join("plugins/agentmon-codex/scripts/agentmon.mjs");
    if !root.join(".agentmon/roster/main/agentmon.json").is_file() {
        return Ok(false);
    }
    let mut command = Command::new(find_node()?);
    command
        .arg(script)
        .arg("deploy")
        .arg("--slot")
        .arg("main")
        .current_dir(root);
    let output = command_output_with_timeout(
        command,
        Duration::from_secs(30),
        "the Agentmon runtime pack",
    )?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "The Agentmon runtime pack could not be prepared.".into()
        } else {
            message
        });
    }
    Ok(true)
}

fn run_engine(command: &str, prompt: Option<&str>) -> Result<Value, String> {
    if prompt.is_some_and(|value| value.len() > MAX_TRANSIENT_PROMPT_BYTES) {
        return Err("Prompt is too large for the transient local downlink compiler.".into());
    }
    let root = find_project_root()?;
    let engine_root = find_engine_root(&root)?;
    run_engine_with_roots(command, prompt, &root, &engine_root)
}

fn run_engine_with_roots(
    command: &str,
    prompt: Option<&str>,
    root: &Path,
    engine_root: &Path,
) -> Result<Value, String> {
    let bundled_bridge =
        bundled_resource_root().map(|resources| resources.join("scripts/downlink-bridge.mjs"));
    let bridge = bundled_bridge
        .filter(|path| path.is_file())
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/downlink-bridge.mjs")
        });
    let mut child = Command::new(find_node()?)
        .arg("--disable-warning=ExperimentalWarning")
        .arg(&bridge)
        .arg(command)
        .arg(&root)
        .arg(&engine_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the local Agentmon engine: {error}"))?;

    if let Some(prompt) = prompt {
        child
            .stdin
            .take()
            .ok_or_else(|| "Could not open the private compiler input.".to_string())?
            .write_all(prompt.as_bytes())
            .map_err(|error| format!("Could not send the prompt to the local compiler: {error}"))?;
    }
    drop(child.stdin.take());

    let output = child_output_with_timeout(
        &mut child,
        Duration::from_secs(10),
        "the local Agentmon compiler",
    )?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "The local Agentmon compiler failed without an error message.".into()
        } else {
            message
        });
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Agentmon returned an invalid local receipt: {error}"))
}

fn run_lifecycle(command: &str, input: Option<&Value>) -> Result<Value, String> {
    let root = find_project_root()?;
    let engine_root = find_engine_root(&root)?;
    let bridge = bundled_resource_root()
        .map(|resources| resources.join("scripts/lifecycle-bridge.mjs"))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/lifecycle-bridge.mjs")
        });
    let mut child = Command::new(find_node()?)
        .arg("--disable-warning=ExperimentalWarning")
        .arg(&bridge)
        .arg(command)
        .arg(&root)
        .arg(&engine_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the Agentmon lifecycle engine: {error}"))?;

    if let Some(input) = input {
        let payload = serde_json::to_vec(input)
            .map_err(|error| format!("Could not encode lifecycle input: {error}"))?;
        if payload.len() > 64 * 1024 {
            return Err("Lifecycle input exceeds the 64 KiB local limit.".into());
        }
        child
            .stdin
            .take()
            .ok_or_else(|| "Could not open the private lifecycle input.".to_string())?
            .write_all(&payload)
            .map_err(|error| format!("Could not send lifecycle input: {error}"))?;
    }
    drop(child.stdin.take());
    let output = child_output_with_timeout(
        &mut child,
        Duration::from_secs(30),
        "the Agentmon lifecycle engine",
    )?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "The Agentmon lifecycle engine failed.".into()
        } else {
            message
        });
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Agentmon returned an invalid lifecycle receipt: {error}"))
}

fn load_local_source(source: &str) -> Result<Value, String> {
    let root = find_project_root()?;
    load_local_source_from(&root, source)
}

fn load_local_source_from(root: &Path, source: &str) -> Result<Value, String> {
    let (name, relative, kind) = match source {
        "skill" => ("SKILL.md", ".agentmon/roster/main/SKILL.md", "text"),
        "state" => (
            "agentmon.json",
            ".agentmon/roster/main/agentmon.json",
            "json",
        ),
        "visual" => (
            "visual/agentmon.png",
            ".agentmon/roster/main/visual/agentmon.png",
            "image",
        ),
        _ => return Err("That source is not in the read-only Agentmon file allowlist.".into()),
    };
    let path = root.join(relative);
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    match kind {
        "image" => Ok(json!({
            "source": source,
            "name": name,
            "path": path,
            "kind": kind,
            "dataUrl": format!("data:image/png;base64,{}", BASE64.encode(bytes)),
        })),
        "json" => {
            let value: Value = serde_json::from_slice(&bytes)
                .map_err(|error| format!("The Agentmon state file is invalid JSON: {error}"))?;
            let content = serde_json::to_string_pretty(&value)
                .map_err(|error| format!("Could not format Agentmon state: {error}"))?;
            Ok(
                json!({ "source": source, "name": name, "path": path, "kind": kind, "content": content }),
            )
        }
        _ => {
            let content = String::from_utf8(bytes)
                .map_err(|_| "SKILL.md is not valid UTF-8 text.".to_string())?;
            Ok(
                json!({ "source": source, "name": name, "path": path, "kind": kind, "content": content }),
            )
        }
    }
}

fn copy_extension_tree(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Could not create the extension folder {}: {error}",
            destination.display()
        )
    })?;
    for entry in std::fs::read_dir(source)
        .map_err(|error| format!("Could not read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("Could not read an extension file: {error}"))?;
        let kind = entry
            .file_type()
            .map_err(|error| format!("Could not inspect an extension file: {error}"))?;
        let target = destination.join(entry.file_name());
        if kind.is_dir() {
            copy_extension_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), &target).map_err(|error| {
                format!(
                    "Could not copy the extension file {}: {error}",
                    entry.path().display()
                )
            })?;
        } else {
            return Err(
                "The verified extension contains an unsupported link or device file.".into(),
            );
        }
    }
    Ok(())
}

fn chrome_extension_destination() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    let user_home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "The user folder could not be located.".to_string())?;
    #[cfg(target_os = "macos")]
    return Ok(user_home.join("Library/Application Support/Agentmon/ChromeExtension"));

    #[cfg(target_os = "windows")]
    return env::var_os("LOCALAPPDATA")
        .or_else(|| env::var_os("APPDATA"))
        .map(PathBuf::from)
        .map(|root| root.join("Agentmon/ChromeExtension"))
        .ok_or_else(|| "The Windows application-data folder could not be located.".to_string());

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return env::var_os("HOME")
        .map(PathBuf::from)
        .map(|root| root.join(".local/share/agentmon/ChromeExtension"))
        .ok_or_else(|| "The user folder could not be located.".to_string());
}

#[cfg(target_os = "macos")]
fn open_chrome_extensions_blocking() -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .args(["-a", "Google Chrome", "chrome://extensions"])
        .status()
        .map_err(|error| format!("Could not open Google Chrome: {error}"))?;
    if !status.success() {
        return Err("Google Chrome could not open its Extensions page.".into());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_chrome_extensions_blocking() -> Result<(), String> {
    let mut candidates = Vec::new();
    for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Some(root) = env::var_os(variable) {
            candidates.push(PathBuf::from(root).join("Google/Chrome/Application/chrome.exe"));
        }
    }
    if let Some(search_path) = env::var_os("PATH") {
        candidates.extend(env::split_paths(&search_path).map(|path| path.join("chrome.exe")));
    }
    let chrome = candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "Google Chrome was not found on this Windows PC.".to_string())?;
    let status = Command::new(chrome)
        .arg("chrome://extensions")
        .status()
        .map_err(|error| format!("Could not open Google Chrome: {error}"))?;
    if !status.success() {
        return Err("Google Chrome could not open its Extensions page.".into());
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn open_chrome_extensions_blocking() -> Result<(), String> {
    Err("Opening Chrome Extensions is currently supported on macOS and Windows.".into())
}

fn copy_text_to_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut clipboard = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not open the local clipboard: {error}"))?;

    #[cfg(target_os = "windows")]
    let mut clipboard = Command::new("clip.exe")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not open the local clipboard: {error}"))?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err("Clipboard integration is currently supported on macOS and Windows.".into());

    clipboard
        .stdin
        .take()
        .ok_or_else(|| "Could not write to the local clipboard.".to_string())?
        .write_all(text.as_bytes())
        .map_err(|error| format!("Could not copy text: {error}"))?;
    let status = clipboard
        .wait()
        .map_err(|error| format!("Clipboard command failed: {error}"))?;
    if !status.success() {
        return Err("The clipboard command did not finish successfully.".into());
    }
    Ok(())
}

fn reveal_extension_manifest(path: &Path) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("/usr/bin/open").arg("-R").arg(path).status();
    #[cfg(target_os = "windows")]
    let _ = Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .status();
}

fn install_chrome_extension_blocking() -> Result<Value, String> {
    let root = find_project_root()?;
    let engine_root = find_engine_root(&root)?;
    let source = engine_root.join("plugins/agentmon-codex/browser-extension");
    if !source.join("manifest.json").is_file() {
        return Err("The verified Agentmon Chrome extension is missing from this project.".into());
    }

    let destination = chrome_extension_destination()?;
    let parent = destination
        .parent()
        .ok_or_else(|| "The Agentmon Application Support folder is invalid.".to_string())?;
    let staging = parent.join("ChromeExtension.installing");
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    if staging.exists() {
        std::fs::remove_dir_all(&staging)
            .map_err(|error| format!("Could not clear the extension staging folder: {error}"))?;
    }
    copy_extension_tree(&source, &staging)?;
    if destination.exists() {
        std::fs::remove_dir_all(&destination)
            .map_err(|error| format!("Could not replace the prior Agentmon extension: {error}"))?;
    }
    std::fs::rename(&staging, &destination)
        .map_err(|error| format!("Could not finish installing the extension: {error}"))?;

    let destination_text = destination.display().to_string();
    copy_text_to_clipboard(&destination_text)?;

    open_chrome_extensions_blocking()?;
    reveal_extension_manifest(&destination.join("manifest.json"));

    Ok(json!({
        "path": destination_text,
        "message": "Extension ready. Its folder path was copied; choose Load unpacked in Chrome.",
        "privacy": "Static extension files only; no prompt data was exported.",
    }))
}

#[tauri::command]
async fn open_chrome_extensions() -> Result<(), String> {
    run_blocking(open_chrome_extensions_blocking).await
}

#[tauri::command]
async fn install_chrome_extension() -> Result<Value, String> {
    run_blocking(install_chrome_extension_blocking).await
}

fn stopped_snapshot(error: Option<&str>) -> Value {
    json!({
        "running": false,
        "pairingCode": null,
        "browser": { "paired": false, "site": null, "siteEnabled": false, "promptCount": 0, "activeAgentmon": null },
        "localModel": { "configured": false, "model": null },
        "modelProvider": { "provider": "local", "model": null },
        "privacy": { "retention": "derived-only-browser", "rawBrowserPromptsStored": false },
        "error": error,
    })
}

fn companion_token(state: &Arc<Mutex<CompanionManager>>) -> Result<String, String> {
    let mut manager = state
        .lock()
        .map_err(|_| "The companion state lock was poisoned.".to_string())?;
    let Some(child) = manager.child.as_mut() else {
        return Err("Turn Agentmon on before connecting a local model.".into());
    };
    if child
        .try_wait()
        .map_err(|error| format!("Could not inspect the companion process: {error}"))?
        .is_some()
    {
        manager.stop();
        return Err("The local companion stopped. Turn Agentmon on and try again.".into());
    }
    manager
        .desktop_token
        .clone()
        .ok_or_else(|| "The companion started without a desktop token.".to_string())
}

fn companion_json_request(
    state: Arc<Mutex<CompanionManager>>,
    method: &str,
    path: &str,
    body: Option<Value>,
    timeout: Duration,
) -> Result<Value, String> {
    let token = companion_token(&state)?;
    let body = body
        .map(|value| serde_json::to_vec(&value))
        .transpose()
        .map_err(|error| format!("Could not encode the local request: {error}"))?
        .unwrap_or_default();
    let address = SocketAddr::from(([127, 0, 0, 1], COMPANION_PORT));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(750))
        .map_err(|error| format!("The local Agentmon gateway is unavailable: {error}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|error| format!("Could not set the local model timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Could not set the gateway write timeout: {error}"))?;
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{COMPANION_PORT}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .map_err(|error| format!("Could not contact the local Agentmon gateway: {error}"))?;
    if !body.is_empty() {
        stream
            .write_all(&body)
            .map_err(|error| format!("Could not send the local model request: {error}"))?;
    }
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|error| {
        if error.kind() == std::io::ErrorKind::WouldBlock
            || error.kind() == std::io::ErrorKind::TimedOut
        {
            "The local model took too long to answer.".to_string()
        } else {
            format!("Could not read the local Agentmon gateway response: {error}")
        }
    })?;
    let marker = b"\r\n\r\n";
    let body_at = response
        .windows(marker.len())
        .position(|window| window == marker)
        .map(|index| index + marker.len())
        .ok_or_else(|| {
            "The local Agentmon gateway returned an invalid HTTP response.".to_string()
        })?;
    let headers = String::from_utf8_lossy(&response[..body_at]);
    let payload: Value = serde_json::from_slice(&response[body_at..])
        .map_err(|error| format!("The local Agentmon gateway returned invalid JSON: {error}"))?;
    if !headers.starts_with("HTTP/1.1 2") {
        return Err(payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("The local Agentmon gateway rejected the request.")
            .to_string());
    }
    Ok(payload)
}

fn cloud_provider_from_input(input: &Value) -> Result<Option<&'static str>, String> {
    match input
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or("local")
    {
        "local" => Ok(None),
        "openai" => Ok(Some("openai")),
        "gemini" => Ok(Some("gemini")),
        "venice" => Ok(Some("venice")),
        _ => Err("Unsupported model provider.".into()),
    }
}

fn provider_secret(provider: &str) -> Result<Vec<u8>, String> {
    let _guard = PROVIDER_CREDENTIAL_LOCK
        .lock()
        .map_err(|_| "The secure credential lock was poisoned.".to_string())?;
    keyring::Entry::new(PROVIDER_KEYCHAIN_SERVICE, provider)
        .and_then(|entry| entry.get_password())
        .map(String::into_bytes)
        .map_err(|_| format!("Add the {provider} API key before connecting."))
}

fn credential_storage_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-credential-manager"
    } else {
        "macos-keychain"
    }
}

fn with_provider_secret(mut input: Value) -> Result<Value, String> {
    let Some(provider) = cloud_provider_from_input(&input)? else {
        return Ok(input);
    };
    let secret = provider_secret(provider)?;
    let secret =
        String::from_utf8(secret).map_err(|_| "The secure credential is invalid.".to_string())?;
    input["apiKey"] = Value::String(secret);
    Ok(input)
}

fn fetch_companion_snapshot(manager: &mut CompanionManager) -> Result<Value, String> {
    let Some(child) = manager.child.as_mut() else {
        return Ok(stopped_snapshot(None));
    };
    if child
        .try_wait()
        .map_err(|error| format!("Could not inspect the companion process: {error}"))?
        .is_some()
    {
        manager.stop();
        return Ok(stopped_snapshot(Some("The local companion stopped.")));
    }

    let token = manager
        .desktop_token
        .as_deref()
        .ok_or_else(|| "The companion started without a desktop token.".to_string())?;
    let address = SocketAddr::from(([127, 0, 0, 1], COMPANION_PORT));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(500))
        .map_err(|error| format!("The companion is starting: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(750)))
        .map_err(|error| format!("Could not set the local status timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(750)))
        .map_err(|error| format!("Could not set the local write timeout: {error}"))?;
    write!(
        stream,
        "GET /v1/desktop/status?slot=main HTTP/1.1\r\nHost: 127.0.0.1:{COMPANION_PORT}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
    )
    .map_err(|error| format!("Could not request companion status: {error}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("Could not read companion status: {error}"))?;
    let marker = b"\r\n\r\n";
    let body_at = response
        .windows(marker.len())
        .position(|window| window == marker)
        .map(|index| index + marker.len())
        .ok_or_else(|| "The companion returned an invalid HTTP response.".to_string())?;
    let headers = String::from_utf8_lossy(&response[..body_at]);
    if !headers.starts_with("HTTP/1.1 200") {
        return Err(format!(
            "The companion status request failed: {}",
            headers.lines().next().unwrap_or("unknown response")
        ));
    }
    let payload: Value = serde_json::from_slice(&response[body_at..])
        .map_err(|error| format!("The companion returned invalid status JSON: {error}"))?;
    Ok(json!({
        "running": true,
        "pairingCode": manager.pairing_code,
        "browser": payload.get("browser").cloned().unwrap_or_else(|| json!({})),
        "intake": payload.get("intake").cloned().unwrap_or_else(|| json!({})),
        "actionIntake": payload.get("actionIntake").cloned().unwrap_or_else(|| json!({})),
        "effectiveness": payload.get("effectiveness").cloned().unwrap_or_else(|| json!({})),
        "actionLearning": payload.get("actionLearning").cloned().unwrap_or(Value::Null),
        "localModel": payload.get("localModel").cloned().unwrap_or_else(|| json!({})),
        "privacy": payload.get("privacy").cloned().unwrap_or_else(|| json!({})),
        "error": null,
    }))
}

#[tauri::command]
async fn agentmon_identity() -> Result<Value, String> {
    run_blocking(|| run_engine("identity", None)).await
}

#[tauri::command]
async fn lifecycle_status() -> Result<Value, String> {
    run_blocking(|| run_lifecycle("status", None)).await
}

#[tauri::command]
async fn lifecycle_train(input: Value) -> Result<Value, String> {
    run_blocking(move || run_lifecycle("train", Some(&input))).await
}

#[tauri::command]
async fn lifecycle_evolve() -> Result<Value, String> {
    run_blocking(|| run_lifecycle("evolve", None)).await
}

#[tauri::command]
async fn compile_message(prompt: String) -> Result<Value, String> {
    run_blocking(move || run_engine("compile", Some(&prompt))).await
}

#[tauri::command]
fn read_local_source(source: String) -> Result<Value, String> {
    load_local_source(&source)
}

#[tauri::command]
async fn codex_plugin_status() -> Result<Value, String> {
    run_blocking(codex_plugin_status_value).await
}

fn install_codex_plugin_blocking() -> Result<Value, String> {
    let root = find_project_root()?;
    let codex = find_codex()?;
    ensure_agentmon_marketplace(&codex, &root)?;

    let before = run_codex_json(&codex, &root, &["plugin", "list", "--json"])?;
    let before_status = plugin_status_from_list(&before);
    if before_status.get("installed").and_then(Value::as_bool) != Some(true) {
        run_codex_json(
            &codex,
            &root,
            &["plugin", "add", "agentmon-codex@agentmon-local", "--json"],
        )?;
    }

    let runtime_pack_ready = deploy_main_runtime(&root)?;
    let after = run_codex_json(&codex, &root, &["plugin", "list", "--json"])?;
    let mut status = plugin_status_from_list(&after);
    status["codexFound"] = Value::Bool(true);
    status["projectRoot"] = Value::String(root.display().to_string());
    status["runtimePackReady"] = Value::Bool(runtime_pack_ready);
    status["message"] = Value::String(
        "Codex is connected. Start a new Codex chat, then say “Activate Guardot.”".into(),
    );
    Ok(status)
}

#[tauri::command]
async fn install_codex_plugin() -> Result<Value, String> {
    run_blocking(install_codex_plugin_blocking).await
}

fn companion_start_blocking(state: Arc<Mutex<CompanionManager>>) -> Result<Value, String> {
    let mut manager = state
        .lock()
        .map_err(|_| "The companion state lock was poisoned.".to_string())?;
    if manager.child.is_some() {
        return fetch_companion_snapshot(&mut manager);
    }

    let root = find_project_root()?;
    let engine_root = find_engine_root(&root)?;
    let script =
        engine_root.join("plugins/agentmon-codex/desktop-app/agentmon-desktop-companion.mjs");
    let mut child = Command::new(find_node()?)
        .arg("--disable-warning=ExperimentalWarning")
        .arg(script)
        .arg("--cwd")
        .arg(&root)
        .arg("--engine-root")
        .arg(&engine_root)
        .arg("--slot")
        .arg("main")
        .arg("--port")
        .arg(COMPANION_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the existing Agentmon companion: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not read the companion startup receipt.".to_string())?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    for _ in 0..8 {
        line.clear();
        if reader
            .read_line(&mut line)
            .map_err(|error| format!("Could not read companion startup: {error}"))?
            == 0
        {
            break;
        }
        let value = line.trim();
        if let Some(code) = value.strip_prefix("Browser pairing code: ") {
            manager.pairing_code = Some(code.to_string());
        } else if let Some(token) = value.strip_prefix("Desktop token: ") {
            manager.desktop_token = Some(token.to_string());
        }
        if value.starts_with("Daemon: ") {
            break;
        }
    }

    if manager.pairing_code.is_none() || manager.desktop_token.is_none() {
        let mut error = String::new();
        if let Some(stderr) = child.stderr.as_mut() {
            let _ = stderr.read_to_string(&mut error);
        }
        let _ = child.kill();
        let _ = child.wait();
        manager.pairing_code = None;
        manager.desktop_token = None;
        return Err(if error.trim().is_empty() {
            "The companion did not return its local startup receipt. Port 4765 may already be owned by the old Agentmon app.".into()
        } else {
            error.trim().to_string()
        });
    }

    manager.stdout = Some(reader);
    manager.child = Some(child);
    fetch_companion_snapshot(&mut manager)
}

#[tauri::command]
async fn companion_start(state: State<'_, Arc<Mutex<CompanionManager>>>) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || companion_start_blocking(shared)).await
}

#[tauri::command]
async fn companion_status(state: State<'_, Arc<Mutex<CompanionManager>>>) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let mut manager = shared
            .lock()
            .map_err(|_| "The companion state lock was poisoned.".to_string())?;
        fetch_companion_snapshot(&mut manager)
    })
    .await
}

#[tauri::command]
async fn companion_stop(state: State<'_, Arc<Mutex<CompanionManager>>>) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let mut manager = shared
            .lock()
            .map_err(|_| "The companion state lock was poisoned.".to_string())?;
        manager.stop();
        Ok(stopped_snapshot(None))
    })
    .await
}

#[tauri::command]
async fn local_model_discover(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        companion_json_request(
            shared,
            "GET",
            "/v1/desktop/local-agent/discover",
            None,
            Duration::from_secs(8),
        )
    })
    .await
}

#[tauri::command]
async fn local_model_connect(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/local-model/connect",
            Some(input),
            Duration::from_secs(8),
        )
    })
    .await
}

#[tauri::command]
async fn local_model_chat(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/local-model/chat",
            Some(input),
            Duration::from_secs(120),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_catalog(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        companion_json_request(
            shared,
            "GET",
            "/v1/desktop/model-providers",
            None,
            Duration::from_secs(8),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_models(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let input = with_provider_secret(input)?;
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/model-provider/models",
            Some(input),
            Duration::from_secs(20),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_connect(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let input = with_provider_secret(input)?;
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/model-provider/connect",
            Some(input),
            Duration::from_secs(20),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_chat(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let input = with_provider_secret(input)?;
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/model-provider/chat",
            Some(input),
            Duration::from_secs(180),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_outcome(
    state: State<'_, Arc<Mutex<CompanionManager>>>,
    input: Value,
) -> Result<Value, String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        companion_json_request(
            shared,
            "POST",
            "/v1/desktop/model-provider/outcome",
            Some(input),
            Duration::from_secs(15),
        )
    })
    .await
}

#[tauri::command]
async fn model_provider_secret_status(input: Value) -> Result<Value, String> {
    run_blocking(move || {
        let Some(provider) = cloud_provider_from_input(&input)? else {
            return Ok(json!({ "provider": "local", "configured": true, "storage": "none" }));
        };
        Ok(json!({ "provider": provider, "configured": provider_secret(provider).is_ok(), "storage": credential_storage_label() }))
    }).await
}

#[tauri::command]
async fn model_provider_secret_set(input: Value) -> Result<Value, String> {
    run_blocking(move || {
        let Some(provider) = cloud_provider_from_input(&input)? else {
            return Err("Local models do not require an API key.".into());
        };
        let secret = input
            .get("apiKey")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if secret.len() < 8 || secret.len() > 512 || secret.chars().any(char::is_whitespace) {
            return Err("Enter a valid API key without spaces.".into());
        }
        let _guard = PROVIDER_CREDENTIAL_LOCK
            .lock()
            .map_err(|_| "The secure credential lock was poisoned.".to_string())?;
        keyring::Entry::new(PROVIDER_KEYCHAIN_SERVICE, provider)
            .and_then(|entry| entry.set_password(secret))
            .map_err(|_| "Could not save the API key in the operating-system credential vault.".to_string())?;
        Ok(json!({ "provider": provider, "configured": true, "storage": credential_storage_label() }))
    })
    .await
}

#[tauri::command]
async fn model_provider_secret_delete(input: Value) -> Result<Value, String> {
    run_blocking(move || {
        let Some(provider) = cloud_provider_from_input(&input)? else {
            return Err("Local models do not have a stored API key.".into());
        };
        if provider_secret(provider).is_ok() {
            let _guard = PROVIDER_CREDENTIAL_LOCK
                .lock()
                .map_err(|_| "The secure credential lock was poisoned.".to_string())?;
            keyring::Entry::new(PROVIDER_KEYCHAIN_SERVICE, provider)
                .and_then(|entry| entry.delete_credential())
                .map_err(|_| "Could not remove the API key from the operating-system credential vault.".to_string())?;
        }
        Ok(json!({ "provider": provider, "configured": false, "storage": credential_storage_label() }))
    })
    .await
}

#[tauri::command]
async fn copy_pairing_code(state: State<'_, Arc<Mutex<CompanionManager>>>) -> Result<(), String> {
    let shared = Arc::clone(state.inner());
    run_blocking(move || {
        let code = shared
            .lock()
            .map_err(|_| "The companion state lock was poisoned.".to_string())?
            .pairing_code
            .clone()
            .ok_or_else(|| "Start the companion before copying its pairing code.".to_string())?;
        copy_text_to_clipboard(&code)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{load_local_source_from, plugin_status_from_list, run_engine_with_roots};
    use serde_json::json;
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    static FIXTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct FixtureHabitat(PathBuf);

    impl FixtureHabitat {
        fn create() -> Self {
            let nonce = FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after the epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "agentmon-desktop-test-{}-{timestamp}-{nonce}",
                std::process::id()
            ));
            let roster = root.join(".agentmon/roster/main");
            fs::create_dir_all(roster.join("visual")).expect("fixture roster should be created");
            fs::write(
                roster.join("SKILL.md"),
                "# Guardot Agentmon\n\nSynthetic CI fixture.\n",
            )
            .expect("fixture skill should be written");
            fs::write(
                roster.join("agentmon.json"),
                serde_json::to_vec_pretty(&json!({
                    "creationVersion": "test-fixture/v1",
                    "id": "AGM-TEST-FIXTURE",
                    "species": "Guardot",
                    "form": "Guardot",
                    "nature": "Steady",
                    "dna": "synthetic-test-dna",
                    "hatchReadiness": { "score": 100 },
                    "promptprint": {
                        "archetype": "guardian",
                        "confidence": 80,
                        "sampleCount": 5,
                        "dimensions": {}
                    },
                    "growthPromptprint": {
                        "archetype": "guardian",
                        "confidence": 80,
                        "sampleCount": 5,
                        "dimensions": {}
                    },
                    "lineage": {
                        "generation": 1,
                        "genesisDNA": "synthetic-test-dna",
                        "currentDNA": "synthetic-test-dna"
                    },
                    "learnedSkills": [],
                    "skillCandidates": [],
                    "proceduralSkills": [],
                    "procedureTrials": [],
                    "arenaReport": { "results": [] }
                }))
                .expect("fixture state should serialize"),
            )
            .expect("fixture state should be written");
            fs::write(roster.join("visual/agentmon.png"), b"\x89PNG\r\n\x1a\n")
                .expect("fixture visual should be written");
            Self(root)
        }

        fn root(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for FixtureHabitat {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn engine_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(Path::parent)
            .expect("the desktop crate should be inside the Agentmon repository")
            .to_path_buf()
    }

    #[test]
    fn identity_bridge_closes_stdin_and_finishes_quickly() {
        let habitat = FixtureHabitat::create();
        let started = Instant::now();
        let identity = run_engine_with_roots("identity", None, habitat.root(), &engine_root())
            .expect("identity bridge should finish");
        assert_eq!(identity["identity"]["name"], "Guardot");
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn reads_only_allowlisted_agentmon_sources() {
        let habitat = FixtureHabitat::create();
        let skill =
            load_local_source_from(habitat.root(), "skill").expect("SKILL.md should be readable");
        let state = load_local_source_from(habitat.root(), "state")
            .expect("agentmon.json should be readable");
        let visual = load_local_source_from(habitat.root(), "visual")
            .expect("agentmon.png should be readable");
        assert_eq!(skill["kind"], "text");
        assert_eq!(state["kind"], "json");
        assert_eq!(visual["kind"], "image");
        assert!(
            skill["content"]
                .as_str()
                .unwrap()
                .contains("# Guardot Agentmon")
        );
        assert!(
            visual["dataUrl"]
                .as_str()
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        assert!(load_local_source_from(habitat.root(), "../../private").is_err());
    }

    #[test]
    fn detects_only_the_installed_agentmon_plugin() {
        let status = plugin_status_from_list(&json!({
            "installed": [
                { "pluginId": "browser@openai-bundled", "installed": true, "enabled": true },
                { "pluginId": "agentmon-codex@agentmon-local", "installed": true, "enabled": true, "version": "1.2.3" }
            ]
        }));
        assert_eq!(status["installed"], true);
        assert_eq!(status["enabled"], true);
        assert_eq!(status["version"], "1.2.3");

        let missing = plugin_status_from_list(&json!({ "installed": [] }));
        assert_eq!(missing["installed"], false);
        assert_eq!(missing["enabled"], false);
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Arc::new(Mutex::new(CompanionManager::default())))
        .invoke_handler(tauri::generate_handler![
            agentmon_identity,
            lifecycle_status,
            lifecycle_train,
            lifecycle_evolve,
            compile_message,
            read_local_source,
            codex_plugin_status,
            install_codex_plugin,
            companion_start,
            companion_status,
            companion_stop,
            local_model_discover,
            local_model_connect,
            local_model_chat,
            model_provider_catalog,
            model_provider_models,
            model_provider_connect,
            model_provider_chat,
            model_provider_outcome,
            model_provider_secret_status,
            model_provider_secret_set,
            model_provider_secret_delete,
            copy_pairing_code,
            open_chrome_extensions,
            install_chrome_extension,
        ])
        .build(tauri::generate_context!())
        .expect("Agentmon desktop failed to build");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Ok(mut manager) = app_handle.state::<Arc<Mutex<CompanionManager>>>().lock() {
                manager.stop();
            }
        }
    });
}
