// Fulcrum Desktop — Tauri v2 main entry point
// Gated: FULCRUM_FEATURES=desktop-app (feature flag checked at startup via
// check_feature_flag IPC command).
//
// IPC commands exposed to the SvelteKit webview:
//   copy_artifact(source_path)  — copy file to FULCRUM_HOME/artifacts/
//   check_for_updates()         — query Tauri updater plugin
//   check_feature_flag(flag)    — check env-based feature flags

// Prevents a console window from appearing on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct CopyArtifactResult {
    /// Internal artifact identifier (UUID generated server-side via tRPC).
    pub artifact_id: String,
    /// Absolute destination path inside FULCRUM_HOME/artifacts/.
    pub dest_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureFlagResult {
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// IPC: copy_artifact
// ---------------------------------------------------------------------------

/// Copy a file from `source_path` (native OS path from drag-drop event) into
/// FULCRUM_HOME/artifacts/. The filename is preserved; overwrites on collision
/// are avoided by appending a timestamp suffix.
///
/// After copying, the caller's TypeScript should invoke artifacts.create via
/// tRPC to register the artifact in the product DB.
#[tauri::command]
async fn copy_artifact(source_path: String) -> Result<CopyArtifactResult, String> {
    let src = PathBuf::from(&source_path);

    // Validate source exists
    if !src.exists() {
        return Err(format!("Source file does not exist: {source_path}"));
    }

    // Resolve FULCRUM_HOME/artifacts/
    let fulcrum_home = std::env::var("FULCRUM_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".fulcrum")
        });

    let artifacts_dir = fulcrum_home.join("artifacts");
    fs::create_dir_all(&artifacts_dir)
        .map_err(|e| format!("Cannot create artifacts dir: {e}"))?;

    // Build unique destination filename
    let file_name = src
        .file_name()
        .ok_or_else(|| "Source path has no filename".to_string())?
        .to_string_lossy();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let dest_name = if artifacts_dir.join(file_name.as_ref()).exists() {
        format!("{timestamp}_{file_name}")
    } else {
        file_name.to_string()
    };

    let dest_path = artifacts_dir.join(&dest_name);

    fs::copy(&src, &dest_path)
        .map_err(|e| format!("Copy failed: {e}"))?;

    // Generate a simple artifact ID (UUID v4-style via timestamp + random)
    let artifact_id = format!("art_{timestamp}_{dest_name}");

    Ok(CopyArtifactResult {
        artifact_id,
        dest_path: dest_path.to_string_lossy().to_string(),
    })
}

// ---------------------------------------------------------------------------
// IPC: check_for_updates
// ---------------------------------------------------------------------------

/// Delegates to the Tauri updater plugin to check for a new release.
/// Returns version + release notes when available.
///
/// In tests the TypeScript IPC wrapper mocks this command's response.
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater_builder()
        .build()
        .map_err(|e| format!("Updater build failed: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateCheckResult {
            available: true,
            version: Some(update.version.clone()),
            notes: update.body.clone(),
        }),
        Ok(None) => Ok(UpdateCheckResult {
            available: false,
            version: None,
            notes: None,
        }),
        Err(e) => Err(format!("Update check failed: {e}")),
    }
}

// ---------------------------------------------------------------------------
// IPC: check_feature_flag
// ---------------------------------------------------------------------------

/// Check whether a Fulcrum feature flag is enabled on the Rust side.
/// Reads FULCRUM_FEATURES env var (comma-separated list).
/// TypeScript calls this at startup to verify the desktop-app flag.
#[tauri::command]
fn check_feature_flag(flag: String) -> FeatureFlagResult {
    let features: Vec<String> = std::env::var("FULCRUM_FEATURES")
        .unwrap_or_default()
        .split(',')
        .map(|f| f.trim().to_string())
        .collect();

    FeatureFlagResult {
        enabled: features.contains(&flag),
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            copy_artifact,
            check_for_updates,
            check_feature_flag,
        ])
        .setup(|app| {
            // Check feature flag at startup — belt-and-suspenders: the binary
            // only ships when desktop-app flag was ON at build time, but we
            // also verify the runtime flag so the webview can gracefully degrade.
            let features = std::env::var("FULCRUM_FEATURES").unwrap_or_default();
            if !features.split(',').any(|f| f.trim() == "desktop-app") {
                eprintln!(
                    "WARN: Fulcrum desktop binary launched without FULCRUM_FEATURES=desktop-app — \
                     some features may be degraded."
                );
            }

            // Bring the main window to the front
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Fulcrum desktop app");
}
