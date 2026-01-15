mod git;
mod watcher;

use git::{
    compare_branches, get_branches, get_commit_diff, get_commit_history, get_current_diff,
    get_file_contents, get_file_patch, get_remote_url, open_repo, BranchList, CompareBranchesResult,
    CommitDiff, CommitHistory, DiffResult, DifferConfig, RemoteInfo,
};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use watcher::FileWatcher;

// Application state
pub struct AppState {
    pub repo_path: Mutex<Option<PathBuf>>,
    pub watcher: Mutex<Option<FileWatcher>>,
    pub config: Mutex<DifferConfig>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            repo_path: Mutex::new(None),
            watcher: Mutex::new(None),
            config: Mutex::new(DifferConfig::default()),
        }
    }
}

// Helper to get repo path
fn get_repo_path(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .repo_path
        .lock()
        .map_err(|_| "Failed to lock state".to_string())?
        .clone()
        .ok_or_else(|| "No repository selected".to_string())
}

// Commands

#[tauri::command]
fn cmd_set_repo_path(path: String, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    let path = PathBuf::from(&path);

    // Verify it's a valid git repo
    open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;

    // Update repo path
    *state.repo_path.lock().map_err(|_| "Failed to lock state".to_string())? = Some(path.clone());

    // Set up file watcher
    let watcher = FileWatcher::new(&path, app).map_err(|e| e.to_string())?;
    *state.watcher.lock().map_err(|_| "Failed to lock state".to_string())? = Some(watcher);

    Ok(())
}

#[tauri::command]
fn cmd_get_diff_current(state: State<AppState>) -> Result<DiffResult, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_current_diff(&repo).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_diff_file(path: String, state: State<AppState>) -> Result<String, String> {
    let repo_path = get_repo_path(&state)?;
    let repo = open_repo(repo_path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_file_patch(&repo, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_commits(
    page: Option<usize>,
    limit: Option<usize>,
    state: State<AppState>,
) -> Result<CommitHistory, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;

    let page = page.unwrap_or(1);
    let limit = limit.unwrap_or(20);
    let offset = (page - 1) * limit;

    get_commit_history(&repo, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_commit(sha: String, state: State<AppState>) -> Result<CommitDiff, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_commit_diff(&repo, &sha).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_branch_list(state: State<AppState>) -> Result<BranchList, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_branches(&repo).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_compare_branch(
    base: String,
    head: String,
    state: State<AppState>,
) -> Result<CompareBranchesResult, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    compare_branches(&repo, &base, &head).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_file(
    path: String,
    git_ref: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let repo_path = get_repo_path(&state)?;
    let repo = open_repo(repo_path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_file_contents(&repo, &path, git_ref.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_remote(state: State<AppState>) -> Result<Option<RemoteInfo>, String> {
    let path = get_repo_path(&state)?;
    let repo = open_repo(path.to_str().unwrap_or("")).map_err(|e| e.to_string())?;
    get_remote_url(&repo).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_config(state: State<AppState>) -> Result<DifferConfig, String> {
    let config = state.config.lock().map_err(|_| "Failed to lock state".to_string())?;
    Ok(config.clone())
}

#[tauri::command]
fn cmd_set_config(config: DifferConfig, state: State<AppState>) -> Result<(), String> {
    *state.config.lock().map_err(|_| "Failed to lock state".to_string())? = config;
    Ok(())
}

#[tauri::command]
fn cmd_open_in_editor(file_path: String, editor: String, state: State<AppState>) -> Result<(), String> {
    let repo_path = get_repo_path(&state)?;
    let full_path = repo_path.join(&file_path);

    let editor_cmd = match editor.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        "zed" => "zed",
        "sublime" => "subl",
        "webstorm" => "webstorm",
        "idea" => "idea",
        _ => "code", // Default to VS Code
    };

    std::process::Command::new(editor_cmd)
        .arg(full_path)
        .spawn()
        .map_err(|e| format!("Failed to open editor: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            cmd_set_repo_path,
            cmd_get_diff_current,
            cmd_get_diff_file,
            cmd_get_commits,
            cmd_get_commit,
            cmd_get_branch_list,
            cmd_compare_branch,
            cmd_get_file,
            cmd_get_remote,
            cmd_get_config,
            cmd_set_config,
            cmd_open_in_editor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
