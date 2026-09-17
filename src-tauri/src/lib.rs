use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

mod mobile_server;
use mobile_server::MobileServerInfo;

/// Получить базовый путь к папке «магазины» в AppData
fn get_stores_dir() -> Result<PathBuf, String> {
  let app_data = std::env::var("APPDATA")
    .map_err(|_| "Не удалось определить путь APPDATA".to_string())?;
  Ok(PathBuf::from(app_data).join("com.revizor.app").join("магазины"))
}

/// Получить базовый путь к папке «архив» в AppData (внутри «магазины»)
fn get_archive_dir() -> Result<PathBuf, String> {
  let stores = get_stores_dir()?;
  let archive = stores.join("архив");
  if !archive.exists() {
    fs::create_dir_all(&archive)
      .map_err(|e| format!("Ошибка создания папки архива: {}", e))?;
  }
  Ok(archive)
}

#[tauri::command]
fn ensure_stores_dir() -> Result<String, String> {
  let dir = get_stores_dir()?;
  if !dir.exists() {
    fs::create_dir_all(&dir)
      .map_err(|e| format!("Ошибка создания папки магазинов: {}", e))?;
  }
  let _ = get_archive_dir();
  Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_revision_dir(dir_path: String) -> Result<(), String> {
  let path = PathBuf::from(&dir_path);
  if !path.exists() {
    fs::create_dir_all(&path)
      .map_err(|e| format!("Ошибка создания папки ревизии: {}", e))?;
  }
  Ok(())
}

#[tauri::command]
fn get_stores_base_path() -> Result<String, String> {
  let dir = get_stores_dir()?;
  Ok(dir.to_string_lossy().to_string())
}

fn format_date_human(d: &str) -> String {
  let trimmed = d.trim();
  let parts: Vec<&str> = trimmed.split('-').collect();
  if parts.len() == 3 && parts[0].len() == 4 {
    format!("{}.{}.{}", parts[2], parts[1], parts[0])
  } else {
    trimmed.to_string()
  }
}

fn build_revision_folder_name(store_number: &str, start_date: &str, end_date: &str) -> String {
  let s_clean = format_date_human(start_date);
  let e_clean = format_date_human(end_date);
  if !e_clean.is_empty() && e_clean != s_clean {
    format!("{}_{}-{}", store_number.trim(), s_clean, e_clean)
  } else if !s_clean.is_empty() {
    format!("{}_{}", store_number.trim(), s_clean)
  } else {
    store_number.trim().to_string()
  }
}

#[tauri::command]
fn create_revision_dir(store_number: String, start_date: String, end_date: Option<String>) -> Result<String, String> {
  let base = get_stores_dir()?;
  if !base.exists() {
    fs::create_dir_all(&base)
      .map_err(|e| format!("Ошибка создания папки магазинов: {}", e))?;
  }

  let end = end_date.unwrap_or_default();
  let folder_name = build_revision_folder_name(&store_number, &start_date, &end);
  let mut revision_dir = base.join(&folder_name);

  // Если папка с таким именем уже существует
  if revision_dir.exists() {
    // Проверяем, не пустая ли она (от прерванной миграции / пустого создания)
    let is_empty = match fs::read_dir(&revision_dir) {
      Ok(mut entries) => entries.next().is_none(),
      Err(_) => false,
    };
    if is_empty {
      return Ok(revision_dir.to_string_lossy().to_string());
    }

    // Иначе ищем следующий свободный или пустой суффикс
    let mut suffix = 2u32;
    loop {
      let suffixed_name = format!("{}_{}", folder_name, suffix);
      let candidate = base.join(&suffixed_name);
      if !candidate.exists() {
        revision_dir = candidate;
        break;
      }
      let cand_empty = match fs::read_dir(&candidate) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => false,
      };
      if cand_empty {
        revision_dir = candidate;
        break;
      }
      suffix += 1;
      if suffix > 100 {
        return Err("Слишком много ревизий для этого магазина и дат".to_string());
      }
    }
  }

  fs::create_dir_all(&revision_dir)
    .map_err(|e| format!("Ошибка создания папки ревизии: {}", e))?;

  Ok(revision_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_revision_dir(dir_path: String, store_number: String, start_date: String, end_date: String) -> Result<String, String> {
  let mut source = PathBuf::from(&dir_path);
  let base_stores = get_stores_dir()?;

  // Если переданный путь не существует — ищем существующую папку этого магазина
  if !source.exists() {
    let prefix = format!("{}_", store_number.trim());
    if let Ok(entries) = fs::read_dir(&base_stores) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with(&prefix) && name != "архив" {
              source = path;
              break;
            }
          }
        }
      }
    }
  }

  if !source.exists() {
    return Err(format!("Папка ревизии для магазина №{} не найдена на диске", store_number));
  }

  let parent = source.parent().unwrap_or(&base_stores).to_path_buf();
  let new_folder_name = build_revision_folder_name(&store_number, &start_date, &end_date);
  let target = parent.join(&new_folder_name);

  // Если имя не изменилось — ничего не делаем
  if target == source {
    return Ok(target.to_string_lossy().to_string());
  }

  // Если целевая папка уже существует:
  if target.exists() {
    let is_empty = match fs::read_dir(&target) {
      Ok(mut entries) => entries.next().is_none(),
      Err(_) => false,
    };
    if is_empty {
      let _ = fs::remove_dir_all(&target);
    } else {
      return Err(format!("Папка {} уже существует с данными", new_folder_name));
    }
  }

  // Строго прямое переименование существующей папки на месте (без создания дублей)
  let mut last_err = String::new();
  for attempt in 0..15 {
    if attempt > 0 {
      std::thread::sleep(std::time::Duration::from_millis(100));
    }
    match fs::rename(&source, &target) {
      Ok(_) => return Ok(target.to_string_lossy().to_string()),
      Err(e) => {
        last_err = e.to_string();
      }
    }
  }

  Err(format!("Не удалось переименовать папку: {}", last_err))
}

#[tauri::command]
fn delete_revision_dir(dir_path: String) -> Result<(), String> {
  let path = PathBuf::from(&dir_path);
  if !path.exists() {
    return Ok(()); // Папка уже удалена — не ошибка
  }

  // Безопасность: проверяем что путь находится внутри папки магазинов
  let base = get_stores_dir()?;
  if !path.starts_with(&base) {
    return Err("Недопустимый путь: папка не внутри каталога магазинов".to_string());
  }

  fs::remove_dir_all(&path)
    .map_err(|e| format!("Ошибка удаления папки ревизии: {}", e))?;

  Ok(())
}

#[tauri::command]
fn move_revision_to_archive(dir_path: String) -> Result<String, String> {
  let source = PathBuf::from(&dir_path);
  if !source.exists() {
    return Err("Исходная папка ревизии не найдена".to_string());
  }

  let folder_name = source
    .file_name()
    .ok_or_else(|| "Не удалось определить имя папки".to_string())?;

  let archive_base = get_archive_dir()?;
  let target = archive_base.join(folder_name);

  if target.exists() {
    if target == source {
      return Ok(target.to_string_lossy().to_string());
    }
    // Если в архиве уже есть папка с таким именем — проверяем, пустая ли она
    let is_empty = match fs::read_dir(&target) {
      Ok(mut entries) => entries.next().is_none(),
      Err(_) => false,
    };
    if is_empty {
      let _ = fs::remove_dir_all(&target);
    }
  }

  fs::rename(&source, &target)
    .map_err(|e| format!("Ошибка перемещения ревизии в архив: {}", e))?;

  Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn restore_revision_from_archive(dir_path: String) -> Result<String, String> {
  let source = PathBuf::from(&dir_path);
  if !source.exists() {
    return Err("Архивная папка ревизии не найдена".to_string());
  }

  let folder_name = source
    .file_name()
    .ok_or_else(|| "Не удалось определить имя папки".to_string())?;

  let stores_base = get_stores_dir()?;
  let target = stores_base.join(folder_name);

  if target.exists() {
    if target == source {
      return Ok(target.to_string_lossy().to_string());
    }
    let is_empty = match fs::read_dir(&target) {
      Ok(mut entries) => entries.next().is_none(),
      Err(_) => false,
    };
    if is_empty {
      let _ = fs::remove_dir_all(&target);
    }
  }

  fs::rename(&source, &target)
    .map_err(|e| format!("Ошибка восстановления ревизии из архива: {}", e))?;

  Ok(target.to_string_lossy().to_string())
}

fn to_base64(data: &[u8]) -> String {
  const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
  for chunk in data.chunks(3) {
    let b0 = chunk[0];
    let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
    let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

    result.push(CHARSET[(b0 >> 2) as usize] as char);
    result.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

    if chunk.len() > 1 {
      result.push(CHARSET[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
    } else {
      result.push('=');
    }

    if chunk.len() > 2 {
      result.push(CHARSET[(b2 & 0x3F) as usize] as char);
    } else {
      result.push('=');
    }
  }
  result
}

#[tauri::command]
fn save_file(default_filename: String, data: Vec<u8>) -> Result<String, String> {
  let filter = if default_filename.ends_with(".xlsx") {
    "Excel Files (*.xlsx)|*.xlsx|All Files (*.*)|*.*"
  } else {
    "CSV Files (*.csv)|*.csv|All Files (*.*)|*.*"
  };

  let ps_script = format!(
    r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Filter = "{}"
$dialog.FileName = "{}"
$dialog.Title = "Сохранить файл ревизии"
$downloads = [Environment]::GetFolderPath("UserProfile") + "\Downloads"
if (Test-Path $downloads) {{
    $dialog.InitialDirectory = $downloads
}}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::Out.Write($dialog.FileName)
}}
"#,
    filter, default_filename
  );

  let utf16_units: Vec<u16> = ps_script.encode_utf16().collect();
  let mut u8_bytes = Vec::with_capacity(utf16_units.len() * 2);
  for u in utf16_units {
    u8_bytes.push((u & 0xFF) as u8);
    u8_bytes.push((u >> 8) as u8);
  }
  let encoded_cmd = to_base64(&u8_bytes);

  let output = Command::new("powershell")
    .args(["-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", &encoded_cmd])
    .creation_flags(0x08000000) // CREATE_NO_WINDOW
    .output()
    .map_err(|e| format!("Ошибка открытия диалога сохранения: {}", e))?;

  let chosen_path = String::from_utf8(output.stdout)
    .unwrap_or_else(|_| String::new())
    .trim()
    .to_string();

  if chosen_path.is_empty() {
    return Err("CANCELLED".to_string());
  }

  fs::write(&chosen_path, &data).map_err(|e| format!("Ошибка записи файла: {}", e))?;

  Ok(chosen_path)
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
  Command::new("explorer")
    .args(["/select,", &path])
    .creation_flags(0x08000000)
    .spawn()
    .map_err(|e| format!("Ошибка открытия папки: {}", e))?;
  Ok(())
}

#[tauri::command]
fn open_revision_folder(dir_path: String) -> Result<(), String> {
  let path = PathBuf::from(&dir_path);
  if !path.exists() {
    return Err("Папка ревизии не найдена".to_string());
  }
  Command::new("explorer")
    .arg(&dir_path)
    .creation_flags(0x08000000)
    .spawn()
    .map_err(|e| format!("Ошибка открытия папки: {}", e))?;
  Ok(())
}

#[tauri::command]
fn cleanup_orphan_revision_dirs(_valid_paths: Vec<String>) -> Result<(), String> {
  // Безопасность: полностью отключаем автоматическое удаление папок ревизий,
  // чтобы исключить любую потерю данных при расхождении слешей или путей.
  Ok(())
}

#[tauri::command]
fn start_mobile_server(
  app: tauri::AppHandle,
  revision_id: String,
  store_number: String,
  dir_path: String,
  port: Option<u16>,
) -> Result<MobileServerInfo, String> {
  let p = port.unwrap_or(4820);
  let db_path = PathBuf::from(&dir_path).join("revision.db");
  mobile_server::start_server(app, revision_id, store_number, db_path, p)
}

#[tauri::command]
fn get_mobile_server_info(port: Option<u16>) -> MobileServerInfo {
  mobile_server::get_server_info(port.unwrap_or(4820))
}

#[tauri::command]
fn stop_mobile_server() -> Result<(), String> {
  mobile_server::stop_server()
}

#[tauri::command]
fn generate_qr_svg(text: String) -> Result<String, String> {
  mobile_server::generate_qr_code(&text)
}

#[tauri::command]
fn get_available_network_ips() -> Vec<mobile_server::NetworkInterfaceInfo> {
  mobile_server::get_available_ips()
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
  app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      save_file,
      show_in_folder,
      ensure_stores_dir,
      ensure_revision_dir,
      get_stores_base_path,
      create_revision_dir,
      delete_revision_dir,
      open_revision_folder,
      move_revision_to_archive,
      restore_revision_from_archive,
      rename_revision_dir,
      cleanup_orphan_revision_dirs,
      start_mobile_server,
      get_mobile_server_info,
      stop_mobile_server,
      generate_qr_svg,
      get_available_network_ips,
      restart_app
    ])
    .setup(|_app| {
      // Гарантируем создание папки «магазины» при запуске
      if let Err(e) = ensure_stores_dir() {
        eprintln!("[app] Ошибка создания папки магазинов при запуске: {}", e);
      }

      if cfg!(debug_assertions) {
        _app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .level_for("rustls", log::LevelFilter::Off)
            .level_for("rustls::conn", log::LevelFilter::Off)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
