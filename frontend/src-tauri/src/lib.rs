#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    // Google sign in returns through the flama:// deep link.
    .plugin(tauri_plugin_deep_link::Builder::new().build())
    // Opens the system browser for Google sign in (WebViews are blocked).
    .plugin(tauri_plugin_opener::init())
    // Forwards flama:// urls from a second launch to the running instance.
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      use tauri_plugin_deep_link::DeepLinkExt;
      let urls: Vec<url::Url> = argv
        .iter()
        .skip(1)
        .filter_map(|a| a.parse().ok())
        .collect();
      if !urls.is_empty() {
        let _ = app.deep_link().handle_deep_links(urls);
      }
    }))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
