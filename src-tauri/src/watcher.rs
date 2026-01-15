use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, Debouncer, notify::RecommendedWatcher};
use std::path::Path;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEBOUNCE_MS: u64 = 300;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub event_type: String,
    pub file: String,
    pub timestamp: i64,
}

pub struct FileWatcher {
    #[allow(dead_code)]
    debouncer: Debouncer<RecommendedWatcher>,
}

impl FileWatcher {
    pub fn new<P: AsRef<Path>>(
        path: P,
        app_handle: AppHandle,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let (tx, rx) = channel();

        let mut debouncer = new_debouncer(Duration::from_millis(DEBOUNCE_MS), tx)?;

        debouncer.watcher().watch(path.as_ref(), RecursiveMode::Recursive)?;

        // Spawn a thread to handle file change events
        let path_str = path.as_ref().to_string_lossy().to_string();
        std::thread::spawn(move || {
            handle_events(rx, app_handle, &path_str);
        });

        Ok(Self { debouncer })
    }
}

fn handle_events(
    rx: Receiver<Result<Vec<DebouncedEvent>, notify::Error>>,
    app_handle: AppHandle,
    base_path: &str,
) {
    loop {
        match rx.recv() {
            Ok(Ok(events)) => {
                for event in events {
                    // Skip .git directory changes
                    let path_str = event.path.to_string_lossy();
                    if path_str.contains(".git") {
                        continue;
                    }

                    // Get relative path
                    let relative_path = event
                        .path
                        .strip_prefix(base_path)
                        .unwrap_or(&event.path)
                        .to_string_lossy()
                        .to_string();

                    let change_event = FileChangeEvent {
                        event_type: "change".to_string(),
                        file: relative_path,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };

                    // Emit event to all windows
                    if let Err(e) = app_handle.emit("file-change", change_event) {
                        eprintln!("Failed to emit file change event: {}", e);
                    }
                }
            }
            Ok(Err(e)) => {
                eprintln!("File watcher error: {}", e);
            }
            Err(_) => {
                // Channel closed, exit loop
                break;
            }
        }
    }
}
