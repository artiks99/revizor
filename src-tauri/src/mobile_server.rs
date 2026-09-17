use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, SslConfig, StatusCode};

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVER_IS_HTTPS: AtomicBool = AtomicBool::new(false);
static SHOULD_STOP: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MobileServerInfo {
  pub is_running: bool,
  pub port: u16,
  pub local_ip: String,
  pub url: String,
  pub revision_id: String,
  pub store_number: String,
  pub last_scanned: Option<String>,
}

// Shared state for current server configuration
struct ServerSharedState {
  app_handle: Option<AppHandle>,
  revision_id: String,
  store_number: String,
  db_path: PathBuf,
  last_scanned: Option<String>,
}

static SERVER_STATE: Mutex<Option<ServerSharedState>> = Mutex::new(None);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NetworkInterfaceInfo {
  pub ip: String,
  pub label: String,
}

/// Получить все активные IPv4 адреса (исключая loopback и link-local)
pub fn get_available_ips() -> Vec<NetworkInterfaceInfo> {
  let mut list = Vec::new();

  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    if let Ok(output) = std::process::Command::new("powershell")
      .creation_flags(0x08000000) // CREATE_NO_WINDOW
      .args(["-NoProfile", "-Command", "Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object { $_.IPAddress + '|' + $_.InterfaceAlias }"])
      .output()
    {
      if let Ok(text) = String::from_utf8(output.stdout) {
        for line in text.lines() {
          let line = line.trim();
          if line.is_empty() { continue; }
          let parts: Vec<&str> = line.split('|').collect();
          if parts.len() >= 2 {
            let ip = parts[0].trim().to_string();
            let name = parts[1].trim().to_string();
            if !ip.starts_with("127.") && !ip.starts_with("169.254.") {
              list.push(NetworkInterfaceInfo {
                label: format!("{} ({})", ip, name),
                ip,
              });
            }
          }
        }
      }
    }
  }

  // Fallback через UDP socket probe если powershell пуст
  if list.is_empty() {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
      if socket.connect("8.8.8.8:80").is_ok() {
        if let Ok(addr) = socket.local_addr() {
          let ip = addr.ip().to_string();
          if !ip.starts_with("127.") {
            list.push(NetworkInterfaceInfo {
              label: ip.clone(),
              ip,
            });
          }
        }
      }
    }
  }

  // Сортируем: ставим локальные Wi-Fi / Ethernet выше виртуальных VPN (Radmin/Hamachi)
  list.sort_by(|a, b| {
    let a_is_vpn = a.label.to_lowercase().contains("radmin") || a.label.to_lowercase().contains("vpn") || a.ip.starts_with("26.");
    let b_is_vpn = b.label.to_lowercase().contains("radmin") || b.label.to_lowercase().contains("vpn") || b.ip.starts_with("26.");
    a_is_vpn.cmp(&b_is_vpn)
  });

  list
}

/// Получить основной IPv4 адрес компьютера (с приоритетом реального LAN/Wi-Fi интерфейса)
pub fn get_local_ip() -> String {
  let ips = get_available_ips();
  if let Some(first_non_vpn) = ips.iter().find(|i| !i.ip.starts_with("26.") && !i.label.to_lowercase().contains("radmin")) {
    return first_non_vpn.ip.clone();
  }
  if let Some(first) = ips.first() {
    return first.ip.clone();
  }
  "127.0.0.1".to_string()
}

/// Генерация 100% спецификационно-валидного SVG QR-кода через crate qrcode
pub fn generate_qr_code(text: &str) -> Result<String, String> {
  let code = qrcode::QrCode::new(text.as_bytes())
    .map_err(|e| format!("Ошибка создания QR-кода: {}", e))?;
  let svg = code
    .render::<qrcode::render::svg::Color>()
    .min_dimensions(240, 240)
    .quiet_zone(true)
    .dark_color(qrcode::render::svg::Color("#000000"))
    .light_color(qrcode::render::svg::Color("#ffffff"))
    .build();
  Ok(svg)
}

/// Инициализация таблицы mobile_tasks в revision.db
fn ensure_mobile_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
  conn.execute(
    "CREATE TABLE IF NOT EXISTS mobile_tasks (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'in_progress',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT
    )",
    [],
  )?;

  // Миграции для существующих баз данных
  let _ = conn.execute("ALTER TABLE mobile_tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'", []);
  let _ = conn.execute("ALTER TABLE mobile_tasks ADD COLUMN completed_at TEXT", []);
  let _ = conn.execute("ALTER TABLE inventory_items ADD COLUMN box_number TEXT NOT NULL DEFAULT ''", []);

  // Таблица черновиков отсканированных товаров задачи до завершения
  conn.execute(
    "CREATE TABLE IF NOT EXISTS mobile_task_items (
      id TEXT PRIMARY KEY,
      task_name TEXT NOT NULL,
      revision_id TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      box_number TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

  let _ = conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_mti_task ON mobile_task_items(task_name)",
    [],
  );

  Ok(())
}

#[derive(Serialize)]
pub struct TaskItemDto {
  pub id: String,
  pub name: String,
  pub status: String,
  pub created_at: String,
  pub updated_at: String,
  pub items_count: i64,
  pub total_qty: i64,
}

#[derive(Serialize)]
pub struct ScannedProductDto {
  pub id: String,
  pub sku: String,
  pub barcode: String,
  pub name: String,
  pub quantity: i64,
  pub updated_at: String,
  pub box_number: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct CatalogSuggestionDto {
  pub sku: String,
  pub name: String,
  pub barcode: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProductLocationDto {
  pub location: String,
  pub box_number: String,
  pub quantity: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProductDetailDto {
  pub sku: String,
  pub name: String,
  pub barcode: String,
  pub stock_qty: f64,
  pub multiplicity: i64,
  pub hall_qty: i64,
  pub debarkader_qty: i64,
  pub total_counted: i64,
  pub locations: Vec<ProductLocationDto>,
  pub is_account_299: bool,
}

fn open_db(db_path: &Path) -> Result<Connection, String> {
  let conn = Connection::open(db_path).map_err(|e| format!("Не удалось открыть БД {}: {}", db_path.display(), e))?;
  let _ = conn.busy_timeout(Duration::from_millis(15000));
  let _ = conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
  Ok(conn)
}

/// Получить список задач (локаций)
fn get_tasks(db_path: &Path, _revision_id: &str) -> Result<Vec<TaskItemDto>, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let mut stmt = conn
    .prepare(
      "WITH all_tasks AS (
         SELECT 
           name as loc_name, 
           COALESCE(status, 'in_progress') as status, 
           COALESCE(created_at, '') as created_at, 
           COALESCE(updated_at, '') as updated_at 
         FROM mobile_tasks
         UNION
         SELECT 
           DISTINCT location as loc_name, 
           'completed' as status, 
           COALESCE(MIN(created_at), '') as created_at, 
           COALESCE(MAX(updated_at), '') as updated_at
         FROM inventory_items
         WHERE location IS NOT NULL AND TRIM(location) != '' 
           AND location NOT IN (SELECT name FROM mobile_tasks)
         GROUP BY location
       )
       SELECT 
         loc_name,
         status,
         created_at,
         updated_at,
         COALESCE((SELECT COUNT(DISTINCT sku) FROM inventory_items WHERE TRIM(location) = loc_name OR location = loc_name), 0) as items_count,
         COALESCE((SELECT SUM(quantity) FROM inventory_items WHERE TRIM(location) = loc_name OR location = loc_name), 0) as total_qty
       FROM all_tasks
       WHERE TRIM(loc_name) != ''
       ORDER BY 
         CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END,
         updated_at DESC, 
         created_at DESC",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      let name: String = row.get(0)?;
      let status: String = row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "in_progress".to_string());
      let created_at: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
      let updated_at: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
      let items_count: i64 = row.get::<_, Option<i64>>(4)?.unwrap_or(0);
      let total_qty: i64 = row.get::<_, Option<i64>>(5)?.unwrap_or(0);
      Ok(TaskItemDto {
        id: name.clone(),
        name,
        status,
        created_at,
        updated_at,
        items_count,
        total_qty,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut tasks = Vec::new();
  for r in rows.flatten() {
    tasks.push(r);
  }
  Ok(tasks)
}

/// Создать задачу (новую локацию)
fn create_task(db_path: &Path, revision_id: &str, name: &str) -> Result<TaskItemDto, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_name = name.trim();
  if clean_name.is_empty() {
    return Err("Название задачи не может быть пустым".to_string());
  }

  let task_id = format!("task_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());

  conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'in_progress', datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET status = 'in_progress', updated_at = datetime('now', 'localtime')",
    params![task_id, revision_id, clean_name],
  ).map_err(|e| format!("Ошибка создания задачи: {}", e))?;

  Ok(TaskItemDto {
    id: clean_name.to_string(),
    name: clean_name.to_string(),
    status: "in_progress".to_string(),
    created_at: "только что".to_string(),
    updated_at: "только что".to_string(),
    items_count: 0,
    total_qty: 0,
  })
}

/// Удалить задачу (локацию) и все связанные с ней товары
fn delete_task(db_path: &Path, name: &str) -> Result<(), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_name = name.trim();
  if clean_name.is_empty() {
    return Err("Название задачи не может быть пустым".to_string());
  }

  conn.execute("DELETE FROM mobile_tasks WHERE name = ?1", params![clean_name])
    .map_err(|e| format!("Ошибка удаления задачи: {}", e))?;

  conn.execute("DELETE FROM mobile_task_items WHERE task_name = ?1", params![clean_name])
    .map_err(|e| format!("Ошибка удаления черновиков задачи: {}", e))?;

  conn.execute("DELETE FROM inventory_items WHERE TRIM(location) = ?1 OR location = ?1", params![clean_name])
    .map_err(|e| format!("Ошибка удаления товаров задачи: {}", e))?;

  Ok(())
}

/// Сбросить существующие черновики mobile_task_items в inventory_items
fn flush_draft_items(
  conn: &Connection,
  clean_loc: &str,
  revision_id: &str,
  store_number: &str,
) -> Result<(), String> {
  let draft_count: i64 = conn.query_row(
    "SELECT COUNT(*) FROM mobile_task_items WHERE task_name = ?1",
    params![clean_loc],
    |row| row.get(0),
  ).unwrap_or(0);

  if draft_count == 0 {
    return Ok(());
  }

  struct DraftRow {
    sku: String,
    name: String,
    quantity: i64,
    box_number: String,
  }

  let mut stmt = conn.prepare(
    "SELECT sku, name, quantity, box_number FROM mobile_task_items WHERE task_name = ?1"
  ).map_err(|e| e.to_string())?;

  let rows = stmt.query_map(params![clean_loc], |row| {
    Ok(DraftRow {
      sku: row.get(0)?,
      name: row.get(1)?,
      quantity: row.get(2)?,
      box_number: row.get(3)?,
    })
  }).map_err(|e| e.to_string())?;

  let drafts: Vec<DraftRow> = rows.flatten().collect();

  let has_revision_id = {
    let mut st = conn.prepare("PRAGMA table_info(inventory_items)").map_err(|e| e.to_string())?;
    let mut r = st.query([]).map_err(|e| e.to_string())?;
    let mut found = false;
    while let Ok(Some(row)) = r.next() {
      if let Ok(col_name) = row.get::<_, String>(1) {
        if col_name == "revision_id" {
          found = true;
          break;
        }
      }
    }
    found
  };

  for (idx, it) in drafts.iter().enumerate() {
    let clean_box = it.box_number.trim();
    let existing_id: Option<(String, i64)> = if clean_box.is_empty() {
      conn.query_row(
        "SELECT id, quantity FROM inventory_items WHERE (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND (box_number IS NULL OR TRIM(box_number) = '') LIMIT 1",
        params![clean_loc, it.sku],
        |r| Ok((r.get(0)?, r.get(1)?)),
      ).ok()
    } else {
      conn.query_row(
        "SELECT id, quantity FROM inventory_items WHERE (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND TRIM(COALESCE(box_number, '')) = ?3 LIMIT 1",
        params![clean_loc, it.sku, clean_box],
        |r| Ok((r.get(0)?, r.get(1)?)),
      ).ok()
    };

    match existing_id {
      Some((id, cur_q)) => {
        let _ = conn.execute(
          "UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2",
          params![cur_q + it.quantity, id],
        );
      }
      None => {
        let new_id = format!("item_{}_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros(), idx);
        if has_revision_id {
          let _ = conn.execute(
            "INSERT INTO inventory_items (id, revision_id, store_number, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 'шт.', ?7, ?8, 'ok', datetime('now', 'localtime'), datetime('now', 'localtime'))",
            params![new_id, revision_id, store_number, it.name, it.sku, it.quantity, clean_loc, clean_box],
          );
        } else {
          let _ = conn.execute(
            "INSERT INTO inventory_items (id, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, 'шт.', ?5, ?6, 'ok', datetime('now', 'localtime'), datetime('now', 'localtime'))",
            params![new_id, it.name, it.sku, it.quantity, clean_loc, clean_box],
          );
        }
      }
    }
  }

  let _ = conn.execute("DELETE FROM mobile_task_items WHERE task_name = ?1", params![clean_loc]);
  Ok(())
}

/// Получить товары внутри задачи (локации) и её текущий статус
fn get_task_items(
  db_path: &Path,
  location: &str,
  revision_id: &str,
  store_number: &str,
) -> Result<(String, Vec<ScannedProductDto>), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);
  let clean_loc = location.trim();

  let _ = flush_draft_items(&conn, clean_loc, revision_id, store_number);

  let status: String = conn.query_row(
    "SELECT status FROM mobile_tasks WHERE name = ?1",
    params![clean_loc],
    |row| row.get(0),
  ).unwrap_or_else(|_| "in_progress".to_string());

  let mut stmt = conn.prepare(
    "SELECT 
       i.id,
       i.sku,
       COALESCE((
         SELECT c.barcode 
         FROM store_catalog c 
         WHERE c.sku = i.sku 
           AND c.barcode IS NOT NULL 
           AND c.barcode != '' 
           AND c.barcode != i.sku
         LIMIT 1
       ), (
         SELECT c.barcode 
         FROM store_catalog c 
         WHERE c.sku = i.sku AND c.barcode != '' 
         LIMIT 1
       ), '') as barcode,
       COALESCE(i.name, '') as name,
       COALESCE(i.quantity, 0) as quantity,
       COALESCE(i.updated_at, '') as updated_at,
       COALESCE(i.box_number, '') as box_number
     FROM inventory_items i
     WHERE TRIM(i.location) = ?1 OR i.location = ?1
     ORDER BY i.updated_at DESC, i.created_at DESC",
  ).map_err(|e| e.to_string())?;

  let rows = stmt.query_map(params![clean_loc], |row| {
    Ok(ScannedProductDto {
      id: row.get(0)?,
      sku: row.get(1)?,
      barcode: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
      name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
      quantity: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
      updated_at: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
      box_number: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
    })
  }).map_err(|e| e.to_string())?;

  let mut items = Vec::new();
  for r in rows.flatten() {
    items.push(r);
  }
  Ok((status, items))
}

/// Поиск товаров/ЛК в каталоге для подсказок на мобильном клиенте
fn search_catalog(db_path: &Path, query: &str) -> Result<Vec<CatalogSuggestionDto>, String> {
  let conn = open_db(db_path)?;
  let q = query.trim();
  if q.is_empty() {
    return Ok(Vec::new());
  }

  // Проверяем наличие таблицы store_catalog
  let catalog_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_catalog'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  if !catalog_exists {
    return Ok(Vec::new());
  }

  let stock_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_stock'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  let sql = if stock_exists {
    "WITH combined AS (
       SELECT sku, name, COALESCE(barcode, '') as barcode FROM store_catalog
       UNION
       SELECT sku, name, '' as barcode FROM store_stock WHERE sku NOT IN (SELECT sku FROM store_catalog)
     )
     SELECT sku, name, barcode FROM combined
     WHERE sku LIKE ?1 || '%' 
        OR sku LIKE '%' || ?1 || '%' 
        OR barcode LIKE ?1 || '%' 
        OR barcode LIKE '%' || ?1 || '%'
     ORDER BY 
       CASE 
         WHEN sku = ?1 THEN 1
         WHEN sku LIKE ?1 || '%' THEN 2
         WHEN barcode = ?1 THEN 3
         WHEN barcode LIKE ?1 || '%' THEN 4
         ELSE 5
       END,
       LENGTH(sku) ASC,
       sku ASC
     LIMIT 15"
  } else {
    "SELECT sku, name, COALESCE(barcode, '') as barcode FROM store_catalog
     WHERE sku LIKE ?1 || '%' 
        OR sku LIKE '%' || ?1 || '%' 
        OR barcode LIKE ?1 || '%' 
        OR barcode LIKE '%' || ?1 || '%'
     ORDER BY 
       CASE 
         WHEN sku = ?1 THEN 1
         WHEN sku LIKE ?1 || '%' THEN 2
         WHEN barcode = ?1 THEN 3
         WHEN barcode LIKE ?1 || '%' THEN 4
         ELSE 5
       END,
       LENGTH(sku) ASC,
       sku ASC
     LIMIT 15"
  };

  let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
  let rows = stmt.query_map(params![q], |row| {
    Ok(CatalogSuggestionDto {
      sku: row.get(0)?,
      name: row.get(1)?,
      barcode: row.get(2)?,
    })
  }).map_err(|e| e.to_string())?;

  let mut list = Vec::new();
  for r in rows.flatten() {
    let mut dto = r;
    if !dto.barcode.is_empty() {
      let first_bc = dto.barcode.split(',').next().unwrap_or("").trim().to_string();
      if first_bc != dto.sku {
        dto.barcode = first_bc;
      } else {
        dto.barcode = String::new();
      }
    }
    list.push(dto);
  }
  Ok(list)
}

/// Получить детальную информацию о товаре для окна «Добавление»
fn get_product_details(db_path: &Path, code: &str) -> Result<Option<ProductDetailDto>, String> {
  let conn = open_db(db_path)?;
  let clean_code = code.trim();
  if clean_code.is_empty() {
    return Ok(None);
  }

  let digits_only: String = clean_code.chars().filter(|c| c.is_ascii_digit()).collect();
  let unpadded_digits = digits_only.trim_start_matches('0').to_string();

  // 1. Поиск товара в каталоге
  let catalog_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_catalog'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  let catalog_lookup: Result<(String, String, String), _> = if catalog_exists {
    conn.query_row(
      "SELECT COALESCE(sku, ''), COALESCE(name, ''), COALESCE(barcode, '') FROM store_catalog 
       WHERE TRIM(sku) = ?1 
          OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2)
          OR (length(?3) > 0 AND TRIM(sku) = ?3)
          OR (length(?1) >= 3 AND sku LIKE ?1 || '%')
          OR (length(?1) >= 4 AND sku LIKE '%' || ?1 || '%')
          OR TRIM(barcode) = ?1 
          OR (length(?2) > 0 AND LTRIM(TRIM(barcode), '0') = ?2)
          OR (length(?3) > 0 AND TRIM(barcode) = ?3)
          OR (length(?3) > 0 AND REPLACE(REPLACE(TRIM(barcode), ' ', ''), '-', '') = ?3)
          OR barcode LIKE ?1 || '%' 
          OR barcode LIKE '%' || ?1 || '%' 
          OR (length(?2) > 0 AND barcode LIKE '%' || ?2 || '%')
          OR (length(?3) > 0 AND barcode LIKE '%' || ?3 || '%')
       ORDER BY 
         CASE 
           WHEN TRIM(barcode) = ?1 OR TRIM(sku) = ?1 THEN 1
           WHEN (length(?3) > 0 AND TRIM(barcode) = ?3) OR (length(?3) > 0 AND TRIM(sku) = ?3) THEN 2
           WHEN (length(?2) > 0 AND LTRIM(TRIM(barcode), '0') = ?2) OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2) THEN 3
           WHEN barcode LIKE ?1 || '%' OR sku LIKE ?1 || '%' THEN 4
           WHEN barcode LIKE '%' || ?1 || '%' OR sku LIKE '%' || ?1 || '%' THEN 5
           ELSE 6
         END,
         LENGTH(sku) ASC
       LIMIT 1",
      params![clean_code, unpadded_digits, digits_only],
      |row| {
        let s: String = row.get(0).unwrap_or_default();
        let n: String = row.get(1).unwrap_or_default();
        let b: String = row.get(2).unwrap_or_default();
        Ok((s, n, b))
      },
    )
  } else {
    Err(rusqlite::Error::QueryReturnedNoRows)
  };

  let (found_sku, found_name, found_bc) = match catalog_lookup {
    Ok((s, n, b)) => {
      let primary_bc = b.split([',', ';', '\n', '\r', '/', ' ']).next().unwrap_or("").trim().to_string();
      let bc_to_show = if !primary_bc.is_empty() && primary_bc != s {
        primary_bc
      } else if clean_code != s {
        clean_code.to_string()
      } else {
        primary_bc
      };
      let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
      (s, final_name, bc_to_show)
    }
    Err(_) => {
      let stock_exists: bool = conn
        .query_row(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_stock'",
          [],
          |_| Ok(true),
        )
        .unwrap_or(false);

      if !stock_exists {
        return Ok(None);
      }

      let stock_lookup: Result<(String, String), _> = conn.query_row(
        "SELECT COALESCE(sku, ''), COALESCE(name, '') FROM store_stock 
         WHERE TRIM(sku) = ?1 
            OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2)
            OR (length(?3) > 0 AND TRIM(sku) = ?3)
            OR (length(?1) >= 3 AND sku LIKE ?1 || '%')
            OR (length(?1) >= 4 AND sku LIKE '%' || ?1 || '%')
         ORDER BY 
           CASE 
             WHEN TRIM(sku) = ?1 THEN 1 
             WHEN (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2) THEN 2 
             ELSE 3 
           END
         LIMIT 1",
        params![clean_code, unpadded_digits, digits_only],
        |row| {
          let s: String = row.get(0).unwrap_or_default();
          let n: String = row.get(1).unwrap_or_default();
          Ok((s, n))
        },
      );

      match stock_lookup {
        Ok((s, n)) => {
          let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
          (s, final_name, String::new())
        }
        Err(_) => {
          // Проверяем наличие в store_account_299
          let account_299_exists: bool = conn
            .query_row(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_account_299'",
              [],
              |_| Ok(true),
            )
            .unwrap_or(false);

          let acc299_lookup: Result<(String, String), _> = if account_299_exists {
            conn.query_row(
              "SELECT COALESCE(sku, ''), COALESCE(name, '') FROM store_account_299 
               WHERE TRIM(sku) = ?1 
                  OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2)
                  OR (length(?3) > 0 AND TRIM(sku) = ?3)
               LIMIT 1",
              params![clean_code, unpadded_digits, digits_only],
              |row| {
                let s: String = row.get(0).unwrap_or_default();
                let n: String = row.get(1).unwrap_or_default();
                Ok((s, n))
              },
            )
          } else {
            Err(rusqlite::Error::QueryReturnedNoRows)
          };

          match acc299_lookup {
            Ok((s, n)) => {
              let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
              (s, final_name, String::new())
            }
            Err(_) => return Ok(None),
          }
        }
      }
    }
  };

  // 2. Остаток в магазине из store_stock
  let stock_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_stock'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  let stock_qty: f64 = if stock_exists {
    conn.query_row(
      "SELECT COALESCE(quantity, 0) FROM store_stock WHERE TRIM(sku) = ?1 LIMIT 1",
      params![found_sku],
      |r| r.get(0),
    ).unwrap_or(0.0)
  } else {
    0.0
  };

  // 3. Кратность коробки из store_multiplicity
  let mult_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_multiplicity'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  let multiplicity: i64 = if mult_exists {
    conn.query_row(
      "SELECT COALESCE(multiplicity, 1) FROM store_multiplicity WHERE TRIM(sku) = ?1 LIMIT 1",
      params![found_sku],
      |r| r.get(0),
    ).unwrap_or(1)
  } else {
    1
  };

  // 4. Посчитанное ранее количество по всем локациям
  let mut locations = Vec::new();
  let mut total_counted: i64 = 0;
  let mut debarkader_qty: i64 = 0;
  let mut hall_qty: i64 = 0;

  if let Ok(mut stmt) = conn.prepare(
    "SELECT 
       COALESCE(location, '') as loc, 
       COALESCE(box_number, '') as box, 
       SUM(quantity) as qty 
     FROM inventory_items 
     WHERE TRIM(sku) = ?1 AND quantity > 0 
     GROUP BY loc, box 
     ORDER BY qty DESC, loc ASC"
  ) {
    if let Ok(rows) = stmt.query_map(params![found_sku], |r| {
      let loc: String = r.get(0).unwrap_or_default();
      let box_num: String = r.get(1).unwrap_or_default();
      let qty: i64 = r.get(2).unwrap_or(0);
      Ok((loc, box_num, qty))
    }) {
      for r in rows.flatten() {
        let (loc, box_num, qty) = r;
        total_counted += qty;
        let loc_lower = loc.to_lowercase();
        if loc_lower.contains("дебарк") || loc_lower.contains("склад") || !box_num.trim().is_empty() {
          debarkader_qty += qty;
        } else {
          hall_qty += qty;
        }
        let loc_display = if loc.trim().is_empty() {
          "Без локации".to_string()
        } else {
          loc.trim().to_string()
        };
        locations.push(ProductLocationDto {
          location: loc_display,
          box_number: box_num.trim().to_string(),
          quantity: qty,
        });
      }
    }
  }

  // 5. Проверка наличия в списке Счета 299
  let account_299_table_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_account_299'",
      [],
      |_| Ok(true),
    )
    .unwrap_or(false);

  let is_account_299: bool = if account_299_table_exists {
    conn.query_row(
      "SELECT 1 FROM store_account_299 WHERE TRIM(sku) = ?1 OR LTRIM(TRIM(sku), '0') = LTRIM(?1, '0') LIMIT 1",
      params![found_sku],
      |_| Ok(true),
    ).unwrap_or(false)
  } else {
    false
  };

  Ok(Some(ProductDetailDto {
    sku: found_sku,
    name: found_name,
    barcode: found_bc,
    stock_qty,
    multiplicity,
    hall_qty,
    debarkader_qty,
    total_counted,
    locations,
    is_account_299,
  }))
}

/// Добавить отсканированный ШК напрямую в inventory_items
fn scan_barcode(
  db_path: &Path,
  revision_id: &str,
  store_number: &str,
  location: &str,
  barcode: &str,
  add_qty: i64,
  box_number: &str,
  allow_unknown: bool,
) -> Result<ScannedProductDto, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_loc = location.trim();
  let clean_bc = barcode.trim();
  let clean_box = box_number.trim();
  let qty = if add_qty <= 0 { 1 } else { add_qty };

  if clean_loc.is_empty() {
    return Err("Не указана локация/задача".to_string());
  }
  if clean_bc.is_empty() {
    return Err("Пустой штрихкод".to_string());
  }

  let task_status: String = conn.query_row(
    "SELECT status FROM mobile_tasks WHERE name = ?1",
    params![clean_loc],
    |r| r.get(0),
  ).unwrap_or_else(|_| "in_progress".to_string());
  if task_status == "completed" {
    return Err("Задача уже завершена. Добавление товаров заблокировано.".to_string());
  }

  // 1. Поиск товара в каталоге по ШК или ЛК (гибкое сопоставление)
  let digits_only: String = clean_bc.chars().filter(|c| c.is_ascii_digit()).collect();
  let unpadded_digits = digits_only.trim_start_matches('0').to_string();

  let catalog_lookup: Result<(String, String, String), _> = conn.query_row(
    "SELECT COALESCE(sku, ''), COALESCE(name, ''), COALESCE(barcode, '') FROM store_catalog 
     WHERE TRIM(sku) = ?1 
        OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2)
        OR (length(?3) > 0 AND TRIM(sku) = ?3)
        OR (length(?1) >= 3 AND sku LIKE ?1 || '%')
        OR (length(?1) >= 4 AND sku LIKE '%' || ?1 || '%')
        OR TRIM(barcode) = ?1 
        OR (length(?2) > 0 AND LTRIM(TRIM(barcode), '0') = ?2)
        OR (length(?3) > 0 AND TRIM(barcode) = ?3)
        OR (length(?3) > 0 AND REPLACE(REPLACE(TRIM(barcode), ' ', ''), '-', '') = ?3)
        OR barcode LIKE ?1 || '%' 
        OR barcode LIKE '%' || ?1 || '%' 
        OR (length(?2) > 0 AND barcode LIKE '%' || ?2 || '%')
        OR (length(?3) > 0 AND barcode LIKE '%' || ?3 || '%')
     ORDER BY 
       CASE 
         WHEN TRIM(barcode) = ?1 OR TRIM(sku) = ?1 THEN 1
         WHEN (length(?3) > 0 AND TRIM(barcode) = ?3) OR (length(?3) > 0 AND TRIM(sku) = ?3) THEN 2
         WHEN (length(?2) > 0 AND LTRIM(TRIM(barcode), '0') = ?2) OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2) THEN 3
         WHEN barcode LIKE ?1 || '%' OR sku LIKE ?1 || '%' THEN 4
         WHEN barcode LIKE '%' || ?1 || '%' OR sku LIKE '%' || ?1 || '%' THEN 5
         ELSE 6
       END,
       LENGTH(sku) ASC
     LIMIT 1",
    params![clean_bc, unpadded_digits, digits_only],
    |row| {
      let s: String = row.get(0).unwrap_or_default();
      let n: String = row.get(1).unwrap_or_default();
      let b: String = row.get(2).unwrap_or_default();
      Ok((s, n, b))
    },
  );

  let (found_sku, found_name, found_bc, is_nd) = match catalog_lookup {
    Ok((s, n, b)) => {
      let primary_bc = b.split([',', ';', '\n', '\r', '/', ' ']).next().unwrap_or("").trim().to_string();
      let bc_to_show = if !primary_bc.is_empty() && primary_bc != s {
        primary_bc
      } else if clean_bc != s {
        clean_bc.to_string()
      } else {
        primary_bc
      };
      let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
      (s, final_name, bc_to_show, false)
    }
    Err(_) => {
      let stock_lookup: Result<(String, String), _> = conn.query_row(
        "SELECT COALESCE(sku, ''), COALESCE(name, '') FROM store_stock 
         WHERE TRIM(sku) = ?1 
            OR (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2)
            OR (length(?3) > 0 AND TRIM(sku) = ?3)
            OR (length(?1) >= 3 AND sku LIKE ?1 || '%')
            OR (length(?1) >= 4 AND sku LIKE '%' || ?1 || '%')
         ORDER BY 
           CASE 
             WHEN TRIM(sku) = ?1 THEN 1 
             WHEN (length(?2) > 0 AND LTRIM(TRIM(sku), '0') = ?2) THEN 2 
             ELSE 3 
           END
         LIMIT 1",
        params![clean_bc, unpadded_digits, digits_only],
        |row| {
          let s: String = row.get(0).unwrap_or_default();
          let n: String = row.get(1).unwrap_or_default();
          Ok((s, n))
        },
      );
      match stock_lookup {
        Ok((s, n)) => {
          let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
          (s, final_name, String::new(), false)
        },
        Err(_) => {
          if allow_unknown {
            (clean_bc.to_string(), "Н/Д".to_string(), clean_bc.to_string(), true)
          } else {
            return Err(format!("Товар с кодом «{}» не найден в каталоге", clean_bc));
          }
        }
      }
    }
  };

  // 2. Обновляем статус задачи в mobile_tasks как 'in_progress'
  let _ = conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'in_progress', datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET status = 'in_progress', updated_at = datetime('now', 'localtime')",
    params![clean_loc, revision_id, clean_loc],
  );

  // 3. Проверяем наличие колонки revision_id в inventory_items
  let has_revision_id = {
    let mut stmt = conn.prepare("PRAGMA table_info(inventory_items)").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut found = false;
    while let Ok(Some(row)) = rows.next() {
      if let Ok(col_name) = row.get::<_, String>(1) {
        if col_name == "revision_id" {
          found = true;
          break;
        }
      }
    }
    found
  };

  // 4. Сохраняем сразу в inventory_items
  let item_status = if is_nd { "nd" } else { "ok" };

  let existing_item: Result<(String, i64, String), _> = if clean_box.is_empty() {
    conn.query_row(
      "SELECT id, quantity, COALESCE(box_number, '') 
       FROM inventory_items 
       WHERE (TRIM(location) = ?1 OR location = ?1) 
         AND sku = ?2 
         AND (box_number IS NULL OR TRIM(box_number) = '') 
       LIMIT 1",
      params![clean_loc, found_sku],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
  } else {
    conn.query_row(
      "SELECT id, quantity, COALESCE(box_number, '') 
       FROM inventory_items 
       WHERE (TRIM(location) = ?1 OR location = ?1) 
         AND sku = ?2 
         AND TRIM(COALESCE(box_number, '')) = ?3 
       LIMIT 1",
      params![clean_loc, found_sku, clean_box],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
  };

  let (item_id, new_total, final_box) = match existing_item {
    Ok((id, current_qty, b)) => {
      let next_qty = current_qty + qty;
      conn.execute(
        "UPDATE inventory_items 
         SET quantity = ?1, updated_at = datetime('now', 'localtime') 
         WHERE id = ?2",
        params![next_qty, id],
      ).map_err(|e| format!("Ошибка обновления товара: {}", e))?;
      (id, next_qty, b)
    }
    Err(_) => {
      let new_id = format!("item_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros());
      if has_revision_id {
        conn.execute(
          "INSERT INTO inventory_items (
            id, revision_id, store_number, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 'шт.', ?7, ?8, ?9, datetime('now', 'localtime'), datetime('now', 'localtime'))",
          params![new_id, revision_id, store_number, found_name, found_sku, qty, clean_loc, clean_box, item_status],
        ).map_err(|e| format!("Ошибка добавления товара в инвентаризацию: {}", e))?;
      } else {
        conn.execute(
          "INSERT INTO inventory_items (
            id, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at
          ) VALUES (?1, ?2, ?3, '', ?4, 'шт.', ?5, ?6, ?7, datetime('now', 'localtime'), datetime('now', 'localtime'))",
          params![new_id, found_name, found_sku, qty, clean_loc, clean_box, item_status],
        ).map_err(|e| format!("Ошибка добавления товара в инвентаризацию: {}", e))?;
      }
      (new_id, qty, clean_box.to_string())
    }
  };

  Ok(ScannedProductDto {
    id: item_id,
    sku: found_sku,
    barcode: found_bc,
    name: found_name,
    quantity: new_total,
    updated_at: "только что".to_string(),
    box_number: final_box,
  })
}

/// Обновить номер коробки товара в черновике или в ревизии
fn update_item_box(
  db_path: &Path,
  item_id: &str,
  box_number: &str,
  location: &str,
) -> Result<(), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);
  let clean_loc = location.trim();
  let clean_box = box_number.trim();

  if !clean_loc.is_empty() {
    let task_status: String = conn.query_row(
      "SELECT status FROM mobile_tasks WHERE name = ?1",
      params![clean_loc],
      |r| r.get(0),
    ).unwrap_or_else(|_| "in_progress".to_string());
    if task_status == "completed" {
      return Err("Задача уже завершена. Изменение номера коробки заблокировано.".to_string());
    }
  }

  let is_draft: bool = conn.query_row(
    "SELECT 1 FROM mobile_task_items WHERE id = ?1",
    params![item_id],
    |_| Ok(true),
  ).unwrap_or(false);

  if is_draft {
    let current: Result<(String, i64, String), _> = conn.query_row(
      "SELECT sku, quantity, COALESCE(box_number, '') FROM mobile_task_items WHERE id = ?1",
      params![item_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );
    if let Ok((sku, qty, cur_box)) = current {
      let cur_clean = cur_box.trim();
      if !cur_clean.is_empty() && cur_clean != clean_box {
        return Err("Номер коробки уже указан и не может быть изменен.".to_string());
      }
      let duplicate_target: Result<(String, i64), _> = if clean_box.is_empty() {
        conn.query_row(
          "SELECT id, quantity FROM mobile_task_items 
           WHERE id != ?1 AND task_name = ?2 AND sku = ?3 AND (box_number IS NULL OR TRIM(box_number) = '') LIMIT 1",
          params![item_id, clean_loc, sku],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
      } else {
        conn.query_row(
          "SELECT id, quantity FROM mobile_task_items 
           WHERE id != ?1 AND task_name = ?2 AND sku = ?3 AND TRIM(COALESCE(box_number, '')) = ?4 LIMIT 1",
          params![item_id, clean_loc, sku, clean_box],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
      };

      if let Ok((target_id, target_qty)) = duplicate_target {
        conn.execute("UPDATE mobile_task_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![target_qty + qty, target_id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM mobile_task_items WHERE id = ?1", params![item_id]).map_err(|e| e.to_string())?;
      } else {
        conn.execute("UPDATE mobile_task_items SET box_number = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![clean_box, item_id]).map_err(|e| e.to_string())?;
      }
    }
  } else {
    // В inventory_items
    let current: Result<(String, i64, String), _> = conn.query_row(
      "SELECT sku, quantity, COALESCE(box_number, '') FROM inventory_items WHERE id = ?1",
      params![item_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );

    if let Ok((sku, qty, cur_box)) = current {
      let cur_clean = cur_box.trim();
      if !cur_clean.is_empty() && cur_clean != clean_box {
        return Err("Номер коробки уже указан и не может быть изменен.".to_string());
      }
      let duplicate_target: Result<(String, i64), _> = if clean_box.is_empty() {
        conn.query_row(
          "SELECT id, quantity FROM inventory_items 
           WHERE id != ?1 
             AND (TRIM(location) = ?2 OR location = ?2) 
             AND sku = ?3 
             AND (box_number IS NULL OR TRIM(box_number) = '') 
           LIMIT 1",
          params![item_id, clean_loc, sku],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
      } else {
        conn.query_row(
          "SELECT id, quantity FROM inventory_items 
           WHERE id != ?1 
             AND (TRIM(location) = ?2 OR location = ?2) 
             AND sku = ?3 
             AND TRIM(COALESCE(box_number, '')) = ?4 
           LIMIT 1",
          params![item_id, clean_loc, sku, clean_box],
          |row| Ok((row.get(0)?, row.get(1)?)),
        )
      };

      if let Ok((target_id, target_qty)) = duplicate_target {
        let merged_qty = target_qty + qty;
        conn.execute("UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![merged_qty, target_id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM inventory_items WHERE id = ?1", params![item_id]).map_err(|e| e.to_string())?;
      } else {
        conn.execute("UPDATE inventory_items SET box_number = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![clean_box, item_id]).map_err(|e| e.to_string())?;
      }
    }
  }

  if !clean_loc.is_empty() {
    let _ = conn.execute(
      "UPDATE mobile_tasks SET updated_at = datetime('now', 'localtime') WHERE name = ?1",
      params![clean_loc],
    );
  }
  Ok(())
}

/// Обновить количество товара напрямую
fn update_item_qty(
  db_path: &Path,
  item_id: &str,
  new_qty: i64,
  location: &str,
) -> Result<(), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);
  let clean_loc = location.trim();

  if !clean_loc.is_empty() {
    let task_status: String = conn.query_row(
      "SELECT status FROM mobile_tasks WHERE name = ?1",
      params![clean_loc],
      |r| r.get(0),
    ).unwrap_or_else(|_| "in_progress".to_string());
    if task_status == "completed" {
      return Err("Задача уже завершена. Изменение количества заблокировано.".to_string());
    }
  }

  let is_draft: bool = conn.query_row(
    "SELECT 1 FROM mobile_task_items WHERE id = ?1",
    params![item_id],
    |_| Ok(true),
  ).unwrap_or(false);

  if is_draft {
    if new_qty <= 0 {
      conn.execute("DELETE FROM mobile_task_items WHERE id = ?1", params![item_id])
        .map_err(|e| format!("Ошибка удаления: {}", e))?;
    } else {
      conn.execute(
        "UPDATE mobile_task_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2",
        params![new_qty, item_id],
      ).map_err(|e| format!("Ошибка обновления: {}", e))?;
    }
  } else {
    if new_qty <= 0 {
      conn.execute("DELETE FROM inventory_items WHERE id = ?1", params![item_id])
        .map_err(|e| format!("Ошибка удаления: {}", e))?;
    } else {
      conn.execute(
        "UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2",
        params![new_qty, item_id],
      ).map_err(|e| format!("Ошибка обновления: {}", e))?;
    }
  }

  if !clean_loc.is_empty() {
    let _ = conn.execute(
      "UPDATE mobile_tasks SET updated_at = datetime('now', 'localtime') WHERE name = ?1",
      params![clean_loc],
    );
  }
  Ok(())
}

#[derive(Serialize)]
pub struct TaskCompleteResultDto {
  pub success: bool,
  pub task: String,
  pub items_count: i64,
  pub total_qty: i64,
}

/// Завершить задачу: зафиксировать статус completed в mobile_tasks
fn complete_task(
  db_path: &Path,
  revision_id: &str,
  store_number: &str,
  name: &str,
) -> Result<TaskCompleteResultDto, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_name = name.trim();
  if clean_name.is_empty() {
    return Err("Название задачи не может быть пустым".to_string());
  }

  // Сбрасываем возможные остатки черновиков
  let _ = flush_draft_items(&conn, clean_name, revision_id, store_number);

  // Считаем товары прямо из inventory_items
  let (items_count, total_qty): (i64, i64) = conn.query_row(
    "SELECT 
       COALESCE(COUNT(DISTINCT sku), 0),
       COALESCE(SUM(quantity), 0)
     FROM inventory_items 
     WHERE TRIM(location) = ?1 OR location = ?1",
    params![clean_name],
    |r| Ok((r.get(0)?, r.get(1)?)),
  ).unwrap_or((0, 0));

  // Помечаем задачу как завершенную
  conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at, completed_at)
     VALUES (?1, ?2, ?3, 'completed', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET status = 'completed', updated_at = datetime('now', 'localtime'), completed_at = datetime('now', 'localtime')",
    params![clean_name, revision_id, clean_name],
  ).map_err(|e| e.to_string())?;

  Ok(TaskCompleteResultDto {
    success: true,
    task: clean_name.to_string(),
    items_count,
    total_qty,
  })
}

fn cors_headers() -> Vec<Header> {
  vec![
    Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
    Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
    Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap(),
  ]
}

fn respond_json<T: Serialize>(data: &T, status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
  let json_str = serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string());
  let mut resp = Response::from_string(json_str);
  resp = resp.with_status_code(StatusCode(status));
  for h in cors_headers() {
    resp.add_header(h);
  }
  resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap());
  resp
}

fn respond_html(html: &str) -> Response<std::io::Cursor<Vec<u8>>> {
  let mut resp = Response::from_string(html);
  resp = resp.with_status_code(StatusCode(200));
  for h in cors_headers() {
    resp.add_header(h);
  }
  resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
  resp
}

fn respond_js(js: &str) -> Response<std::io::Cursor<Vec<u8>>> {
  let mut resp = Response::from_string(js);
  resp = resp.with_status_code(StatusCode(200));
  for h in cors_headers() {
    resp.add_header(h);
  }
  resp.add_header(Header::from_bytes(&b"Content-Type"[..], &b"application/javascript; charset=utf-8"[..]).unwrap());
  resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=86400"[..]).unwrap());
  resp
}

/// Запуск локального HTTP сервера в фоновом потоке
pub fn start_server(
  app: AppHandle,
  revision_id: String,
  store_number: String,
  db_path: PathBuf,
  port: u16,
) -> Result<MobileServerInfo, String> {
  // Если сервер уже запущен с этой же ревизией — просто возвращаем статус
  if SERVER_RUNNING.load(Ordering::SeqCst) {
    let mut state = SERVER_STATE.lock().unwrap();
    if let Some(s) = state.as_mut() {
      s.revision_id = revision_id.clone();
      s.store_number = store_number.clone();
      s.db_path = db_path.clone();
    }
    let local_ip = get_local_ip();
    let scheme = if SERVER_IS_HTTPS.load(Ordering::SeqCst) { "https" } else { "http" };
    return Ok(MobileServerInfo {
      is_running: true,
      port,
      local_ip: local_ip.clone(),
      url: format!("{}://{}:{}/?rev={}", scheme, local_ip, port, revision_id),
      revision_id,
      store_number,
      last_scanned: None,
    });
  }

  {
    let mut state = SERVER_STATE.lock().unwrap();
    *state = Some(ServerSharedState {
      app_handle: Some(app.clone()),
      revision_id: revision_id.clone(),
      store_number: store_number.clone(),
      db_path: db_path.clone(),
      last_scanned: None,
    });
  }

  SHOULD_STOP.store(false, Ordering::SeqCst);

  let bind_addr = format!("0.0.0.0:{}", port);
  let local_ip = get_local_ip();

  // Генерируем самоподписанный SSL сертификат для включения аппаратного потокового видео-сканера (MediaDevices)
  let mut san_list = vec!["localhost".to_string(), "127.0.0.1".to_string(), local_ip.clone()];
  for iface in get_available_ips() {
    if !san_list.contains(&iface.ip) {
      san_list.push(iface.ip);
    }
  }

  let (server, is_https) = match rcgen::generate_simple_self_signed(san_list) {
    Ok(certified_key) => {
      let ssl_config = SslConfig {
        certificate: certified_key.cert.pem().into_bytes(),
        private_key: certified_key.key_pair.serialize_pem().into_bytes(),
      };
      match Server::https(&bind_addr, ssl_config) {
        Ok(s) => (s, true),
        Err(e) => {
          log::warn!("Не удалось запустить HTTPS ({}), переключаемся на HTTP: {}", bind_addr, e);
          let s = Server::http(&bind_addr)
            .map_err(|e| format!("Не удалось запустить сервер на {}: {}", bind_addr, e))?;
          (s, false)
        }
      }
    }
    Err(e) => {
      log::warn!("Ошибка генерации SSL ({}), запускаем HTTP: {}", bind_addr, e);
      let s = Server::http(&bind_addr)
        .map_err(|e| format!("Не удалось запустить сервер на {}: {}", bind_addr, e))?;
      (s, false)
    }
  };

  SERVER_IS_HTTPS.store(is_https, Ordering::SeqCst);
  SERVER_RUNNING.store(true, Ordering::SeqCst);

  let scheme = if is_https { "https" } else { "http" };
  let server_info = MobileServerInfo {
    is_running: true,
    port,
    local_ip: local_ip.clone(),
    url: format!("{}://{}:{}/?rev={}", scheme, local_ip, port, revision_id),
    revision_id,
    store_number,
    last_scanned: None,
  };

  // Фоновый поток обработки HTTP-запросов
  thread::spawn(move || {
    let html_content = get_mobile_html();

    while !SHOULD_STOP.load(Ordering::SeqCst) {
      // tiny_http recv_timeout позволяет мягко завершать поток
      match server.recv_timeout(Duration::from_millis(500)) {
        Ok(Some(mut request)) => {
          let url = request.url().to_string();
          let method = request.method().clone();

          // CORS preflight
          if method == Method::Options {
            let mut empty = Response::empty(StatusCode(204));
            for h in cors_headers() {
              empty.add_header(h);
            }
            let _ = request.respond(empty);
            continue;
          }

          let (path, query) = match url.split_once('?') {
            Some((p, q)) => (p, q),
            None => (url.as_str(), ""),
          };

          // Парсинг query params
          let query_map: std::collections::HashMap<String, String> = query
            .split('&')
            .filter_map(|kv| {
              let mut parts = kv.splitn(2, '=');
              let k = parts.next()?;
              let v = parts.next().unwrap_or("");
              let decoded_val = urlencoding_decode(v);
              Some((k.to_string(), decoded_val))
            })
            .collect();

          // Текущее состояние
          let (app_handle_opt, active_rev, active_store, current_db) = {
            let state = SERVER_STATE.lock().unwrap();
            match state.as_ref() {
              Some(s) => (s.app_handle.clone(), s.revision_id.clone(), s.store_number.clone(), s.db_path.clone()),
              None => (None, String::new(), String::new(), PathBuf::new()),
            }
          };

          // Роутинг
          let is_post = method == Method::Post;
          match (method, path) {
            (Method::Get, "/") | (Method::Get, "/index.html") | (Method::Get, "/mobile") => {
              let _ = request.respond(respond_html(&html_content));
            }

            (Method::Get, "/js/zxing.min.js") => {
              const ZXING_JS: &str = include_str!("../../node_modules/@zxing/library/umd/index.min.js");
              let _ = request.respond(respond_js(ZXING_JS));
            }

            (Method::Get, "/api/status") => {
              let res = json!({
                "status": "ok",
                "is_running": true,
                "revision_id": active_rev,
                "store_number": active_store,
              });
              let _ = request.respond(respond_json(&res, 200));
            }

            (Method::Get, "/api/catalog/search") => {
              let q = query_map.get("q").cloned().unwrap_or_default();
              match search_catalog(&current_db, &q) {
                Ok(items) => {
                  let _ = request.respond(respond_json(&json!({ "success": true, "items": items }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 500));
                }
              }
            }

            (Method::Get, "/api/product/details") => {
              let code = query_map.get("code").or_else(|| query_map.get("q")).cloned().unwrap_or_default();
              match get_product_details(&current_db, &code) {
                Ok(Some(product)) => {
                  let _ = request.respond(respond_json(&json!({ "success": true, "found": true, "product": product }), 200));
                }
                Ok(None) => {
                  let _ = request.respond(respond_json(&json!({ "success": true, "found": false }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 500));
                }
              }
            }

            (Method::Get, "/api/tasks") => {
              match get_tasks(&current_db, &active_rev) {
                Ok(tasks) => {
                  let _ = request.respond(respond_json(&json!({ "success": true, "tasks": tasks }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 500));
                }
              }
            }

            (Method::Post, "/api/tasks") => {
              let mut body = String::new();
              let _ = request.as_reader().read_to_string(&mut body);
              let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
              let task_name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");

              match create_task(&current_db, &active_rev, task_name) {
                Ok(task) => {
                  if let Some(app) = &app_handle_opt {
                    let _ = app.emit("mobile-sync", json!({
                      "type": "task_created",
                      "task": task_name,
                      "revision_id": active_rev
                    }));
                  }
                  let _ = request.respond(respond_json(&json!({ "success": true, "task": task }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                }
              }
            }

            (Method::Post, "/api/task/delete") => {
              let mut body = String::new();
              let _ = request.as_reader().read_to_string(&mut body);
              let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
              let task_name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");

              match delete_task(&current_db, task_name) {
                Ok(_) => {
                  if let Some(app) = &app_handle_opt {
                    let _ = app.emit("mobile-sync", json!({
                      "type": "task_deleted",
                      "task": task_name,
                      "revision_id": active_rev
                    }));
                  }
                  let _ = request.respond(respond_json(&json!({ "success": true }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                }
              }
            }

            (Method::Get, "/api/task/items") | (Method::Post, "/api/task/items") => {
              let location_str = if is_post {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
                val.get("location").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_default()
              } else {
                query_map.get("location").cloned().unwrap_or_default()
              };
              match get_task_items(&current_db, &location_str, &active_rev, &active_store) {
                Ok((status, items)) => {
                  let _ = request.respond(respond_json(&json!({ "success": true, "status": status, "items": items }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 500));
                }
              }
            }

            (Method::Post, "/api/scan") => {
              let mut body = String::new();
              let _ = request.as_reader().read_to_string(&mut body);
              let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
              let location = val.get("location").and_then(|v| v.as_str()).unwrap_or("");
              let barcode = val.get("barcode").and_then(|v| v.as_str()).unwrap_or("");
              let qty = val.get("quantity").and_then(|v| v.as_i64()).unwrap_or(1);
              let box_number = val.get("box_number").and_then(|v| v.as_str()).unwrap_or("");
              let allow_unknown = val.get("allow_unknown").and_then(|v| v.as_bool()).unwrap_or(false);

              match scan_barcode(&current_db, &active_rev, &active_store, location, barcode, qty, box_number, allow_unknown) {
                Ok(item) => {
                  {
                    let mut state = SERVER_STATE.lock().unwrap();
                    if let Some(s) = state.as_mut() {
                      s.last_scanned = Some(format!("{} → {} (+{})", item.sku, location, qty));
                    }
                  }
                  if let Some(app) = &app_handle_opt {
                    let _ = app.emit("mobile-sync", json!({
                      "type": "item_scanned",
                      "barcode": item.barcode,
                      "sku": item.sku,
                      "name": item.name,
                      "location": location,
                      "add_qty": qty,
                      "quantity": item.quantity,
                      "box_number": item.box_number,
                      "item_id": item.id,
                      "revision_id": active_rev
                    }));
                  }
                  let _ = request.respond(respond_json(&json!({ "success": true, "item": item }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                }
              }
            }

            (Method::Post, "/api/task/complete") => {
              let mut body = String::new();
              let _ = request.as_reader().read_to_string(&mut body);
              let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
              let task_name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");

              match complete_task(&current_db, &active_rev, &active_store, task_name) {
                Ok(res) => {
                  {
                    let mut state = SERVER_STATE.lock().unwrap();
                    if let Some(s) = state.as_mut() {
                      s.last_scanned = Some(format!("Задача «{}» завершена ({} поз.)", res.task, res.items_count));
                    }
                  }
                  if let Some(app) = &app_handle_opt {
                    let _ = app.emit("mobile-sync", json!({
                      "type": "task_completed",
                      "task": res.task,
                      "items_count": res.items_count,
                      "total_qty": res.total_qty,
                      "revision_id": active_rev
                    }));
                  }
                  let _ = request.respond(respond_json(&json!({
                    "success": true,
                    "task": res.task,
                    "items_count": res.items_count,
                    "total_qty": res.total_qty
                  }), 200));
                }
                Err(e) => {
                  let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                }
              }
            }

            (Method::Post, "/api/item/update") => {
              let mut body = String::new();
              let _ = request.as_reader().read_to_string(&mut body);
              let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
              let item_id = val.get("id").and_then(|v| v.as_str()).unwrap_or("");
              let location = val.get("location").and_then(|v| v.as_str()).unwrap_or("");

              if let Some(box_num) = val.get("box_number").and_then(|v| v.as_str()) {
                match update_item_box(&current_db, item_id, box_num, location) {
                  Ok(_) => {
                    if let Some(app) = &app_handle_opt {
                      let _ = app.emit("mobile-sync", json!({
                        "type": "box_updated",
                        "item_id": item_id,
                        "box_number": box_num,
                        "location": location,
                        "revision_id": active_rev
                      }));
                    }
                    let _ = request.respond(respond_json(&json!({ "success": true }), 200));
                  }
                  Err(e) => {
                    let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                  }
                }
              } else {
                let new_qty = val.get("quantity").and_then(|v| v.as_i64()).unwrap_or(0);
                match update_item_qty(&current_db, item_id, new_qty, location) {
                  Ok(_) => {
                    if let Some(app) = &app_handle_opt {
                      let _ = app.emit("mobile-sync", json!({
                        "type": "item_updated",
                        "item_id": item_id,
                        "quantity": new_qty,
                        "location": location,
                        "revision_id": active_rev
                      }));
                    }
                    let _ = request.respond(respond_json(&json!({ "success": true }), 200));
                  }
                  Err(e) => {
                    let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
                  }
                }
              }
            }

            _ => {
              let _ = request.respond(Response::from_string("Not Found").with_status_code(StatusCode(404)));
            }
          }
        }
        Ok(None) => {}
        Err(_) => {}
      }
    }

    SERVER_RUNNING.store(false, Ordering::SeqCst);
  });

  Ok(server_info)
}

/// Остановка сервера
pub fn stop_server() -> Result<(), String> {
  SHOULD_STOP.store(true, Ordering::SeqCst);
  SERVER_RUNNING.store(false, Ordering::SeqCst);
  Ok(())
}

/// Получить текущий статус сервера
pub fn get_server_info(port: u16) -> MobileServerInfo {
  let is_running = SERVER_RUNNING.load(Ordering::SeqCst);
  let local_ip = get_local_ip();

  let state = SERVER_STATE.lock().unwrap();
  let (rev_id, store_num, last_scan) = match state.as_ref() {
    Some(s) => (s.revision_id.clone(), s.store_number.clone(), s.last_scanned.clone()),
    None => (String::new(), String::new(), None),
  };

  let scheme = if SERVER_IS_HTTPS.load(Ordering::SeqCst) { "https" } else { "http" };
  MobileServerInfo {
    is_running,
    port,
    local_ip: local_ip.clone(),
    url: format!("{}://{}:{}/?rev={}", scheme, local_ip, port, rev_id),
    revision_id: rev_id,
    store_number: store_num,
    last_scanned: last_scan,
  }
}

fn urlencoding_decode(s: &str) -> String {
  let mut bytes: Vec<u8> = Vec::with_capacity(s.len());
  let mut chars = s.as_bytes().iter();
  while let Some(&b) = chars.next() {
    if b == b'%' {
      let h1 = chars.next().copied().unwrap_or(b'0');
      let h2 = chars.next().copied().unwrap_or(b'0');
      let hex_str = [h1, h2];
      if let Ok(s_hex) = std::str::from_utf8(&hex_str) {
        if let Ok(byte) = u8::from_str_radix(s_hex, 16) {
          bytes.push(byte);
          continue;
        }
      }
      bytes.push(b'%');
      bytes.push(h1);
      bytes.push(h2);
    } else if b == b'+' {
      bytes.push(b' ');
    } else {
      bytes.push(b);
    }
  }
  String::from_utf8_lossy(&bytes).to_string()
}

/// HTML5 мобильное веб-приложение
fn get_mobile_html() -> String {
  r#"<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Ревизор — Мобильный Сканер</title>
  <script src="/js/zxing.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-live .dot {
      width: 6px;
      height: 6px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
    
    main { flex: 1; padding: 16px; max-width: 640px; margin: 0 auto; width: 100%; }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 18px;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary {
      background: #4f46e5;
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
      width: 100%;
    }
    .btn-secondary {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .btn-camera {
      background: #0ea5e9;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
    }
    .btn-finish {
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      color: #ffffff;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
      border: 1px solid rgba(52, 211, 153, 0.4);
      width: 100%;
      font-weight: 700;
      font-size: 15px;
      padding: 13px;
      border-radius: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s;
    }
    .btn-finish:active { transform: scale(0.98); background: #059669; }
    .btn-finish:disabled {
      background: #1e293b;
      color: #64748b;
      border-color: #334155;
      box-shadow: none;
      cursor: not-allowed;
    }
    .btn-header-finish {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-header-finish:active { transform: scale(0.95); background: rgba(16, 185, 129, 0.35); }
    .pill-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
    
    /* Tasks screen */
    .create-task-container {
      margin-bottom: 20px;
    }
    .task-input-box {
      display: none;
      background: #131d31;
      border: 1px solid #312e81;
      border-radius: 14px;
      padding: 14px;
      margin-top: 10px;
    }
    .input-field {
      width: 100%;
      background: #090d16;
      border: 1px solid #334155;
      border-radius: 10px;
      color: #f8fafc;
      padding: 12px 14px;
      font-size: 16px;
      outline: none;
    }
    .input-field:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
    }

    .section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .task-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .task-card:active { background: #172554; border-color: #3b82f6; }
    .task-name { font-size: 17px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
    .task-meta { font-size: 12px; color: #64748b; display: flex; gap: 10px; }
    .task-counts {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .pill-indigo { background: rgba(99, 102, 241, 0.2); color: #818cf8; }
    .pill-emerald { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .btn-delete-task {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #f87171;
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      cursor: pointer;
      margin-left: 6px;
      transition: all 0.15s;
    }
    .btn-delete-task:active {
      transform: scale(0.9);
      background: rgba(239, 68, 68, 0.35);
    }

    /* Task Detail Screen */
    .task-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .back-btn {
      background: #1e293b;
      border: none;
      color: #cbd5e1;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .scan-panel {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .scan-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .qty-picker {
      display: flex;
      align-items: center;
      background: #090d16;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 2px;
      width: 110px;
    }
    .qty-btn {
      width: 32px;
      height: 38px;
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      cursor: pointer;
    }
    .qty-val {
      flex: 1;
      text-align: center;
      font-weight: 700;
      color: #f8fafc;
      font-size: 15px;
    }

    /* Suggestions Dropdown */
    .suggestions-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: #0d1527;
      border: 1px solid #4338ca;
      box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.3);
      border-radius: 12px;
      max-height: 280px;
      overflow-y: auto;
      z-index: 60;
      -webkit-overflow-scrolling: touch;
    }
    #scanner-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.96);
      z-index: 9999;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 18px;
    }
    .scanner-mode-btn {
      flex: 1;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 600;
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .scanner-mode-btn.active {
      background: #4f46e5;
      color: #ffffff;
      border-color: #6366f1;
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
    }
    .scanner-viewfinder-wrapper {
      position: relative;
      width: 100%;
      max-width: 440px;
      flex: 1;
      min-height: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 16px;
      background: #000;
      border: 1px solid #334155;
    }
    #video-preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .scanner-aim-box {
      position: absolute;
      width: 75%;
      max-width: 270px;
      height: 170px;
      border: 2px solid rgba(56, 189, 248, 0.7);
      border-radius: 14px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
      pointer-events: none;
      transition: all 0.2s ease;
    }
    .scanner-aim-box.scanned-success {
      border-color: #10b981 !important;
      transform: scale(1.03);
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.9), 0 0 0 9999px rgba(0, 0, 0, 0.35);
    }
    .scanner-aim-box.scanned-error {
      border-color: #ef4444 !important;
      transform: scale(1.03);
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.9), 0 0 0 9999px rgba(0, 0, 0, 0.35);
    }
    .scanner-laser-line {
      position: absolute;
      left: 10px;
      right: 10px;
      height: 2px;
      background: linear-gradient(90deg, transparent, #ef4444, #f87171, #ef4444, transparent);
      box-shadow: 0 0 8px #ef4444;
      animation: laserScan 2s infinite ease-in-out;
      pointer-events: none;
    }
    @keyframes laserScan {
      0%, 100% { top: 15px; opacity: 0.8; }
      50% { top: 150px; opacity: 1; }
    }
    .scanner-hud-overlay {
      position: absolute;
      bottom: 12px;
      left: 12px;
      right: 12px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 8px 12px;
      color: #fff;
      font-size: 12px;
      text-align: center;
      transition: all 0.2s ease;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.35;
    }
    #camera-help-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      z-index: 10000;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .suggestion-item {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: background 0.12s;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .suggestion-item:hover, .suggestion-item:active, .suggestion-item.selected {
      background: rgba(99, 102, 241, 0.18);
    }
    .suggestion-sku-pill {
      display: inline-block;
      font-size: 13px;
      font-weight: 800;
      color: #a5b4fc;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.35);
      padding: 2px 7px;
      border-radius: 6px;
      letter-spacing: 0.02em;
    }
    .suggestion-name {
      font-size: 13px;
      color: #f1f5f9;
      margin-top: 4px;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    .suggestion-bc {
      font-size: 11px;
      color: #94a3b8;
      font-family: monospace;
    }
    .suggestion-add-btn {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      border: none;
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
      transition: all 0.12s;
    }
    .suggestion-add-btn:active {
      transform: scale(0.94);
      background: #4338ca;
    }

    /* Video Scanner */
    #video-preview {
      width: 100%;
      max-width: 420px;
      border-radius: 16px;
      border: 2px solid #0ea5e9;
      background: #000;
    }

    /* Product Card */
    .product-item {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .product-sku { font-family: monospace; font-size: 14px; font-weight: 700; color: #818cf8; }
    .product-bc { font-family: monospace; font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .product-name { font-size: 13px; color: #cbd5e1; margin-top: 2px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .product-qty-box {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .qty-circle-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qty-pill {
      min-width: 46px;
      text-align: center;
      font-size: 16px;
      font-weight: 800;
      color: #34d399;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .qty-pill:active {
      transform: scale(0.95);
      background: rgba(16, 185, 129, 0.3);
      border-color: #34d399;
    }

    /* Swipe to delete */
    .swipe-container {
      position: relative;
      overflow: hidden;
      border-radius: 12px;
      margin-bottom: 8px;
      background: #dc2626;
      touch-action: pan-y;
      user-select: none;
    }
    .swipe-delete-action {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      width: 90px;
      background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      cursor: pointer;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.02em;
      z-index: 1;
      box-shadow: inset 2px 0 6px rgba(0, 0, 0, 0.25);
    }
    .swipe-delete-action .delete-icon {
      font-size: 18px;
    }
    .swipe-delete-action:active {
      background: #991b1b;
    }
    .swipe-content {
      position: relative;
      z-index: 2;
      background: #0f172a;
      margin-bottom: 0 !important;
      will-change: transform;
    }
    .box-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      cursor: pointer;
    }
    .box-badge:active { transform: scale(0.96); }
    .box-badge-readonly {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      cursor: default;
      user-select: none;
    }
    .qty-pill-readonly {
      min-width: 44px;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      color: #34d399;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 4px 10px;
      border-radius: 8px;
      cursor: default;
      user-select: none;
    }
    .box-badge-empty {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 11px;
      color: #64748b;
      border: 1px dashed #334155;
      background: transparent;
      cursor: pointer;
    }
    .box-badge-empty:active { transform: scale(0.96); }

    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e1b4b;
      border: 1px solid #6366f1;
      color: #e0e7ff;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      z-index: 200;
      display: none;
      text-align: center;
    }

    /* Offline Banner & Connectivity Styles */
    #global-offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 999999;
      background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%);
      border-bottom: 2px solid #ef4444;
      box-shadow: 0 4px 25px rgba(239, 68, 68, 0.6);
      padding: 10px 14px;
      color: #fff;
      animation: slideDownAlert 0.25s ease-out;
    }
    @keyframes slideDownAlert {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .offline-banner-content {
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .offline-icon-pulse {
      font-size: 24px;
      animation: alertBlink 1s infinite alternate;
      flex-shrink: 0;
    }
    @keyframes alertBlink {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.2); opacity: 0.7; }
    }
    .offline-title {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.03em;
      color: #fef2f2;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .offline-subtitle {
      font-size: 11px;
      color: #fecaca;
      margin-top: 2px;
      line-height: 1.3;
      font-weight: 500;
    }
    .offline-retry-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: #fff;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .offline-retry-btn:active {
      background: rgba(255, 255, 255, 0.35);
    }
    .badge-offline {
      background: rgba(239, 68, 68, 0.2) !important;
      border-color: rgba(239, 68, 68, 0.5) !important;
      color: #fca5a5 !important;
    }
    .dot-offline {
      background: #ef4444 !important;
      animation: pulseFast 0.8s infinite !important;
    }
    @keyframes pulseFast {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.4); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Sync Buttons & Animations */
    .btn-header-sync {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      background: rgba(99, 102, 241, 0.18);
      border: 1px solid rgba(99, 102, 241, 0.45);
      color: #c7d2fe;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-header-sync:active {
      transform: scale(0.94);
      background: rgba(99, 102, 241, 0.35);
    }
    .btn-sync-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 14px;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.45);
      color: #ffffff;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
      transition: all 0.15s;
    }
    .btn-sync-action:active {
      transform: scale(0.96);
      background: rgba(255, 255, 255, 0.35);
    }
    .sync-icon {
      display: inline-block;
      transition: transform 0.2s ease;
    }
    .spinning {
      animation: spinAnimation 0.8s linear infinite !important;
      display: inline-block;
    }
    @keyframes spinAnimation {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- GLOBAL OFFLINE WARNING BANNER (Visible across all screens, camera, and modals) -->
  <div id="global-offline-banner" style="display: none;">
    <div class="offline-banner-content">
      <div class="offline-icon-pulse">⚠️</div>
      <div style="flex: 1; min-width: 0;">
        <div class="offline-title">Связь с компьютером потеряна!</div>
        <div class="offline-subtitle">
          Штрихкоды и ЛК НЕ сохраняются. Сканирование приостановлено. Проверьте Wi-Fi.
        </div>
      </div>
      <button type="button" class="offline-retry-btn" onclick="syncAppNow()">
        <span class="sync-icon">🔄</span> Синхронизировать
      </button>
    </div>
  </div>

  <header>
    <div>
      <div style="font-weight:800; font-size:15px; color:#fff;">Ревизор — Сканер</div>
      <div id="store-label" style="font-size:11px; color:#34d399; font-weight:600;">🟢 В сети · Подключено</div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <button id="header-sync-btn" type="button" class="btn-header-sync" onclick="syncAppNow()" title="Синхронизировать с ПК">
        <span class="sync-icon">🔄</span>
        <span>Синхр.</span>
      </button>
      <div class="badge-live">
        <span class="dot"></span>
        <span>ОНЛАЙН</span>
      </div>
    </div>
  </header>

  <main>
    <!-- SCREEN 1: TASKS LIST -->
    <div id="screen-tasks">
      <!-- Screen 1 Offline Alert -->
      <div id="tasks-offline-alert" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; text-align: center;">
        <div style="color: #f87171; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span>⚠️</span> Нет связи с компьютером!
        </div>
        <div style="color: #fca5a5; font-size: 11px; margin-top: 2px;">
          Создание и синхронизация задач временно недоступны. Проверьте сеть Wi-Fi.
        </div>
        <div>
          <button type="button" class="btn-sync-action" onclick="syncAppNow()">
            <span class="sync-icon">🔄</span> Синхронизировать
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="margin-bottom: 14px;">
        <button id="btn-show-create-task" class="btn btn-primary" style="width: 100%; padding: 13px; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="toggleCreateTaskInput()">
          <span>+ Локация</span>
        </button>
      </div>

      <div class="create-task-container">
        <div id="create-task-box" class="task-input-box">
          <div style="font-size: 13px; color: #94a3b8; margin-bottom: 6px; font-weight: 600;">
            Название задачи (локация для ШК):
          </div>
          <input id="input-task-name" type="text" class="input-field" placeholder="Например: Стеллаж 1, Витрина А..." onkeydown="if(event.key==='Enter') submitCreateTask()" />
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button id="btn-create-submit" class="btn btn-primary" style="flex: 2; padding: 10px;" onclick="submitCreateTask()">
              Создать и открыть
            </button>
            <button class="btn btn-secondary" style="flex: 1; padding: 10px;" onclick="toggleCreateTaskInput(false)">
              Отмена
            </button>
          </div>
        </div>
      </div>

      <div class="section-title">
        <span>Задачи (локации)</span>
        <span id="tasks-count" style="color: #818cf8;">0</span>
      </div>

      <div id="tasks-list">
        <div style="text-align:center; padding: 40px 10px; color:#64748b; font-size:14px;">
          Загрузка задач...
        </div>
      </div>
    </div>

    <!-- SCREEN 2: TASK DETAIL / SCANNING -->
    <div id="screen-detail" style="display: none;">
      <div class="task-header">
        <button class="back-btn" onclick="openTasksScreen()">←</button>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700;">Локация / Задача</span>
            <span id="task-status-pill" class="pill pill-amber" style="font-size: 10px; padding: 1px 6px;">В работе</span>
          </div>
          <div id="current-task-name" style="font-size: 18px; font-weight: 800; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">...</div>
        </div>
        <button id="btn-header-finish" class="btn-header-finish" onclick="completeCurrentTask()" title="Завершить задачу">✓ Завершить</button>
        <button class="btn-delete-task" style="width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;" onclick="deleteCurrentTask()" title="Удалить эту задачу">🗑</button>
      </div>

      <div class="scan-panel">
        <!-- Screen 2 Offline Alert -->
        <div id="detail-offline-alert" style="display: none; background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.6); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; text-align: center;">
          <div style="color: #f87171; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>⚠️</span> Связь с компьютером разорвана!
          </div>
          <div style="color: #fca5a5; font-size: 11px; margin-top: 2px;">
            Ввод и сканирование заблокированы, чтобы не потерять данные ревизии.
          </div>
          <div>
            <button type="button" class="btn-sync-action" onclick="syncAppNow()">
              <span class="sync-icon">🔄</span> Синхронизировать
            </button>
          </div>
        </div>

        <div id="scan-inputs-block">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-camera" style="flex: 1; padding: 13px; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="startCameraScanner()">
              <span style="font-size: 18px;">📷</span>
              <span>Сканировать камерой</span>
            </button>
            <input type="file" id="camera-file-input" accept="image/*" capture="environment" style="display: none;" onchange="handleCameraPhoto(event)" />
          </div>

          <div class="scan-row" style="position: relative;">
            <input id="input-barcode" type="text" inputmode="numeric" class="input-field" placeholder="Штрихкод / ЛК..." style="flex: 1;" autocomplete="off" oninput="onBarcodeInput(this.value)" onkeydown="onBarcodeKeydown(event)" onfocus="onBarcodeFocus()" />
            <div class="qty-picker">
              <button class="qty-btn" onclick="adjustInputQty(-1)">-</button>
              <span id="qty-picker-val" class="qty-val">1</span>
              <button class="qty-btn" onclick="adjustInputQty(1)">+</button>
            </div>
            <div id="barcode-suggestions" class="suggestions-dropdown" style="display: none;"></div>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 8px; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; background: #090d16; border: 1px solid #334155; border-radius: 10px; padding: 6px 12px;">
              <span style="font-size: 14px;">📦</span>
              <span style="font-size: 12px; color: #94a3b8; font-weight: 600; white-space: nowrap;">№ коробки:</span>
              <input id="input-box" type="text" class="input-field" placeholder="без коробки" style="border: none; background: transparent; padding: 2px 0; font-size: 14px; width: 100%; color: #fbbf24; font-weight: 700;" />
              <button type="button" onclick="document.getElementById('input-box').value = ''" style="background: none; border: none; color: #64748b; font-size: 14px; cursor: pointer; padding: 0 4px;" title="Очистить коробку">✕</button>
            </div>
          </div>

          <button class="btn btn-primary" style="margin-top: 10px; padding: 12px;" onclick="scanCurrentBarcode()">
            <span>✓ Добавить в задачу</span>
          </button>

          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #334155;">
            <button id="btn-complete-task" class="btn-finish" onclick="completeCurrentTask()">
              <span>✓ Завершить задачу</span>
            </button>
            <div id="complete-hint" style="font-size: 11px; color: #10b981; text-align: center; margin-top: 6px;">
              ⚡ Записанные ЛК сразу отправляются в приложение. Завершение задачи фиксирует локацию.
            </div>
          </div>
        </div>

        <div id="task-completed-banner" style="display: none; text-align: center; padding: 14px 10px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px;">
          <div style="font-size: 15px; font-weight: 800; color: #34d399;">✓ Задача завершена (отправлена)</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Все данные сохранены в приложении. Редактирование количества и коробок заблокировано.</div>
        </div>
      </div>

      <div class="section-title">
        <span>Посчитанные товары</span>
        <span id="items-summary" style="color: #34d399;">0 шт.</span>
      </div>

      <div id="items-list">
        <!-- Scanned items list -->
      </div>
    </div>
  </main>

  <!-- Video Scanner Modal (Full Screen Continuous Scanner) -->
  <div id="scanner-modal">
    <!-- Top Bar -->
    <div style="width: 100%; max-width: 440px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0 4px;">
      <div>
        <div style="color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
          <span id="scanner-task-title">Сканер штрихкодов</span>
        </div>
        <div style="color: #94a3b8; font-size: 11px;">
          Отсканировано: <b id="scanner-session-count" style="color: #38bdf8;">0</b> шт
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button type="button" class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="syncAppNow()" title="Синхронизировать">
          <span class="sync-icon">🔄</span>
        </button>
        <button id="scanner-torch-btn" class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px; display: none;" onclick="toggleTorch()">
          🔦 Вспышка
        </button>
        <button id="scanner-switch-cam-btn" class="btn btn-secondary" style="padding: 6px 10px; font-size: 12px;" onclick="switchCamera()" title="Сменить камеру">
          🔄 Камера
        </button>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px;" onclick="stopCameraScanner()">
          ✕ Закрыть
        </button>
      </div>
    </div>

    <!-- Mode Selector: Direct Add vs Search/Lookup -->
    <div style="width: 100%; max-width: 440px; display: flex; gap: 6px; margin-bottom: 8px;">
      <button id="scanner-mode-add" class="scanner-mode-btn active" onclick="setScannerMode('add')">
        ➕ Ревизия (+1 шт)
      </button>
      <button id="scanner-mode-search" class="scanner-mode-btn" onclick="setScannerMode('search')">
        🔍 Поиск в каталоге
      </button>
    </div>

    <!-- Viewfinder Container -->
    <div class="scanner-viewfinder-wrapper" onclick="onScannerViewfinderClick()">
      <video id="video-preview" autoplay playsinline webkit-playsinline muted></video>
      <div id="scanner-aim-box" class="scanner-aim-box">
        <div class="scanner-laser-line"></div>
      </div>
      <!-- HUD feedback overlay at bottom of camera -->
      <div id="scanner-hud-overlay" class="scanner-hud-overlay">
        <span>🎯 Наведите камеру на штрихкод или ЛК</span>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div style="width: 100%; max-width: 440px; margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
      <button type="button" class="btn btn-secondary" style="width: 100%; padding: 11px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; background: #1e293b; border: 1px solid #475569; color: #f1f5f9;" onclick="openScannerManualLkModal()">
        ⌨️ Ввести ЛК вручную
      </button>
      <button type="button" class="btn btn-primary" style="width: 100%; padding: 12px; font-size: 15px; font-weight: 700;" onclick="stopCameraScanner()">
        ✓ Завершить сканирование
      </button>
    </div>

    <!-- Scanner Manual LK Dialog Overlay -->
    <div id="scanner-manual-lk-modal" style="display: none; position: fixed; inset: 0; z-index: 10005; background: rgba(0,0,0,0.82); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px;">
      <div class="card" style="max-width: 380px; width: 100%; border: 1px solid #6366f1; text-align: left; box-shadow: 0 20px 40px rgba(0,0,0,0.9); margin: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 16px; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>⌨️</span> Ввод ЛК вручную
          </h3>
          <button type="button" onclick="closeScannerManualLkModal()" style="background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
        </div>
        <div style="margin-bottom: 6px;">
          <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">Номер ЛК или штрихкод:</label>
          <input id="scanner-manual-lk-input" type="text" inputmode="numeric" class="input-field" placeholder="Например: 123456..." style="width: 100%; font-size: 16px; padding: 10px 12px;" oninput="onScannerManualLkInput(this.value)" onkeydown="onScannerManualLkKeydown(event)" />
        </div>
        <div id="scanner-manual-lk-preview" style="min-height: 24px; font-size: 12px; margin-bottom: 10px; color: #94a3b8;"></div>
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <button type="button" class="btn btn-primary" style="flex: 1; padding: 11px; font-size: 14px; font-weight: 700;" onclick="submitScannerManualLk()">
            ✓ Добавить
          </button>
          <button type="button" class="btn btn-secondary" style="padding: 11px 14px; font-size: 13px;" onclick="closeScannerManualLkModal()">
            Отмена
          </button>
        </div>
        <div style="text-align: center; border-top: 1px solid #334155; padding-top: 8px;">
          <button type="button" onclick="goToMainManualInput()" style="background: none; border: none; color: #818cf8; font-size: 12px; cursor: pointer; text-decoration: underline;">
            Перейти к полной форме на экране
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- HTTPS Switch Modal -->
  <div id="https-switch-modal" style="display: none; position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.85); backdrop-filter: blur(6px); align-items: center; justify-content: center; padding: 16px;">
    <div class="card" style="max-width: 440px; width: 100%; border: 1px solid #6366f1; text-align: left; box-shadow: 0 20px 40px rgba(0,0,0,0.9);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 17px; color: #fff; display: flex; align-items: center; gap: 8px;">
          <span>🔒</span> Включение видео-сканера
        </h3>
        <button onclick="closeHttpsSwitchModal()" style="background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer;">✕</button>
      </div>
      <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin-bottom: 12px;">
        Чтобы камера работала <strong>как реальный лазерный сканер</strong> (живой видеопоток со звуком и непрерывным считыванием без фотографирования), браузеру телефона требуется безопасный протокол <b>HTTPS</b>.
      </div>
      <div style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 10px; padding: 12px; margin-bottom: 14px; font-size: 12px; color: #e0e7ff; line-height: 1.5;">
        Нажмите кнопку ниже. Браузер покажет однократное предупреждение <i>«Подключение не защищено»</i> — просто нажмите <b>«Дополнительно» ➔ «Перейти на сайт»</b>.
      </div>
      <button class="btn btn-primary" style="width: 100%; padding: 13px; font-size: 15px; font-weight: 700; margin-bottom: 8px;" onclick="switchToHttps()">
        🔒 Включить режим видео-сканера
      </button>
      <button class="btn btn-secondary" style="width: 100%; padding: 10px; font-size: 13px;" onclick="closeHttpsSwitchModal()">
        Закрыть
      </button>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <!-- Scan Success Feedback Modal -->
  <div id="scan-feedback-modal" style="display: none; position: fixed; bottom: 20px; left: 16px; right: 16px; max-width: 440px; margin: 0 auto; background: #0f172a; border: 1px solid #10b981; border-radius: 14px; padding: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.85); z-index: 9999;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div id="scan-feedback-title" style="color: #34d399; font-weight: 700; font-size: 15px;">✓ Товар добавлен (+1 шт)</div>
        <div id="scan-feedback-name" style="color: #fff; font-size: 13px; margin: 4px 0 2px; font-weight: 600;"></div>
        <div id="scan-feedback-sku" style="color: #94a3b8; font-size: 11px; font-family: monospace;"></div>
      </div>
      <button onclick="closeScanFeedback()" style="background: none; border: none; color: #64748b; font-size: 18px; cursor: pointer; padding: 0 4px;">✕</button>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 10px;">
      <button class="btn btn-primary" style="flex: 1; padding: 10px; font-size: 14px; font-weight: 700;" onclick="closeScanFeedback(); triggerPhotoCapture();">
        📸 Сканировать следующий товар
      </button>
      <button class="btn btn-secondary" style="padding: 10px 14px; font-size: 13px;" onclick="closeScanFeedback()">
        Готово
      </button>
    </div>
  </div>

  <!-- Scan Error Feedback Modal -->
  <div id="scan-error-modal" style="display: none; position: fixed; bottom: 20px; left: 16px; right: 16px; max-width: 440px; margin: 0 auto; background: #0f172a; border: 1px solid #ef4444; border-radius: 14px; padding: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.85); z-index: 9999;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="color: #f87171; font-weight: 700; font-size: 14px;">✕ Штрихкод не распознан</div>
        <div style="color: #cbd5e1; font-size: 12px; margin-top: 4px;">Сфотографируйте штрихкод ближе, ровнее и при хорошем освещении.</div>
      </div>
      <button onclick="closeScanError()" style="background: none; border: none; color: #64748b; font-size: 18px; cursor: pointer; padding: 0 4px;">✕</button>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 10px;">
      <button class="btn btn-primary" style="flex: 1; padding: 10px; font-size: 14px; font-weight: 700;" onclick="closeScanError(); triggerPhotoCapture();">
        📸 Сфотографировать снова
      </button>
      <button class="btn btn-secondary" style="padding: 10px 14px; font-size: 13px;" onclick="closeScanError()">
        Закрыть
      </button>
    </div>
  </div>

  <!-- Scan Not Found in Catalog Modal -->
  <div id="scan-not-found-modal" style="display: none; position: fixed; bottom: 20px; left: 16px; right: 16px; max-width: 440px; margin: 0 auto; background: #0f172a; border: 1px solid #f59e0b; border-radius: 14px; padding: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.85); z-index: 10006;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="color: #fbbf24; font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> Товар не найден в каталоге
        </div>
        <div id="scan-not-found-code" style="color: #fff; font-size: 13px; margin: 6px 0 2px; font-family: monospace; word-break: break-all;"></div>
        <div style="color: #cbd5e1; font-size: 12px; margin-top: 4px;">Штрихкод или ЛК отсутствует в каталоге магазина.</div>
      </div>
      <button type="button" onclick="closeScanNotFound()" style="background: none; border: none; color: #64748b; font-size: 18px; cursor: pointer; padding: 0 4px;">✕</button>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button type="button" class="btn btn-secondary" style="flex: 1; padding: 10px; font-size: 13px; font-weight: 700; background: #334155; border: 1px solid #64748b; color: #f8fafc;" onclick="addNotFoundAsNd()">
        ➕ Добавить как Н/Д (+1 шт)
      </button>
      <button type="button" class="btn btn-secondary" style="padding: 10px 14px; font-size: 13px;" onclick="closeScanNotFound()">
        Отмена
      </button>
    </div>
  </div>

  <!-- Модальное окно подтверждения сканирования («Добавление») -->
  <div id="product-details-modal" style="display: none; position: fixed; inset: 0; z-index: 10020; background: #121212; overflow-y: auto; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <!-- Шапка (зеленый бар) -->
    <div style="background: #2e7d32; color: #fff; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.4);">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button type="button" onclick="closeProductModal()" style="background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; padding: 0 4px; display: flex; align-items: center;">←</button>
        <span style="font-size: 18px; font-weight: 700; letter-spacing: 0.3px;">Добавление</span>
      </div>
      <button type="button" onclick="closeProductModal()" style="background: none; border: none; color: rgba(255,255,255,0.85); font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
    </div>

    <div style="padding: 14px; max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px;">
      <!-- Уведомление о Счете 299 -->
      <div id="pdm-alert-299" style="display: none; background: rgba(88, 28, 135, 0.4); border: 1px solid #a855f7; border-radius: 10px; padding: 10px 14px; align-items: center; gap: 10px; color: #f3e8ff; font-size: 13px; font-weight: 600; box-shadow: 0 2px 10px rgba(168, 85, 247, 0.2);">
        <span style="font-size: 16px;">🟣</span>
        <span>Товар числится в списке Счета 299</span>
      </div>

      <!-- Карточка 1: Данные о товаре -->
      <div style="background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 12px; padding: 14px 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Данные о товаре</div>
          <span id="pdm-badge-299" style="display: none; background: #581c87; color: #f3e8ff; border: 1px solid #a855f7; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; letter-spacing: 0.5px; box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);">СЧЕТ 299</span>
        </div>
        <div style="font-size: 15px; color: #f8fafc; font-weight: 600;">
          Локальный код: <span id="pdm-sku" style="color: #38bdf8; font-family: monospace;">—</span>
        </div>
        <div id="pdm-name" style="font-size: 14px; color: #cbd5e1; margin-top: 6px; line-height: 1.4; font-weight: 500;">—</div>
        <div id="pdm-bc-row" style="font-size: 12px; color: #64748b; margin-top: 4px; font-family: monospace; display: none;">
          Штрихкод: <span id="pdm-bc">—</span>
        </div>
      </div>

      <!-- Карточка 2: Номер коробки -->
      <div style="background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 12px; padding: 14px 16px;">
        <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Номер коробки</div>
        <input id="pdm-box-input" type="text" class="input-field" placeholder="Номер коробки..." style="width: 100%; background: #2a2a2a; border: 1px solid #3f3f46; border-radius: 8px; padding: 10px 14px; font-size: 16px; color: #fff;" onkeydown="if(event.key==='Enter') submitProductModal()" />
      </div>

      <!-- Карточка 3: Введите данные об остатках -->
      <div style="background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 12px; padding: 14px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-weight: 700; font-size: 15px; color: #f8fafc;">Введите данные об остатках</div>
          <span style="color: #94a3b8; font-size: 12px;">▲</span>
        </div>
        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 12px; line-height: 1.4;">
          <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px;">
            <span>Посчитанное ранее количество:</span>
            <b id="pdm-debarkader-qty" style="color: #38bdf8; font-size: 16px;">0</b>
            <span id="pdm-locations-inline" style="color: #94a3b8; font-size: 13px;"></span>
          </div>
          <div id="pdm-locations-chips" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; background: #262626; padding: 8px 12px; border-radius: 8px;">
          <label for="pdm-qty-input" id="pdm-input-label" style="color: #fff; font-size: 15px; font-weight: 500;">Дебаркадер:</label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input id="pdm-qty-input" type="number" inputmode="numeric" min="1" class="input-field" style="width: 120px; background: #1a1a1a; border: 1px solid #52525b; border-radius: 6px; padding: 8px 10px; font-size: 17px; color: #fff; text-align: center; font-weight: 700;" oninput="onPdmQtyChange(this.value)" onkeydown="if(event.key==='Enter') submitProductModal()" />
          </div>
        </div>
      </div>

      <!-- Карточка 4: Остатки по данным SAP -->
      <div style="background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 12px; padding: 14px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-weight: 700; font-size: 15px; color: #f8fafc;">Остатки по данным SAP</div>
          <span style="color: #94a3b8; font-size: 12px;">▲</span>
        </div>
        <div style="font-size: 14px; color: #e2e8f0; margin-bottom: 8px;">
          Остаток в магазине: <b id="pdm-sap-stock" style="color: #38bdf8;">0</b>
        </div>
        <div style="font-size: 14px; color: #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
          <span>Кратность коробки: <b id="pdm-sap-mult" style="color: #fbbf24;">1</b></span>
          <button id="pdm-apply-mult-btn" type="button" onclick="applyPdmMultiplicity()" style="display: none; background: #334155; border: 1px solid #64748b; color: #f8fafc; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer;">Вставить кратность</button>
        </div>
      </div>

      <!-- Кнопки действий -->
      <div style="display: flex; gap: 10px; margin-top: 8px; margin-bottom: 24px;">
        <button id="pdm-submit-btn" type="button" onclick="submitProductModal()" style="flex: 1; padding: 14px; background: #2e7d32; border: 1px solid #4caf50; color: #fff; font-size: 16px; font-weight: 700; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>✓ Добавить</span>
        </button>
        <button type="button" onclick="closeProductModal()" style="padding: 14px 20px; background: #262626; border: 1px solid #3f3f46; color: #cbd5e1; font-size: 15px; border-radius: 10px; cursor: pointer;">
          Отмена
        </button>
      </div>
    </div>
  </div>

  <script>
    let activeTask = null;
    let currentTaskStatus = 'in_progress';
    let currentItemsCount = 0;
    let currentTotalQty = 0;
    let inputQty = 1;
    let videoStream = null;
    let barcodeDetector = null;
    let audioCtx = null;
    let searchDebounceTimer = null;
    let currentSearchAbort = null;
    let currentSuggestions = [];
    let selectedSuggestionIndex = -1;
    let currentModalProduct = null;
    let isProductModalOpen = false;

    let isServerOnline = true;
    let isCheckingConnection = false;
    let cachedStoreInfo = '';

    function playBeep() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.12);
      } catch (e) {}
      if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch (e) {}
      }
    }

    function playErrorTone() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(160, audioCtx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.35);
      } catch (e) {}
      if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {}
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2600);
    }

    function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const signal = options.signal || controller.signal;
      return fetch(url, { ...options, signal })
        .finally(() => clearTimeout(timeoutId));
    }

    function setOnlineState(online, reason = '') {
      const prev = isServerOnline;
      isServerOnline = online;

      const banner = document.getElementById('global-offline-banner');
      const tasksAlert = document.getElementById('tasks-offline-alert');
      const detailAlert = document.getElementById('detail-offline-alert');
      const storeLabel = document.getElementById('store-label');
      const badgeLive = document.querySelector('.badge-live');
      const hud = document.getElementById('scanner-hud-overlay');

      if (!online) {
        if (banner) banner.style.display = 'block';
        if (tasksAlert) tasksAlert.style.display = 'block';
        if (detailAlert) detailAlert.style.display = 'block';
        if (storeLabel) {
          storeLabel.innerHTML = '<span style="color:#ef4444; font-weight:700;">🔴 НЕТ СВЯЗИ С ПК</span> · Wi-Fi отключен?';
        }
        if (badgeLive) {
          badgeLive.className = 'badge-live badge-offline';
          badgeLive.innerHTML = '<span class="dot dot-offline"></span><span>ОФФЛАЙН</span>';
        }
        const scannerModal = document.getElementById('scanner-modal');
        if (hud && scannerModal && scannerModal.style.display === 'flex') {
          hud.innerHTML = '<span style="color: #ef4444; font-weight: 800; font-size: 13px;">⚠️ НЕТ СВЯЗИ С ПК! Сканирование приостановлено</span>';
        }

        // Если только что перешли в offline
        if (prev === true) {
          playErrorTone();
          showToast('⚠️ ВНИМАНИЕ: Связь с компьютером разорвана!');
        }
      } else {
        if (banner) banner.style.display = 'none';
        if (tasksAlert) tasksAlert.style.display = 'none';
        if (detailAlert) detailAlert.style.display = 'none';
        const storeTxt = cachedStoreInfo || 'Подключено к ПК';
        if (storeLabel) {
          storeLabel.innerHTML = `<span style="color:#34d399; font-weight:700;">🟢 В сети</span> · ${escapeHtml(storeTxt)}`;
        }
        if (badgeLive) {
          badgeLive.className = 'badge-live';
          badgeLive.innerHTML = '<span class="dot"></span><span>ОНЛАЙН</span>';
        }
        const scannerModal = document.getElementById('scanner-modal');
        if (hud && scannerModal && scannerModal.style.display === 'flex') {
          hud.innerHTML = scannerMode === 'add' 
            ? '<span>🎯 Режим ревизии (+1 шт). Наведите на ШК или ЛК</span>' 
            : '<span>🔍 Режим поиска. Наведите на ШК или ЛК для подстановки в поиск</span>';
        }

        // Если связь восстановилась
        if (prev === false) {
          playBeep();
          showToast('🟢 Связь с компьютером восстановлена!');
          if (activeTask) {
            loadTaskItems();
          } else {
            loadTasks();
          }
        }
      }
    }

    let isSyncing = false;
    async function syncAppNow() {
      if (isSyncing) return;
      isSyncing = true;

      const icons = document.querySelectorAll('.sync-icon');
      icons.forEach(ic => ic.classList.add('spinning'));

      showToast('⏳ Синхронизация с компьютером...');

      try {
        const res = await fetchWithTimeout('/api/status?t=' + Date.now(), { cache: 'no-store' }, 3000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.status === 'ok') {
          if (data.store_number) {
            cachedStoreInfo = 'Магазин №' + data.store_number;
          }
          setOnlineState(true);

          if (activeTask) {
            await loadTaskItems();
          } else {
            await loadTasks();
          }

          playBeep();
          showToast('✓ Данные успешно синхронизированы!');
        } else {
          throw new Error('Некорректный статус');
        }
      } catch (err) {
        setOnlineState(false, err.message || '' + err);
        playErrorTone();
        showToast('✕ Ошибка синхронизации: нет связи с ПК!');
      } finally {
        setTimeout(() => {
          icons.forEach(ic => ic.classList.remove('spinning'));
          isSyncing = false;
        }, 500);
      }
    }

    async function checkConnectionNow(isManual = false) {
      if (isCheckingConnection) return;
      isCheckingConnection = true;
      try {
        const res = await fetchWithTimeout('/api/status?t=' + Date.now(), { cache: 'no-store' }, 2500);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.status === 'ok') {
          if (data.store_number) {
            cachedStoreInfo = 'Магазин №' + data.store_number;
          }
          setOnlineState(true);
          if (isManual) {
            showToast('🟢 Связь с компьютером работает');
          }
        } else {
          throw new Error('Invalid status');
        }
      } catch (err) {
        setOnlineState(false, err.message || '' + err);
        if (isManual) {
          showToast('🔴 Нет связи с компьютером!');
        }
      } finally {
        isCheckingConnection = false;
      }
    }

    async function initApp() {
      await checkConnectionNow();
      loadTasks();

      // Быстрая проверка связи каждые 2.5 сек на всех вкладках
      setInterval(() => {
        checkConnectionNow();
      }, 2500);

      // Периодическое автообновление списка задач с ПК (раз в 4 сек)
      setInterval(() => {
        if (!activeTask && isServerOnline) {
          loadTasks();
        }
      }, 4000);
    }

    window.addEventListener('online', () => {
      checkConnectionNow();
    });
    window.addEventListener('offline', () => {
      setOnlineState(false, 'Браузер сообщил об отключении сети');
    });


    function toggleCreateTaskInput(show) {
      const box = document.getElementById('create-task-box');
      const isVisible = box.style.display === 'block';
      const nextState = show !== undefined ? show : !isVisible;
      box.style.display = nextState ? 'block' : 'none';
      if (nextState) {
        const inp = document.getElementById('input-task-name');
        inp.value = '';
        inp.focus();
      }
    }

    let isSubmittingTask = false;
    async function submitCreateTask() {
      if (isSubmittingTask) return;
      const inp = document.getElementById('input-task-name');
      const name = inp.value.trim();
      if (!name) return;

      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! Невозможно создать задачу.');
        return;
      }

      isSubmittingTask = true;
      const btn = document.getElementById('btn-create-submit');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Создание...';
      }

      try {
        const res = await fetchWithTimeout('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          toggleCreateTaskInput(false);
          openTaskDetail(name);
        } else {
          alert(data.error || 'Ошибка создания задачи');
        }
      } catch (e) {
        alert('Ошибка сети: ' + e);
      } finally {
        isSubmittingTask = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Создать и открыть';
        }
      }
    }

    async function loadTasks() {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        const container = document.getElementById('tasks-list');
        if (!data.success || !data.tasks || data.tasks.length === 0) {
          container.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px dashed rgba(99, 102, 241, 0.4); border-radius: 14px; padding: 26px 16px; text-align: center; margin-top: 10px;">
              <div style="font-size: 32px; margin-bottom: 8px;">📱</div>
              <div style="color: #fff; font-weight: 700; font-size: 16px; margin-bottom: 4px;">Локации пока не созданы</div>
              <div style="color: #94a3b8; font-size: 13px; line-height: 1.4; margin-bottom: 16px;">
                Связь с компьютером установлена!<br>Создайте локацию, чтобы начать учёт товаров.
              </div>
              <button class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="toggleCreateTaskInput(true)">
                <span>+ Создать локацию</span>
              </button>
            </div>
          `;
          document.getElementById('tasks-count').textContent = '0';
          return;
        }
        document.getElementById('tasks-count').textContent = data.tasks.length;
        container.innerHTML = data.tasks.map(t => {
          const isDone = t.status === 'completed';
          return `
          <div class="task-card" data-task="${escapeHtml(t.name)}" onclick="openTaskDetail(this.dataset.task)">
            <div style="flex: 1; min-width: 0;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                <div class="task-name" style="margin-bottom:0;">${escapeHtml(t.name)}</div>
                ${isDone 
                  ? '<span class="pill pill-emerald" style="font-size:10px; padding:2px 6px;">✓ Завершена</span>' 
                  : '<span class="pill pill-amber" style="font-size:10px; padding:2px 6px;">⏳ В работе</span>'
                }
              </div>
              <div class="task-meta">
                <span>📅 ${escapeHtml(t.updated_at || t.created_at)}</span>
              </div>
            </div>
            <div class="task-counts" style="flex-shrink: 0;">
              <span class="pill pill-indigo">${t.items_count} поз.</span>
              <span class="pill pill-emerald">${t.total_qty} шт.</span>
              <button class="btn-delete-task" onclick="event.stopPropagation(); deleteTask('${escapeHtml(t.name)}')" title="Удалить задачу">🗑</button>
              <span style="color:#64748b; font-size:16px; margin-left:4px;">→</span>
            </div>
          </div>
        `}).join('');
      } catch (e) {
        document.getElementById('tasks-list').innerHTML = '<div style="color:#ef4444; padding:20px; text-align:center;">Ошибка загрузки задач</div>';
      }
    }

    async function deleteTask(taskName) {
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! Невозможно удалить задачу.');
        return;
      }
      if (!confirm(`Удалить задачу «${taskName}»?`)) return;
      try {
        const res = await fetchWithTimeout('/api/task/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: taskName })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          showToast(`Задача «${taskName}» удалена`);
          if (activeTask === taskName) {
            openTasksScreen();
          } else {
            loadTasks();
          }
        } else {
          alert(data.error || 'Ошибка удаления задачи');
        }
      } catch (e) {
        alert('Ошибка связи: ' + e);
      }
    }

    function deleteCurrentTask() {
      if (activeTask) {
        deleteTask(activeTask);
      }
    }

    function openTaskDetail(taskName, autoFocus = false) {
      activeTask = taskName;
      currentTaskStatus = 'in_progress';
      document.getElementById('screen-tasks').style.display = 'none';
      document.getElementById('screen-detail').style.display = 'block';
      document.getElementById('current-task-name').textContent = taskName;
      document.getElementById('input-barcode').value = '';
      hideSuggestions();
      inputQty = 1;
      document.getElementById('qty-picker-val').textContent = '1';
      loadTaskItems();
      if (autoFocus) {
        setTimeout(() => document.getElementById('input-barcode').focus(), 150);
      }
    }

    function openTasksScreen() {
      activeTask = null;
      hideSuggestions();
      document.getElementById('screen-detail').style.display = 'none';
      document.getElementById('screen-tasks').style.display = 'block';
      stopCameraScanner();
      loadTasks();
    }

    function adjustInputQty(delta) {
      inputQty = Math.max(1, inputQty + delta);
      document.getElementById('qty-picker-val').textContent = inputQty;
    }

    async function loadTaskItems() {
      if (!activeTask) return;
      try {
        const res = await fetch('/api/task/items?location=' + encodeURIComponent(activeTask));
        const data = await res.json();
        const container = document.getElementById('items-list');

        currentTaskStatus = data.status || 'in_progress';
        const isDone = currentTaskStatus === 'completed';
        const statusPill = document.getElementById('task-status-pill');
        const btnHeaderFinish = document.getElementById('btn-header-finish');
        const scanInputsBlock = document.getElementById('scan-inputs-block');
        const taskCompletedBanner = document.getElementById('task-completed-banner');

        if (isDone) {
          statusPill.className = 'pill pill-emerald';
          statusPill.textContent = '✓ Завершена';
          btnHeaderFinish.style.display = 'none';
          if (scanInputsBlock) scanInputsBlock.style.display = 'none';
          if (taskCompletedBanner) taskCompletedBanner.style.display = 'block';
        } else {
          statusPill.className = 'pill pill-amber';
          statusPill.textContent = '⏳ В работе';
          btnHeaderFinish.style.display = 'inline-flex';
          if (scanInputsBlock) scanInputsBlock.style.display = 'block';
          if (taskCompletedBanner) taskCompletedBanner.style.display = 'none';
          const btnComplete = document.getElementById('btn-complete-task');
          if (btnComplete) {
            btnComplete.innerHTML = '<span>✓ Завершить задачу</span>';
            btnComplete.className = 'btn-finish';
            btnComplete.disabled = false;
            btnComplete.style.background = '';
            btnComplete.style.borderColor = '';
            btnComplete.style.color = '';
          }
        }

        if (!data.success || !data.items || data.items.length === 0) {
          currentItemsCount = 0;
          currentTotalQty = 0;
          container.innerHTML = '<div style="text-align:center; padding: 30px 10px; color:#64748b; font-size:14px;">В этой задаче пока нет товаров.<br>Отсканируйте ШК выше!</div>';
          document.getElementById('items-summary').textContent = '0 шт.';
          return;
        }

        let totalSum = 0;
        data.items.forEach(i => totalSum += i.quantity);
        currentItemsCount = data.items.length;
        currentTotalQty = totalSum;
        document.getElementById('items-summary').textContent = `${data.items.length} поз. / ${totalSum} шт.`;

        container.innerHTML = data.items.map(item => {
          const rawBc = (item.barcode || '').trim();
          let displayBc = '—';
          if (rawBc && rawBc !== item.sku) {
            const parts = rawBc.split(',').map(b => b.trim()).filter(Boolean);
            displayBc = parts[0] || '—';
          }
          const boxHtml = item.box_number
            ? `<span class="box-badge-readonly" title="Номер коробки зафиксирован">📦 № ${escapeHtml(item.box_number)}</span>`
            : (!isDone
                ? `<span class="box-badge-empty" onclick="promptEditBox('${item.id}', '')" title="Нажмите, чтобы указать номер коробки">+ кор</span>`
                : ''
              );
          const qtyHtml = isDone
            ? `<span class="qty-pill-readonly">${item.quantity} шт.</span>`
            : `<span class="qty-pill" onclick="promptEditQty('${item.id}', ${item.quantity})" title="Нажмите для изменения количества">${item.quantity}</span>`;

          const safeSku = escapeHtml(item.sku);
          const safeName = escapeHtml(item.name || '');

          if (isDone) {
            return `
              <div class="product-item">
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="product-sku">ЛК: ${safeSku}</span>
                    ${boxHtml}
                  </div>
                  <div class="product-bc" title="${escapeHtml(rawBc)}">ШК: ${escapeHtml(displayBc)}</div>
                  ${item.name === 'Н/Д' 
                    ? '<div style="margin-top: 2px;"><span class="pill pill-rose" style="font-size: 10px; padding: 1px 6px;">Н/Д</span> <span style="color: #94a3b8; font-size: 12px; font-style: italic;">Товар отсутствует в каталоге</span></div>' 
                    : `<div class="product-name" title="${safeName}">${safeName}</div>`
                  }
                </div>
                <div class="product-qty-box">
                  ${qtyHtml}
                </div>
              </div>
            `;
          }

          return `
            <div class="swipe-container" data-item-id="${item.id}">
              <div class="swipe-delete-action" onclick="confirmDeleteItem('${item.id}', '${safeSku}', '${safeName}', this.parentElement.querySelector('.swipe-content'))">
                <span class="delete-icon">🗑</span>
                <span class="delete-label">Удалить</span>
              </div>
              <div class="product-item swipe-content"
                   ontouchstart="handleSwipeTouchStart(event, this)"
                   ontouchmove="handleSwipeTouchMove(event, this)"
                   ontouchend="handleSwipeTouchEnd(event, this, '${item.id}', '${safeSku}', '${safeName}')">
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="product-sku">ЛК: ${safeSku}</span>
                    ${boxHtml}
                  </div>
                  <div class="product-bc" title="${escapeHtml(rawBc)}">ШК: ${escapeHtml(displayBc)}</div>
                  ${item.name === 'Н/Д' 
                    ? '<div style="margin-top: 2px;"><span class="pill pill-rose" style="font-size: 10px; padding: 1px 6px;">Н/Д</span> <span style="color: #94a3b8; font-size: 12px; font-style: italic;">Товар отсутствует в каталоге</span></div>' 
                    : `<div class="product-name" title="${safeName}">${safeName}</div>`
                  }
                </div>
                <div class="product-qty-box">
                  ${qtyHtml}
                </div>
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        console.error(e);
      }
    }

    async function completeCurrentTask() {
      if (!activeTask) return;
      if (currentTaskStatus === 'completed') {
        showToast('Эта задача уже завершена');
        return;
      }
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! Невозможно завершить задачу.');
        return;
      }

      if (currentItemsCount === 0) {
        if (!confirm(`В задаче «${activeTask}» нет товаров. Завершить пустую задачу?`)) return;
      } else {
        if (!confirm(`Завершить задачу «${activeTask}»?\n\nЛокация будет зафиксирована как проверенная (${currentItemsCount} поз., ${currentTotalQty} шт.).`)) return;
      }

      try {
        const btn = document.getElementById('btn-complete-task');
        btn.disabled = true;
        btn.innerHTML = '<span>Завершение...</span>';

        const res = await fetchWithTimeout('/api/task/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: activeTask })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          setOnlineState(true);
          playBeep();
          showToast(`✓ Задача «${activeTask}» зафиксирована как завершенная!`);
          currentTaskStatus = 'completed';
          setTimeout(() => {
            openTasksScreen();
          }, 900);
        } else {
          alert(data.error || 'Ошибка завершения задачи');
          btn.disabled = false;
          btn.innerHTML = '<span>✓ Завершить задачу</span>';
        }
      } catch (e) {
        setOnlineState(false, e);
        playErrorTone();
        alert('Ошибка связи с компьютером: ' + e);
        const btn = document.getElementById('btn-complete-task');
        btn.disabled = false;
        btn.innerHTML = '<span>✓ Завершить задачу</span>';
      }
    }

    async function promptEditBox(itemId, currentBox) {
      if (currentTaskStatus === 'completed') {
        showToast('Задача завершена. Изменение коробки заблокировано.');
        return;
      }
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК!');
        return;
      }
      if (currentBox && currentBox.trim() !== '') {
        showToast('Номер коробки уже зафиксирован и не может быть изменен.');
        return;
      }
      const val = prompt('Номер коробки:');
      if (val === null) return;
      const cleanVal = val.trim();
      if (!cleanVal) return;
      try {
        const res = await fetchWithTimeout('/api/item/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: itemId, box_number: val.trim(), location: activeTask })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          setOnlineState(true);
          loadTaskItems();
        } else {
          alert(data.error || 'Ошибка изменения коробки');
        }
      } catch (e) {
        setOnlineState(false, e);
        playErrorTone();
        alert('Ошибка связи с компьютером: ' + e);
      }
    }

    function promptEditQty(itemId, currentQty) {
      if (currentTaskStatus === 'completed') {
        showToast('Задача завершена. Изменение количества заблокировано.');
        return;
      }
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК!');
        return;
      }
      const val = prompt('Введите количество:', currentQty);
      if (val === null) return;
      const parsed = parseInt(val.trim(), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        updateItem(itemId, parsed);
      }
    }

    /* Swipe To Delete Handling */
    let swipeTouchStartX = 0;
    let swipeTouchStartY = 0;
    let swipeCurrentX = 0;
    let swipeActiveElement = null;
    let isSwipeHorizontal = null;

    function resetActiveSwipe() {
      if (swipeActiveElement) {
        swipeActiveElement.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
        swipeActiveElement.style.transform = 'translateX(0px)';
        swipeActiveElement.classList.remove('swiped');
        swipeActiveElement = null;
      }
    }

    function handleSwipeTouchStart(e, el) {
      if (currentTaskStatus === 'completed') return;
      if (e.touches.length !== 1) return;

      if (swipeActiveElement && swipeActiveElement !== el) {
        resetActiveSwipe();
      }

      swipeTouchStartX = e.touches[0].clientX;
      swipeTouchStartY = e.touches[0].clientY;
      swipeCurrentX = swipeTouchStartX;
      isSwipeHorizontal = null;
      el.style.transition = 'none';
    }

    function handleSwipeTouchMove(e, el) {
      if (currentTaskStatus === 'completed') return;
      if (e.touches.length !== 1) return;

      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const deltaX = touchX - swipeTouchStartX;
      const deltaY = touchY - swipeTouchStartY;

      if (isSwipeHorizontal === null) {
        if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
          isSwipeHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        }
      }

      if (!isSwipeHorizontal) {
        return;
      }

      // Блокируем вертикальный скролл при горизонтальном свайпе
      e.preventDefault();

      if (deltaX < 0) {
        let translateX = deltaX;
        if (translateX < -90) {
          translateX = -90 + (translateX + 90) * 0.35;
        }
        el.style.transform = `translateX(${translateX}px)`;
        swipeCurrentX = touchX;
      } else {
        el.style.transform = 'translateX(0px)';
      }
    }

    function handleSwipeTouchEnd(e, el, itemId, sku, name) {
      if (currentTaskStatus === 'completed') return;
      el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';

      const deltaX = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : swipeCurrentX) - swipeTouchStartX;

      if (isSwipeHorizontal && deltaX < -55) {
        el.style.transform = 'translateX(-90px)';
        el.classList.add('swiped');
        swipeActiveElement = el;

        // При глубоком свайпе влево (> 125px) сразу запрашиваем подтверждение
        if (deltaX < -125) {
          setTimeout(() => {
            confirmDeleteItem(itemId, sku, name, el);
          }, 80);
        }
      } else {
        el.style.transform = 'translateX(0px)';
        el.classList.remove('swiped');
        if (swipeActiveElement === el) {
          swipeActiveElement = null;
        }
      }
      isSwipeHorizontal = null;
    }

    async function confirmDeleteItem(itemId, sku, name, el) {
      if (currentTaskStatus === 'completed') {
        showToast('Задача завершена. Удаление заблокировано.');
        resetActiveSwipe();
        return;
      }
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! Невозможно удалить товар.');
        resetActiveSwipe();
        return;
      }

      const itemLabel = (sku || '') + (name && name !== 'Н/Д' ? ` («${name}»)` : '');
      const confirmed = confirm(`Удалить позицию ЛК ${itemLabel} из этой задачи?`);

      if (!confirmed) {
        resetActiveSwipe();
        return;
      }

      try {
        const res = await fetchWithTimeout('/api/item/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: itemId, quantity: 0, location: activeTask })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          setOnlineState(true);
          playBeep();
          showToast(`✓ Позиция «${sku}» удалена`);

          const container = el ? el.closest('.swipe-container') : null;
          if (container) {
            container.style.transition = 'all 0.25s ease';
            container.style.opacity = '0';
            container.style.transform = 'translateX(-100%)';
            container.style.maxHeight = container.offsetHeight + 'px';
            setTimeout(() => {
              container.style.maxHeight = '0px';
              container.style.margin = '0px';
              container.style.padding = '0px';
              setTimeout(() => {
                loadTaskItems();
              }, 200);
            }, 200);
          } else {
            loadTaskItems();
          }
        } else {
          alert(data.error || 'Ошибка удаления позиции');
          resetActiveSwipe();
        }
      } catch (e) {
        setOnlineState(false, e);
        playErrorTone();
        showToast('⚠️ Ошибка связи с ПК: товар не удален!');
        resetActiveSwipe();
      }
    }

    document.addEventListener('touchstart', (e) => {
      if (swipeActiveElement && !swipeActiveElement.closest('.swipe-container').contains(e.target)) {
        resetActiveSwipe();
      }
    }, { passive: true });

    function openProductModal(product) {
      currentModalProduct = product;
      isProductModalOpen = true;

      const modal = document.getElementById('product-details-modal');
      if (!modal) return;

      document.getElementById('pdm-sku').textContent = product.sku || '—';
      document.getElementById('pdm-name').textContent = product.name || 'Товар ' + product.sku;

      const is299 = Boolean(product && product.is_account_299);
      const badge299 = document.getElementById('pdm-badge-299');
      const alert299 = document.getElementById('pdm-alert-299');
      if (badge299) badge299.style.display = is299 ? 'inline-block' : 'none';
      if (alert299) alert299.style.display = is299 ? 'flex' : 'none';

      const bcRow = document.getElementById('pdm-bc-row');
      const bcEl = document.getElementById('pdm-bc');
      if (product.barcode && product.barcode !== product.sku) {
        bcEl.textContent = product.barcode;
        bcRow.style.display = 'block';
      } else {
        bcRow.style.display = 'none';
      }

      const mainBoxInp = document.getElementById('input-box');
      const boxInput = document.getElementById('pdm-box-input');
      if (boxInput) {
        boxInput.value = (mainBoxInp ? mainBoxInp.value.trim() : '');
      }

      const hallEl = document.getElementById('pdm-hall-qty');
      if (hallEl) hallEl.textContent = product.hall_qty;
      const totalCounted = (product.total_counted !== undefined && product.total_counted !== null)
        ? product.total_counted
        : ((product.debarkader_qty || 0) + (product.hall_qty || 0));
      const debEl = document.getElementById('pdm-debarkader-qty');
      if (debEl) debEl.textContent = totalCounted;

      const inlineLocEl = document.getElementById('pdm-locations-inline');
      const chipsEl = document.getElementById('pdm-locations-chips');
      const locs = Array.isArray(product.locations) ? product.locations : [];

      if (locs.length === 0) {
        if (inlineLocEl) {
          inlineLocEl.innerHTML = totalCounted > 0 ? '' : '<span style="color: #64748b; font-style: italic;">(ещё не посчитан)</span>';
        }
        if (chipsEl) {
          chipsEl.innerHTML = '';
        }
      } else {
        const summaryParts = locs.map(l => {
          const locName = l.location || 'Без локации';
          const boxPart = l.box_number ? ` [📦 ${escapeHtml(l.box_number)}]` : '';
          return `${escapeHtml(locName)}${boxPart}: <b>${l.quantity} шт</b>`;
        });
        if (inlineLocEl) {
          inlineLocEl.innerHTML = `<span style="color: #cbd5e1;">(${summaryParts.join(', ')})</span>`;
        }

        if (chipsEl) {
          chipsEl.innerHTML = locs.map(l => {
            const locName = l.location || 'Без локации';
            const isCurrent = activeTask && (locName.toLowerCase() === activeTask.trim().toLowerCase());
            const boxPart = l.box_number ? `<span style="color: #fbbf24; font-size: 11px; margin-left: 2px;">[📦 кор. ${escapeHtml(l.box_number)}]</span>` : '';
            const bg = isCurrent ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.18)';
            const border = isCurrent ? 'rgba(16, 185, 129, 0.5)' : 'rgba(99, 102, 241, 0.4)';
            const textCol = isCurrent ? '#6ee7b7' : '#c7d2fe';
            const icon = isCurrent ? '🎯' : '📍';
            return `
              <span style="display: inline-flex; align-items: center; gap: 5px; background: ${bg}; border: 1px solid ${border}; color: ${textCol}; border-radius: 6px; padding: 3px 8px; font-size: 12px; font-weight: 500;">
                <span>${icon}</span>
                <span>${escapeHtml(locName)}${boxPart}:</span>
                <b style="color: #fff; font-size: 13px;">${l.quantity} шт</b>
              </span>
            `;
          }).join('');
        }
      }

      const inputLabelEl = document.getElementById('pdm-input-label');
      if (inputLabelEl) {
        inputLabelEl.textContent = activeTask ? (activeTask + ':') : 'Дебаркадер:';
      }

      document.getElementById('pdm-sap-stock').textContent = product.stock_qty;
      document.getElementById('pdm-sap-mult').textContent = product.multiplicity;

      const multBtn = document.getElementById('pdm-apply-mult-btn');
      if (multBtn) {
        multBtn.style.display = product.multiplicity > 1 ? 'inline-block' : 'none';
      }

      const qtyInput = document.getElementById('pdm-qty-input');
      const initialQty = inputQty > 1 ? inputQty : '';
      if (qtyInput) {
        qtyInput.value = initialQty;
        qtyInput.placeholder = '1';
      }
      onPdmQtyChange(initialQty);

      modal.style.display = 'block';

      setTimeout(() => {
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }, 100);
    }

    function onPdmQtyChange(val) {
      const parsed = parseInt(val, 10);
      const displayVal = !isNaN(parsed) && parsed > 0 ? parsed : (val === '' ? '1' : '0');
      const totalDisplay = document.getElementById('pdm-total-display');
      if (totalDisplay) {
        totalDisplay.textContent = displayVal;
      }
    }

    function applyPdmMultiplicity() {
      if (!currentModalProduct || !currentModalProduct.multiplicity) return;
      const qtyInput = document.getElementById('pdm-qty-input');
      if (qtyInput) {
        qtyInput.value = currentModalProduct.multiplicity;
        onPdmQtyChange(currentModalProduct.multiplicity);
        qtyInput.focus();
      }
    }

    function closeProductModal() {
      const modal = document.getElementById('product-details-modal');
      if (modal) modal.style.display = 'none';
      isProductModalOpen = false;
      currentModalProduct = null;
    }

    async function submitProductModal() {
      if (!currentModalProduct) return;
      const qtyInput = document.getElementById('pdm-qty-input');
      const boxInput = document.getElementById('pdm-box-input');
      const submitBtn = document.getElementById('pdm-submit-btn');

      let qty = 1;
      if (qtyInput && qtyInput.value.trim() !== '') {
        const parsed = parseInt(qtyInput.value.trim(), 10);
        if (!isNaN(parsed) && parsed > 0) {
          qty = parsed;
        }
      }
      const boxVal = boxInput ? boxInput.value.trim() : '';

      const mainBoxInp = document.getElementById('input-box');
      if (mainBoxInp && boxVal) {
        mainBoxInp.value = boxVal;
      }

      const product = currentModalProduct;
      closeProductModal();

      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! Товар не может быть добавлен.');
        return;
      }

      try {
        if (submitBtn) submitBtn.disabled = true;
        const res = await fetchWithTimeout('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: activeTask,
            barcode: product.barcode || product.sku,
            quantity: qty,
            box_number: boxVal,
            allow_unknown: false
          })
        }, 5000);
        const data = await res.json();
        if (data.success && data.item) {
          setOnlineState(true);
          playBeep();
          const aimBox = document.getElementById('scanner-aim-box');
          if (aimBox) {
            aimBox.classList.add('scanned-success');
            setTimeout(() => aimBox.classList.remove('scanned-success'), 550);
          }

          scannerSessionCount++;
          const counterEl = document.getElementById('scanner-session-count');
          if (counterEl) counterEl.textContent = scannerSessionCount;

          const hud = document.getElementById('scanner-hud-overlay');
          if (hud) {
            hud.innerHTML = `<span style="color: #10b981; font-weight: 700;">✓ +${qty} шт: ${escapeHtml(data.item.name)}</span><br><span style="color: #94a3b8; font-size: 11px;">ЛК: ${escapeHtml(data.item.sku)}${boxVal ? ' | Кор: ' + escapeHtml(boxVal) : ''}</span>`;
          }

          showToast(`✓ +${qty} шт: ${data.item.name}${boxVal ? ' [📦 № ' + boxVal + ']' : ''}`);

          const inp = document.getElementById('input-barcode');
          if (inp) inp.value = '';
          inputQty = 1;
          const qtyVal = document.getElementById('qty-picker-val');
          if (qtyVal) qtyVal.textContent = '1';

          loadTaskItems();
        } else {
          showToast(`✕ ${data.error || 'Ошибка добавления'}`);
        }
      } catch (err) {
        setOnlineState(false, err.message || '' + err);
        playErrorTone();
        showToast('✕ Ошибка связи с ПК: товар НЕ сохранён!');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    async function scanCurrentBarcode(providedBarcode, allowUnknown) {
      hideSuggestions();
      if (!activeTask) return;
      if (currentTaskStatus === 'completed') {
        showToast('Задача завершена. Добавление товаров заблокировано.');
        return;
      }

      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК! ЛК не может быть добавлен.');
        return;
      }

      const inp = document.getElementById('input-barcode');
      const boxInp = document.getElementById('input-box');
      const barcode = (providedBarcode || inp.value).trim();
      const boxNumber = boxInp ? boxInp.value.trim() : '';
      if (!barcode) return;

      if (allowUnknown) {
        try {
          const res = await fetchWithTimeout('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: activeTask,
              barcode: barcode,
              quantity: inputQty,
              box_number: boxNumber,
              allow_unknown: true
            })
          }, 5000);
          const data = await res.json();
          if (data.success && data.item) {
            setOnlineState(true);
            playBeep();
            const boxLabel = data.item.box_number ? ` [📦 № ${data.item.box_number}]` : '';
            showToast(`⚠️ +${inputQty} шт (Н/Д): ${data.item.sku}${boxLabel}`);
            inp.value = '';
            inputQty = 1;
            document.getElementById('qty-picker-val').textContent = '1';
            loadTaskItems();
          }
        } catch (e) {
          setOnlineState(false, e);
          playErrorTone();
          showToast('⚠️ Ошибка связи с компьютером: товар НЕ сохранён!');
        }
        return;
      }

      try {
        const checkRes = await fetchWithTimeout('/api/product/details?code=' + encodeURIComponent(barcode), {}, 4000);
        const checkData = await checkRes.json();
        if (checkData.success && checkData.found && checkData.product) {
          setOnlineState(true);
          playBeep();
          openProductModal(checkData.product);
        } else {
          setOnlineState(true);
          if (confirm(`Товар «${barcode}» не найден в каталоге.\nВсё равно добавить его в ревизию как «Н/Д»?`)) {
            scanCurrentBarcode(barcode, true);
          }
        }
      } catch (e) {
        setOnlineState(false, e);
        playErrorTone();
        showToast('⚠️ Ошибка связи с компьютером: товар НЕ сохранён!');
      }
    }

    async function updateItem(itemId, newQty) {
      if (currentTaskStatus === 'completed') {
        showToast('Задача завершена. Изменение количества заблокировано.');
        return;
      }
      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с ПК!');
        return;
      }
      try {
        const res = await fetchWithTimeout('/api/item/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: itemId, quantity: newQty, location: activeTask })
        }, 5000);
        const data = await res.json();
        if (data.success) {
          setOnlineState(true);
          loadTaskItems();
        } else {
          alert(data.error || 'Ошибка изменения количества');
        }
      } catch (e) {
        setOnlineState(false, e);
        playErrorTone();
        showToast('⚠️ Ошибка связи с ПК: количество не обновлено!');
      }
    }

    /* Camera Scanner & Barcode Recognition Engine */
    let zxingReader = null;
    let scannerMode = 'add'; // 'add' | 'search'
    let scannerSessionCount = 0;
    let lastScannedBarcode = '';
    let lastScannedTime = 0;
    let isTorchOn = false;
    let videoTrack = null;
    let isDetecting = false;

    async function initBarcodeDetector() {
      if (!('BarcodeDetector' in window)) return null;
      try {
        let formats = ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39', 'itf'];
        if (typeof BarcodeDetector.getSupportedFormats === 'function') {
          const supported = await BarcodeDetector.getSupportedFormats();
          formats = formats.filter(f => supported.includes(f));
        }
        if (formats.length > 0) {
          return new BarcodeDetector({ formats });
        }
      } catch (e) {
        console.warn('BarcodeDetector init error:', e);
      }
      return null;
    }

    async function prepareCanvasFromSource(file) {
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgUrl;
      });

      const maxDim = 1280;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(imgUrl);
      return canvas;
    }

    function setScannerMode(mode) {
      scannerMode = mode;
      const addBtn = document.getElementById('scanner-mode-add');
      const searchBtn = document.getElementById('scanner-mode-search');
      if (addBtn) addBtn.classList.toggle('active', mode === 'add');
      if (searchBtn) searchBtn.classList.toggle('active', mode === 'search');
      const hud = document.getElementById('scanner-hud-overlay');
      if (hud) {
        hud.innerHTML = mode === 'add' 
          ? '<span>🎯 Режим ревизии (+1 шт). Наведите на ШК или ЛК</span>' 
          : '<span>🔍 Режим поиска. Наведите на ШК или ЛК для подстановки в поиск</span>';
      }
    }

    async function toggleTorch() {
      if (videoTrack) {
        try {
          isTorchOn = !isTorchOn;
          await videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
          const btn = document.getElementById('scanner-torch-btn');
          if (btn) {
            btn.style.background = isTorchOn ? '#f59e0b' : '';
            btn.style.color = isTorchOn ? '#000' : '';
          }
        } catch (e) {
          console.warn('Torch error:', e);
        }
      }
    }

    function closeScanFeedback() {
      const el = document.getElementById('scan-feedback-modal');
      if (el) el.style.display = 'none';
    }

    function closeScanError() {
      const el = document.getElementById('scan-error-modal');
      if (el) el.style.display = 'none';
    }

    function triggerPhotoCapture() {
      const fileInp = document.getElementById('camera-file-input');
      if (fileInp) {
        fileInp.click();
      }
    }

    function switchToHttps() {
      window.location.href = window.location.href.replace('http:', 'https:');
    }

    function showHttpsSwitchModal() {
      const modal = document.getElementById('https-switch-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeHttpsSwitchModal() {
      const modal = document.getElementById('https-switch-modal');
      if (modal) modal.style.display = 'none';
    }

    async function onBarcodeDetected(raw, allowUnknown) {
      if (!raw) return;
      const clean = raw.trim();
      const now = Date.now();

      // Защита от потери данных: если связь разорвана, категорически запрещаем сканирование
      if (!isServerOnline) {
        playErrorTone();
        const hud = document.getElementById('scanner-hud-overlay');
        if (hud) {
          hud.innerHTML = `<span style="color: #ef4444; font-weight: 800;">⚠️ НЕТ СВЯЗИ С ПК! ШК «${escapeHtml(clean)}» НЕ сохранён!</span>`;
        }
        showToast(`⚠️ НЕТ СВЯЗИ С ПК! «${clean}» НЕ добавлен!`);
        return;
      }

      // Защита от дублей: один и тот же ШК игнорируем 1.8 сек, но другой ШК считываем мгновенно!
      if (clean === lastScannedBarcode && (now - lastScannedTime) < 1800) {
        return;
      }
      lastScannedBarcode = clean;
      lastScannedTime = now;

      // Вибрация телефона
      if (navigator.vibrate) {
        try { navigator.vibrate(70); } catch (e) {}
      }

      const hud = document.getElementById('scanner-hud-overlay');

      // Подставляем распознанный ШК / ЛК в поле ввода на экране
      const inp = document.getElementById('input-barcode');
      if (inp) {
        inp.value = clean;
      }

      if (scannerMode === 'search') {
        // Режим поиска: показываем найденный товар и закрываем сканер для работы с подсказками
        if (hud) {
          hud.innerHTML = `<span style="color: #38bdf8; font-weight: 700;">🔍 Найдено: ${escapeHtml(clean)}</span>`;
        }
        stopCameraScanner();
        fetchSuggestions(clean);
        return;
      }

      // Режим непрерывного добавления: проверяем каталог и открываем модальное окно добавления
      if (allowUnknown) {
        try {
          const boxInp = document.getElementById('input-box');
          const boxVal = boxInp ? boxInp.value.trim() : '';
          const res = await fetchWithTimeout('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: activeTask,
              barcode: clean,
              quantity: inputQty || 1,
              box_number: boxVal,
              allow_unknown: true
            })
          }, 5000);
          const data = await res.json();
          if (data.success && data.item) {
            setOnlineState(true);
            playBeep();
            scannerSessionCount++;
            const counterEl = document.getElementById('scanner-session-count');
            if (counterEl) counterEl.textContent = scannerSessionCount;
            showToast(`⚠️ +${inputQty || 1} шт (Н/Д): ${clean}`);
            loadTaskItems();
          }
        } catch (e) {
          setOnlineState(false, e);
          playErrorTone();
          showToast(`⚠️ Сбой связи с ПК! «${clean}» НЕ сохранён!`);
        }
        return;
      }

      if (hud) {
        hud.innerHTML = `<span style="color: #f59e0b;">⏳ Поиск в каталоге ${escapeHtml(clean)}...</span>`;
      }

      try {
        const checkRes = await fetchWithTimeout('/api/product/details?code=' + encodeURIComponent(clean), {}, 4000);
        const checkData = await checkRes.json();
        setOnlineState(true);

        if (checkData.success && checkData.found && checkData.product) {
          playBeep();
          const aimBox = document.getElementById('scanner-aim-box');
          if (aimBox) {
            aimBox.classList.add('scanned-success');
            setTimeout(() => aimBox.classList.remove('scanned-success'), 550);
          }

          if (hud) {
            hud.innerHTML = `<span style="color: #10b981; font-weight: 700;">✓ Найден: ${escapeHtml(checkData.product.name)}</span>`;
          }

          openProductModal(checkData.product);
        } else {
          const aimBox = document.getElementById('scanner-aim-box');
          if (aimBox) {
            aimBox.classList.add('scanned-error');
            setTimeout(() => aimBox.classList.remove('scanned-error'), 700);
          }
          if (hud) {
            hud.innerHTML = `<span style="color: #ef4444; font-weight: 700;">✕ Товар не найден в каталоге</span>`;
          }
          showToast(`✕ Товар «${clean}» не найден в каталоге`);
          showScanNotFoundModal(clean);
        }
      } catch (err) {
        setOnlineState(false, err);
        playErrorTone();
        if (hud) {
          hud.innerHTML = `<span style="color: #ef4444; font-weight: 800;">✕ Ошибка связи с ПК: товар не сохранен!</span>`;
        }
        showToast(`⚠️ Ошибка связи с ПК! «${clean}» не проверен!`);
      }
    }

    async function handleCameraPhoto(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      showToast('Распознавание штрихкода...');

      try {
        const canvas = await prepareCanvasFromSource(file);
        let detectedBarcode = null;

        // 1. Попытка нативным BarcodeDetector
        if (!barcodeDetector) {
          barcodeDetector = await initBarcodeDetector();
        }
        if (barcodeDetector) {
          try {
            const codes = await barcodeDetector.detect(canvas);
            if (codes && codes.length > 0) {
              detectedBarcode = codes[0].rawValue;
            }
          } catch (e) {
            console.warn('BarcodeDetector photo error:', e);
          }
        }

        // 2. Если не распознано или нет BarcodeDetector, пробуем локальный ZXing
        if (!detectedBarcode && typeof ZXing !== 'undefined') {
          try {
            if (!zxingReader) {
              zxingReader = new ZXing.BrowserMultiFormatReader();
            }
            const res = await zxingReader.decodeFromImageElement(canvas);
            if (res && res.getText()) {
              detectedBarcode = res.getText();
            }
          } catch (e) {
            console.warn('ZXing photo error:', e);
          }
        }

        if (detectedBarcode) {
          closeScanError();
          await onBarcodeDetected(detectedBarcode);
        } else {
          const errModal = document.getElementById('scan-error-modal');
          if (errModal) {
            errModal.style.display = 'block';
          } else {
            showToast('✕ Штрихкод на фото не распознан. Сделайте фото ближе.');
          }
        }
      } catch (err) {
        showToast('Ошибка обработки: ' + (err.message || err));
      } finally {
        event.target.value = '';
      }
    }

    let currentCamIndex = 0;

    async function switchCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        showToast('Переключение камер не поддерживается браузером');
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length <= 1) {
          showToast('Найдена только одна камера');
          return;
        }
        currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
        const nextDev = videoDevices[currentCamIndex];
        showToast(`Камера ${currentCamIndex + 1} из ${videoDevices.length}`);
        await startCameraScanner(nextDev.deviceId);
      } catch (e) {
        showToast('Ошибка смены камеры: ' + e);
      }
    }

    function onScannerViewfinderClick() {
      const video = document.getElementById('video-preview');
      if (video && video.paused) {
        video.play().catch(() => {});
      }
      if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
        try {
          videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        } catch (e) {}
      }
    }

    async function startCameraScanner(preferredDeviceId) {
      // Скрываем виртуальную клавиатуру телефона перед включением сканера
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      const barcodeInput = document.getElementById('input-barcode');
      if (barcodeInput) barcodeInput.blur();

      closeScanFeedback();
      closeScanError();
      closeScanNotFound();
      closeScannerManualLkModal();

      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
        videoTrack = null;
      }

      // 1. Если потоковая камера поддерживается браузером (HTTPS / localhost / включен флаг)
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const modal = document.getElementById('scanner-modal');
          const video = document.getElementById('video-preview');
          const taskTitle = document.getElementById('scanner-task-title');
          if (taskTitle) {
            taskTitle.textContent = activeTask ? `Локация: ${activeTask}` : 'Сканер штрихкодов';
          }
          modal.style.display = 'flex';

          const options = [];
          if (preferredDeviceId) {
            options.push({ video: { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            options.push({ video: { deviceId: { exact: preferredDeviceId } }, audio: false });
          }
          options.push({
            video: {
              facingMode: { exact: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          options.push({
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          options.push({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
          options.push({ video: true, audio: false });

          let stream = null;
          let lastErr = null;
          for (const opt of options) {
            try {
              stream = await navigator.mediaDevices.getUserMedia(opt);
              if (stream) break;
            } catch (e) {
              lastErr = e;
            }
          }

          if (!stream) {
            throw lastErr || new Error('Камера не вернула видеопоток');
          }

          videoStream = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.srcObject = videoStream;
          videoTrack = videoStream.getVideoTracks()[0];

          // Проверяем поддержку вспышки (фонарика)
          const torchBtn = document.getElementById('scanner-torch-btn');
          if (torchBtn && videoTrack && videoTrack.getCapabilities) {
            try {
              const caps = videoTrack.getCapabilities();
              torchBtn.style.display = caps.torch ? 'inline-block' : 'none';
            } catch (e) {
              torchBtn.style.display = 'none';
            }
          }

          // Ожидаем готовности метаданных перед play() для избежания черного экрана
          await new Promise((resolve) => {
            if (video.readyState >= 1) {
              resolve();
            } else {
              video.onloadedmetadata = () => resolve();
              setTimeout(resolve, 600);
            }
          });

          try {
            await video.play();
          } catch (e) {
            console.warn('video.play() warning:', e);
            setTimeout(() => video.play().catch(() => {}), 200);
          }

          // Применяем автофокус после запуска трека
          if (videoTrack && typeof videoTrack.applyConstraints === 'function') {
            try {
              await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            } catch (e) {}
          }

          // Инициализируем декодеры
          if (!barcodeDetector) {
            barcodeDetector = await initBarcodeDetector();
          }

          startContinuousScanningLoop();
          return;
        } catch (err) {
          console.warn('Live camera stream not available:', err);
          stopCameraScanner();
          alert('Ошибка включения камеры: ' + (err.message || err));
          return;
        }
      }

      // 2. Если браузер блокирует MediaDevices (обычный HTTP на телефоне)
      if (window.location.protocol === 'http:') {
        showHttpsSwitchModal();
        return;
      }

      alert('Браузер не предоставил доступ к камере для видео-сканирования.');
    }

    function startContinuousScanningLoop() {
      const video = document.getElementById('video-preview');

      // 1. Попытка через BarcodeDetector (быстрый аппаратный декодер)
      if (barcodeDetector) {
        const loop = async () => {
          if (!videoStream) return;
          if (isProductModalOpen) {
            requestAnimationFrame(loop);
            return;
          }
          if (video.readyState === video.HAVE_ENOUGH_DATA && !isDetecting) {
            try {
              isDetecting = true;
              const codes = await barcodeDetector.detect(video);
              if (codes && codes.length > 0) {
                await onBarcodeDetected(codes[0].rawValue);
              }
            } catch (e) {
            } finally {
              isDetecting = false;
            }
          }
          if (videoStream) {
            requestAnimationFrame(loop);
          }
        };
        requestAnimationFrame(loop);
        return;
      }

      // 2. Иначе используем локальный ZXing
      if (typeof ZXing !== 'undefined') {
        try {
          if (!zxingReader) {
            zxingReader = new ZXing.BrowserMultiFormatReader();
          }
          zxingReader.decodeFromVideoElementContinuously(video, (result, err) => {
            if (isProductModalOpen) return;
            if (result && result.getText()) {
              onBarcodeDetected(result.getText());
            }
          });
        } catch (e) {
          console.warn('ZXing continuous error:', e);
        }
      }
    }

    function stopCameraScanner() {
      closeScannerManualLkModal();
      if (isTorchOn && videoTrack) {
        try { videoTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {}
        isTorchOn = false;
      }
      if (zxingReader) {
        try { zxingReader.reset(); } catch (e) {}
      }
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
        videoTrack = null;
      }
      const modal = document.getElementById('scanner-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }

    let pendingNotFoundCode = null;
    function showScanNotFoundModal(code) {
      pendingNotFoundCode = code;
      const modal = document.getElementById('scan-not-found-modal');
      const codeEl = document.getElementById('scan-not-found-code');
      if (modal && codeEl) {
        codeEl.textContent = code;
        modal.style.display = 'block';
      }
    }

    function closeScanNotFound() {
      pendingNotFoundCode = null;
      const modal = document.getElementById('scan-not-found-modal');
      if (modal) modal.style.display = 'none';
    }

    async function addNotFoundAsNd() {
      const code = pendingNotFoundCode;
      closeScanNotFound();
      if (!code) return;

      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с компьютером! Товар не добавлен.');
        return;
      }

      lastScannedBarcode = null;
      lastScannedTime = 0;
      await onBarcodeDetected(code, true);
    }

    let manualLkDebounceTimer = null;
    let manualLkFoundItem = null;

    function onScannerManualLkInput(val) {
      clearTimeout(manualLkDebounceTimer);
      const preview = document.getElementById('scanner-manual-lk-preview');
      manualLkFoundItem = null;
      const q = (val || '').trim();
      if (!q) {
        if (preview) preview.innerHTML = '';
        return;
      }
      manualLkDebounceTimer = setTimeout(async () => {
        try {
          const res = await fetchWithTimeout('/api/catalog/search?q=' + encodeURIComponent(q), {}, 3000);
          const data = await res.json();
          if (!preview) return;
          if (data.success && data.items && data.items.length > 0) {
            const first = data.items[0];
            manualLkFoundItem = first;
            preview.innerHTML = `<span style="color: #38bdf8; font-weight: 600;">✓ ${escapeHtml(first.name)}</span> <span style="color: #94a3b8; font-size: 11px;">(ЛК: ${escapeHtml(first.sku)})</span>`;
          } else {
            preview.innerHTML = `<span style="color: #fbbf24;">⚠️ Товар «${escapeHtml(q)}» не найден в каталоге</span>`;
          }
        } catch (e) {
          if (preview) preview.innerHTML = '';
        }
      }, 200);
    }

    function openScannerManualLkModal() {
      const modal = document.getElementById('scanner-manual-lk-modal');
      const inp = document.getElementById('scanner-manual-lk-input');
      const preview = document.getElementById('scanner-manual-lk-preview');
      if (preview) preview.innerHTML = '';
      manualLkFoundItem = null;
      if (modal) {
        modal.style.display = 'flex';
      }
      if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 100);
      }
    }

    function closeScannerManualLkModal() {
      const modal = document.getElementById('scanner-manual-lk-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }

    function onScannerManualLkKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitScannerManualLk();
      } else if (e.key === 'Escape') {
        closeScannerManualLkModal();
      }
    }

    function submitScannerManualLk() {
      const inp = document.getElementById('scanner-manual-lk-input');
      if (!inp) return;
      const val = inp.value.trim();
      if (!val) {
        showToast('Введите номер ЛК или штрихкод');
        inp.focus();
        return;
      }

      if (!isServerOnline) {
        playErrorTone();
        showToast('⚠️ Ошибка: нет связи с компьютером! ЛК не добавлен.');
        return;
      }

      const preview = document.getElementById('scanner-manual-lk-preview');
      let allowUnknown = false;
      if (preview && preview.textContent.includes('не найден')) {
        if (!confirm(`Товар «${val}» отсутствует в каталоге.\nВсё равно добавить его в ревизию как позицию «Н/Д»?`)) {
          inp.focus();
          return;
        }
        allowUnknown = true;
      }
      closeScannerManualLkModal();
      lastScannedBarcode = null;
      lastScannedTime = 0;
      onBarcodeDetected(val, allowUnknown);
    }

    function goToMainManualInput() {
      closeScannerManualLkModal();
      stopCameraScanner();
      const inp = document.getElementById('input-barcode');
      if (inp) {
        setTimeout(() => {
          inp.focus();
          inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }

    function escapeHtml(s) {
      return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    /* LK Catalog Autocomplete / Suggestions */
    function onBarcodeInput(val) {
      clearTimeout(searchDebounceTimer);
      const q = (val || '').trim();
      if (!q) {
        hideSuggestions();
        return;
      }
      searchDebounceTimer = setTimeout(() => {
        fetchSuggestions(q);
      }, 150);
    }

    function onBarcodeFocus() {
      const inp = document.getElementById('input-barcode');
      if (inp && inp.value.trim().length > 0) {
        fetchSuggestions(inp.value.trim());
      }
    }

    async function fetchSuggestions(q) {
      if (currentSearchAbort) {
        currentSearchAbort.abort();
      }
      currentSearchAbort = new AbortController();

      try {
        const res = await fetch('/api/catalog/search?q=' + encodeURIComponent(q), {
          signal: currentSearchAbort.signal
        });
        const data = await res.json();
        if (data.success && data.items && data.items.length > 0) {
          renderSuggestions(data.items);
        } else {
          hideSuggestions();
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          hideSuggestions();
        }
      }
    }

    function renderSuggestions(items) {
      currentSuggestions = items;
      selectedSuggestionIndex = -1;
      const container = document.getElementById('barcode-suggestions');
      if (!container) return;

      container.innerHTML = items.map((item, idx) => {
        const rawBc = (item.barcode || '').trim();
        const bcDisplay = (rawBc && rawBc !== item.sku) ? `ШК: ${escapeHtml(rawBc)}` : '';
        return `
          <div class="suggestion-item" data-idx="${idx}" onclick="selectSuggestion('${escapeHtml(item.sku)}')">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="suggestion-sku-pill">ЛК: ${escapeHtml(item.sku)}</span>
                ${bcDisplay ? `<span class="suggestion-bc">${bcDisplay}</span>` : ''}
              </div>
              <div class="suggestion-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            </div>
            <button type="button" class="suggestion-add-btn" onclick="event.stopPropagation(); quickAddSuggestion('${escapeHtml(item.sku)}')">
              + Добавить
            </button>
          </div>
        `;
      }).join('');

      container.style.display = 'block';
    }

    function selectSuggestion(sku) {
      const inp = document.getElementById('input-barcode');
      if (inp) {
        inp.value = sku;
        inp.focus();
      }
      hideSuggestions();
    }

    function quickAddSuggestion(sku) {
      hideSuggestions();
      const inp = document.getElementById('input-barcode');
      if (inp) inp.value = sku;
      scanCurrentBarcode(sku);
    }

    function hideSuggestions() {
      const container = document.getElementById('barcode-suggestions');
      if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
      }
      currentSuggestions = [];
      selectedSuggestionIndex = -1;
    }

    function onBarcodeKeydown(e) {
      if (e.key === 'Enter') {
        if (selectedSuggestionIndex >= 0 && currentSuggestions[selectedSuggestionIndex]) {
          const chosenSku = currentSuggestions[selectedSuggestionIndex].sku;
          selectSuggestion(chosenSku);
          hideSuggestions();
          return;
        }
        hideSuggestions();
        scanCurrentBarcode();
      } else if (e.key === 'Escape') {
        hideSuggestions();
      } else if (e.key === 'ArrowDown') {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1);
          highlightSuggestion();
        }
      } else if (e.key === 'ArrowUp') {
        if (currentSuggestions.length > 0) {
          e.preventDefault();
          selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
          highlightSuggestion();
        }
      }
    }

    function highlightSuggestion() {
      const container = document.getElementById('barcode-suggestions');
      if (!container) return;
      const items = container.querySelectorAll('.suggestion-item');
      items.forEach((el, idx) => {
        if (idx === selectedSuggestionIndex) {
          el.classList.add('selected');
          el.scrollIntoView({ block: 'nearest' });
          const inp = document.getElementById('input-barcode');
          if (inp && currentSuggestions[idx]) {
            inp.value = currentSuggestions[idx].sku;
          }
        } else {
          el.classList.remove('selected');
        }
      });
    }

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('barcode-suggestions');
      const inp = document.getElementById('input-barcode');
      if (dropdown && !dropdown.contains(e.target) && e.target !== inp) {
        hideSuggestions();
      }
    });

    window.addEventListener('DOMContentLoaded', initApp);
  </script>
</body>
</html>"#
    .to_string()
}
