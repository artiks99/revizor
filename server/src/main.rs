use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::json;
use tiny_http::{Header, Method, Response, Server, StatusCode};

const ZXING_JS: &str = include_str!("../static/zxing.min.js");
const MOBILE_HTML: &str = include_str!("../static/mobile.html");

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

#[derive(Serialize)]
pub struct TaskCompleteResultDto {
  pub success: bool,
  pub task: String,
  pub items_count: i64,
  pub total_qty: i64,
}

fn open_db(db_path: &Path) -> Result<Connection, String> {
  if let Some(parent) = db_path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  let conn = Connection::open(db_path)
    .map_err(|e| format!("Не удалось открыть БД {}: {}", db_path.display(), e))?;
  let _ = conn.busy_timeout(Duration::from_millis(15000));
  let _ = conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;");
  Ok(conn)
}

fn ensure_mobile_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
  conn.execute(
    "CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL DEFAULT '',
      store_number TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'шт.',
      location TEXT NOT NULL,
      box_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ok',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

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

  conn.execute(
    "CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revision_id TEXT NOT NULL DEFAULT '',
      store_number TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

  conn.execute(
    "CREATE TABLE IF NOT EXISTS store_catalog (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL DEFAULT '',
      store_number TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

  conn.execute(
    "CREATE TABLE IF NOT EXISTS store_stock (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL DEFAULT '',
      store_number TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

  conn.execute(
    "CREATE TABLE IF NOT EXISTS processed_client_scans (
      client_scan_id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL DEFAULT '',
      store_number TEXT NOT NULL DEFAULT '',
      item_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )",
    [],
  )?;

  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_loc ON inventory_items(location)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory_items(sku)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_mti_task ON mobile_task_items(task_name)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_events ON sync_events(revision_id, id)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cat_sku ON store_catalog(sku)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_cat_bc ON store_catalog(barcode)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_stock_sku ON store_stock(sku)", []);
  let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_proc_scans ON processed_client_scans(client_scan_id)", []);

  Ok(())
}

fn record_sync_event(conn: &Connection, revision_id: &str, store_number: &str, event_type: &str, payload: &serde_json::Value) {
  let json_str = payload.to_string();
  let _ = conn.execute(
    "INSERT INTO sync_events (revision_id, store_number, event_type, payload) VALUES (?1, ?2, ?3, ?4)",
    params![revision_id, store_number, event_type, json_str],
  );
}

#[derive(Serialize)]
pub struct SyncEventDto {
  pub id: i64,
  pub revision_id: String,
  pub store_number: String,
  pub event_type: String,
  pub payload: serde_json::Value,
  pub created_at: String,
}

fn get_sync_events(db_path: &Path, revision_id: &str, after_id: i64) -> Result<(Vec<SyncEventDto>, i64), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let mut stmt = conn
    .prepare(
      "SELECT id, revision_id, store_number, event_type, payload, created_at 
       FROM sync_events 
       WHERE (?1 = '' OR ?1 = 'default' OR revision_id = ?1 OR revision_id = 'default' OR revision_id = '') AND id > ?2 
       ORDER BY id ASC LIMIT 500"
    )
    .map_err(|e| e.to_string())?;

  let mut max_id = after_id;
  let rows = stmt
    .query_map(params![revision_id, after_id], |r| {
      let id: i64 = r.get(0)?;
      let rev: String = r.get(1)?;
      let store: String = r.get(2)?;
      let etype: String = r.get(3)?;
      let payload_raw: String = r.get(4)?;
      let created: String = r.get(5)?;
      let parsed_payload: serde_json::Value = serde_json::from_str(&payload_raw).unwrap_or(json!({}));
      Ok(SyncEventDto {
        id,
        revision_id: rev,
        store_number: store,
        event_type: etype,
        payload: parsed_payload,
        created_at: created,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut events = Vec::new();
  for r in rows.flatten() {
    if r.id > max_id {
      max_id = r.id;
    }
    events.push(r);
  }

  Ok((events, max_id))
}

fn sync_upload_data(
  db_path: &Path,
  revision_id: &str,
  store_number: &str,
  tasks: Vec<String>,
  items: Vec<serde_json::Value>,
  catalog: Vec<serde_json::Value>,
  stock: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
  let mut conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_rev = revision_id.trim();
  let tx = conn.transaction().map_err(|e| e.to_string())?;

  let mut inserted_tasks = 0;
  for t in &tasks {
    let clean = t.trim();
    if !clean.is_empty() {
      let task_id = format!("{}_{}", clean_rev, clean);
      let _ = tx.execute(
        "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'in_progress', datetime('now', 'localtime'), datetime('now', 'localtime'))
         ON CONFLICT(name) DO UPDATE SET revision_id = ?2, updated_at = datetime('now', 'localtime')",
        params![task_id, clean_rev, clean],
      );
      inserted_tasks += 1;
    }
  }

  let mut inserted_items = 0;
  if !items.is_empty() {
    let _ = tx.execute("DELETE FROM inventory_items WHERE revision_id = ?1", params![clean_rev]);
    for it in items {
      let sku = it.get("sku").and_then(|v| v.as_str()).unwrap_or("").trim();
      let name = it.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
      let qty = it.get("quantity").and_then(|v| v.as_i64()).unwrap_or(1);
      let loc = it.get("location").and_then(|v| v.as_str()).unwrap_or("").trim();
      let box_num = it.get("box_number").and_then(|v| v.as_str()).unwrap_or("").trim();
      let id_field = it.get("id").and_then(|v| v.as_str()).unwrap_or("");
      let item_id = if id_field.is_empty() {
        format!("item_{}_{}_{}", clean_rev, loc, sku)
      } else {
        id_field.to_string()
      };
      if !sku.is_empty() && !loc.is_empty() {
        let _ = tx.execute(
          "INSERT OR REPLACE INTO inventory_items (id, revision_id, store_number, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 'шт.', ?7, ?8, 'ok', datetime('now', 'localtime'), datetime('now', 'localtime'))",
          params![item_id, clean_rev, store_number, name, sku, qty, loc, box_num],
        );
        inserted_items += 1;
      }
    }
  }

  let mut inserted_cat = 0;
  for item in catalog {
    let sku = item.get("sku").and_then(|v| v.as_str()).unwrap_or("").trim();
    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    let barcode = item.get("barcode").and_then(|v| v.as_str()).unwrap_or("").trim();
    if !sku.is_empty() {
      let cat_id = format!("{}_{}_{}", clean_rev, store_number, sku);
      let _ = tx.execute(
        "INSERT INTO store_catalog (id, revision_id, store_number, sku, name, barcode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now', 'localtime'), datetime('now', 'localtime'))
         ON CONFLICT(id) DO UPDATE SET name = ?5, barcode = ?6, updated_at = datetime('now', 'localtime')",
        params![cat_id, clean_rev, store_number, sku, name, barcode],
      );
      inserted_cat += 1;
    }
  }

  let mut inserted_stock = 0;
  for item in stock {
    let sku = item.get("sku").and_then(|v| v.as_str()).unwrap_or("").trim();
    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
    let qty = item.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if !sku.is_empty() {
      let stock_id = format!("{}_{}_{}", clean_rev, store_number, sku);
      let _ = tx.execute(
        "INSERT INTO store_stock (id, revision_id, store_number, sku, name, quantity, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now', 'localtime'), datetime('now', 'localtime'))
         ON CONFLICT(id) DO UPDATE SET quantity = ?6, updated_at = datetime('now', 'localtime')",
        params![stock_id, clean_rev, store_number, sku, name, qty],
      );
      inserted_stock += 1;
    }
  }

  tx.commit().map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "tasks_processed": inserted_tasks,
    "items_processed": inserted_items,
    "catalog_processed": inserted_cat,
    "stock_processed": inserted_stock,
  }))
}

fn flush_draft_items(conn: &Connection, task_name: &str, revision_id: &str, store_number: &str) -> Result<(), String> {
  let mut stmt = conn
    .prepare("SELECT id, sku, barcode, name, quantity, box_number FROM mobile_task_items WHERE task_name = ?1")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(params![task_name], |r| {
      Ok((
        r.get::<_, String>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, String>(3)?,
        r.get::<_, i64>(4)?,
        r.get::<_, String>(5)?,
      ))
    })
    .map_err(|e| e.to_string())?;

  for r in rows.flatten() {
    let (draft_id, sku, _barcode, name, qty, box_num) = r;
    let existing: Result<(String, i64), _> = if box_num.trim().is_empty() {
      conn.query_row(
        "SELECT id, quantity FROM inventory_items WHERE (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND (box_number IS NULL OR TRIM(box_number) = '') LIMIT 1",
        params![task_name, sku],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
    } else {
      conn.query_row(
        "SELECT id, quantity FROM inventory_items WHERE (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND TRIM(COALESCE(box_number, '')) = ?3 LIMIT 1",
        params![task_name, sku, box_num.trim()],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
    };

    match existing {
      Ok((item_id, cur_qty)) => {
        let _ = conn.execute(
          "UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2",
          params![cur_qty + qty, item_id],
        );
      }
      Err(_) => {
        let new_id = format!("item_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros());
        let _ = conn.execute(
          "INSERT INTO inventory_items (id, revision_id, store_number, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 'шт.', ?7, ?8, 'ok', datetime('now', 'localtime'), datetime('now', 'localtime'))",
          params![new_id, revision_id, store_number, name, sku, qty, task_name, box_num.trim()],
        );
      }
    }
    let _ = conn.execute("DELETE FROM mobile_task_items WHERE id = ?1", params![draft_id]);
  }

  Ok(())
}

fn get_tasks(db_path: &Path, revision_id: &str) -> Result<Vec<TaskItemDto>, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_rev = revision_id.trim();

  let mut stmt = conn
    .prepare(
      "WITH all_tasks AS (
         SELECT 
           TRIM(name) as loc_name, 
           COALESCE(status, 'in_progress') as status, 
           COALESCE(created_at, '') as created_at, 
           COALESCE(updated_at, '') as updated_at 
         FROM mobile_tasks
         WHERE (?1 = '' OR ?1 = 'default' OR revision_id = ?1)
         UNION ALL
         SELECT 
           TRIM(location) as loc_name, 
           'completed' as status, 
           COALESCE(MIN(created_at), '') as created_at, 
           COALESCE(MAX(updated_at), '') as updated_at 
         FROM inventory_items 
         WHERE location IS NOT NULL AND TRIM(location) != '' 
           AND (?1 = '' OR ?1 = 'default' OR revision_id = ?1)
           AND TRIM(location) NOT IN (
             SELECT TRIM(name) FROM mobile_tasks 
             WHERE (?1 = '' OR ?1 = 'default' OR revision_id = ?1)
           )
         GROUP BY TRIM(location)
       )
       SELECT 
         loc_name,
         CASE WHEN MIN(CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END) = 0 THEN 'in_progress' ELSE 'completed' END as status,
         MIN(created_at) as created_at,
         MAX(updated_at) as updated_at,
         (
           SELECT COALESCE(COUNT(DISTINCT sku), 0)
           FROM inventory_items 
           WHERE (TRIM(location) = all_tasks.loc_name OR location = all_tasks.loc_name)
             AND (?1 = '' OR ?1 = 'default' OR revision_id = ?1)
         ) as items_count,
         (
           SELECT COALESCE(SUM(quantity), 0)
           FROM inventory_items 
           WHERE (TRIM(location) = all_tasks.loc_name OR location = all_tasks.loc_name)
             AND (?1 = '' OR ?1 = 'default' OR revision_id = ?1)
         ) as total_qty
       FROM all_tasks
       WHERE loc_name != ''
       GROUP BY loc_name
       ORDER BY 
         CASE WHEN MIN(CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END) = 0 THEN 0 ELSE 1 END,
         updated_at DESC, 
         created_at DESC",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(params![clean_rev], |row| {
      let name: String = row.get(0)?;
      Ok(TaskItemDto {
        id: name.clone(),
        name,
        status: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        items_count: row.get(4)?,
        total_qty: row.get(5)?,
      })
    })
    .map_err(|e| e.to_string())?;

  let mut list = Vec::new();
  for r in rows.flatten() {
    list.push(r);
  }
  Ok(list)
}

fn create_task(db_path: &Path, revision_id: &str, name: &str) -> Result<TaskItemDto, String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);

  let clean_name = name.trim();
  if clean_name.is_empty() {
    return Err("Название задачи не может быть пустым".to_string());
  }

  conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'in_progress', datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now', 'localtime')",
    params![clean_name, revision_id, clean_name],
  ).map_err(|e| format!("Ошибка создания задачи: {}", e))?;

  record_sync_event(
    &conn,
    revision_id,
    "",
    "task_created",
    &json!({
      "type": "task_created",
      "task": clean_name,
      "revision_id": revision_id,
    }),
  );

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

fn delete_task(db_path: &Path, revision_id: &str, name: &str) -> Result<(), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);
  let clean_name = name.trim();
  conn.execute("DELETE FROM mobile_tasks WHERE name = ?1", params![clean_name])
    .map_err(|e| e.to_string())?;
  conn.execute("DELETE FROM mobile_task_items WHERE task_name = ?1", params![clean_name])
    .map_err(|e| e.to_string())?;
  conn.execute("DELETE FROM inventory_items WHERE TRIM(location) = ?1 OR location = ?1", params![clean_name])
    .map_err(|e| e.to_string())?;

  record_sync_event(
    &conn,
    revision_id,
    "",
    "task_deleted",
    &json!({
      "type": "task_deleted",
      "task": clean_name,
      "revision_id": revision_id,
    }),
  );

  Ok(())
}

fn get_task_items(
  db_path: &Path,
  location: &str,
  revision_id: &str,
  store_number: &str,
) -> Result<(String, Vec<ScannedProductDto>), String> {
  let conn = open_db(db_path)?;
  let _ = ensure_mobile_tables(&conn);
  let clean_loc = location.trim();
  let clean_rev = revision_id.trim();

  let _ = flush_draft_items(&conn, clean_loc, clean_rev, store_number);

  let status: String = conn.query_row(
    "SELECT status FROM mobile_tasks WHERE name = ?1 AND (?2 = '' OR ?2 = 'default' OR revision_id = ?2) LIMIT 1",
    params![clean_loc, clean_rev],
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
           AND (?2 = '' OR ?2 = 'default' OR c.revision_id = ?2)
           AND c.barcode IS NOT NULL 
           AND c.barcode != '' 
           AND c.barcode != i.sku
         LIMIT 1
       ), (
         SELECT c.barcode 
         FROM store_catalog c 
         WHERE c.sku = i.sku 
           AND (?2 = '' OR ?2 = 'default' OR c.revision_id = ?2)
           AND c.barcode != '' 
         LIMIT 1
       ), i.sku) as barcode,
       COALESCE(i.name, '') as name,
       COALESCE(i.quantity, 0) as quantity,
       COALESCE(i.updated_at, '') as updated_at,
       COALESCE(i.box_number, '') as box_number
     FROM inventory_items i
     WHERE (TRIM(i.location) = ?1 OR i.location = ?1)
       AND (?2 = '' OR ?2 = 'default' OR i.revision_id = ?2)
     ORDER BY i.updated_at DESC, i.created_at DESC",
  ).map_err(|e| e.to_string())?;

  let rows = stmt.query_map(params![clean_loc, clean_rev], |row| {
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

fn search_catalog(db_path: &Path, query: &str) -> Result<Vec<CatalogSuggestionDto>, String> {
  let conn = open_db(db_path)?;
  let q = query.trim();
  if q.is_empty() {
    return Ok(Vec::new());
  }

  let catalog_exists: bool = conn
    .query_row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_catalog'", [], |_| Ok(true))
    .unwrap_or(false);

  if !catalog_exists {
    return Ok(Vec::new());
  }

  let sql = "SELECT sku, name, COALESCE(barcode, '') as barcode FROM store_catalog
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
     LIMIT 15";

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

fn get_product_details(db_path: &Path, code: &str) -> Result<Option<ProductDetailDto>, String> {
  let conn = open_db(db_path)?;
  let clean_code = code.trim();
  if clean_code.is_empty() {
    return Ok(None);
  }

  let digits_only: String = clean_code.chars().filter(|c| c.is_ascii_digit()).collect();
  let unpadded_digits = digits_only.trim_start_matches('0').to_string();

  let catalog_exists: bool = conn
    .query_row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_catalog'", [], |_| Ok(true))
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
          OR barcode LIKE ?1 || '%' 
          OR barcode LIKE '%' || ?1 || '%' 
       ORDER BY 
         CASE 
           WHEN TRIM(barcode) = ?1 OR TRIM(sku) = ?1 THEN 1
           WHEN barcode LIKE ?1 || '%' OR sku LIKE ?1 || '%' THEN 2
           ELSE 3
         END,
         LENGTH(sku) ASC
       LIMIT 1",
      params![clean_code, unpadded_digits, digits_only],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
  } else {
    Err(rusqlite::Error::QueryReturnedNoRows)
  };

  let (found_sku, found_name, found_bc) = match catalog_lookup {
    Ok((s, n, b)) => {
      let primary_bc = b.split([',', ';', '\n', '\r', '/', ' ']).next().unwrap_or("").trim().to_string();
      let bc_to_show = if !primary_bc.is_empty() && primary_bc != s {
        primary_bc
      } else {
        clean_code.to_string()
      };
      let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
      (s, final_name, bc_to_show)
    }
    Err(_) => return Ok(None),
  };

  let stock_exists: bool = conn
    .query_row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='store_stock'", [], |_| Ok(true))
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

  let multiplicity: i64 = 1;
  let mut locations = Vec::new();
  let mut total_counted: i64 = 0;
  let mut debarkader_qty: i64 = 0;
  let mut hall_qty: i64 = 0;

  if let Ok(mut stmt) = conn.prepare(
    "SELECT COALESCE(location, '') as loc, COALESCE(box_number, '') as box, SUM(quantity) as qty 
     FROM inventory_items WHERE TRIM(sku) = ?1 AND quantity > 0 GROUP BY loc, box ORDER BY qty DESC"
  ) {
    if let Ok(rows) = stmt.query_map(params![found_sku], |r| {
      Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
    }) {
      for (loc, box_num, qty) in rows.flatten() {
        total_counted += qty;
        if loc.to_lowercase().contains("склад") || loc.to_lowercase().contains("дебарк") || !box_num.is_empty() {
          debarkader_qty += qty;
        } else {
          hall_qty += qty;
        }
        locations.push(ProductLocationDto {
          location: loc,
          box_number: box_num,
          quantity: qty,
        });
      }
    }
  }

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
    is_account_299: false,
  }))
}

fn scan_barcode(
  db_path: &Path,
  revision_id: &str,
  store_number: &str,
  location: &str,
  barcode: &str,
  add_qty: i64,
  box_number: &str,
  allow_unknown: bool,
  client_scan_id: &str,
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

  // Защита от дублей: если этот скан уже был сохранен ранее по client_scan_id
  if !client_scan_id.is_empty() {
    let already_recorded: Result<(String, String, String, String, i64, String), _> = conn.query_row(
      "SELECT i.id, i.sku, COALESCE(i.sku, ''), i.name, i.quantity, COALESCE(i.box_number, '')
       FROM processed_client_scans p
       JOIN inventory_items i ON i.id = p.item_id
       WHERE p.client_scan_id = ?1 LIMIT 1",
      params![client_scan_id],
      |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    );
    if let Ok((id, s, b, n, q, box_num)) = already_recorded {
      return Ok(ScannedProductDto {
        id,
        sku: s,
        barcode: b,
        name: n,
        quantity: q,
        updated_at: "уже учтено".to_string(),
        box_number: box_num,
      });
    }
  }

  let task_status: String = conn.query_row(
    "SELECT status FROM mobile_tasks WHERE name = ?1",
    params![clean_loc],
    |r| r.get(0),
  ).unwrap_or_else(|_| "in_progress".to_string());
  if task_status == "completed" {
    return Err("Задача уже завершена. Добавление товаров заблокировано.".to_string());
  }

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
        OR barcode LIKE ?1 || '%' 
        OR barcode LIKE '%' || ?1 || '%' 
     ORDER BY 
       CASE 
         WHEN TRIM(barcode) = ?1 OR TRIM(sku) = ?1 THEN 1
         WHEN barcode LIKE ?1 || '%' OR sku LIKE ?1 || '%' THEN 2
         ELSE 3
       END,
       LENGTH(sku) ASC
     LIMIT 1",
    params![clean_bc, unpadded_digits, digits_only],
    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
  );

  let (found_sku, found_name, found_bc, is_nd) = match catalog_lookup {
    Ok((s, n, b)) => {
      let primary_bc = b.split([',', ';', '\n', '\r', '/', ' ']).next().unwrap_or("").trim().to_string();
      let bc_to_show = if !primary_bc.is_empty() && primary_bc != s {
        primary_bc
      } else {
        clean_bc.to_string()
      };
      let final_name = if n.trim().is_empty() { format!("Товар {}", s) } else { n };
      (s, final_name, bc_to_show, false)
    }
    Err(_) => {
      if allow_unknown {
        (clean_bc.to_string(), "Н/Д".to_string(), clean_bc.to_string(), true)
      } else {
        return Err(format!("Товар с кодом «{}» не найден в каталоге", clean_bc));
      }
    }
  };

  let _ = conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'in_progress', datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET status = 'in_progress', updated_at = datetime('now', 'localtime')",
    params![clean_loc, revision_id, clean_loc],
  );

  let item_status = if is_nd { "nd" } else { "ok" };

  let clean_rev = revision_id.trim();
  let existing_item: Result<(String, i64, String), _> = if clean_box.is_empty() {
    conn.query_row(
      "SELECT id, quantity, COALESCE(box_number, '') FROM inventory_items 
       WHERE (?3 = '' OR ?3 = 'default' OR revision_id = ?3)
         AND (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND (box_number IS NULL OR TRIM(box_number) = '') LIMIT 1",
      params![clean_loc, found_sku, clean_rev],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
  } else {
    conn.query_row(
      "SELECT id, quantity, COALESCE(box_number, '') FROM inventory_items 
       WHERE (?4 = '' OR ?4 = 'default' OR revision_id = ?4)
         AND (TRIM(location) = ?1 OR location = ?1) AND sku = ?2 AND TRIM(COALESCE(box_number, '')) = ?3 LIMIT 1",
      params![clean_loc, found_sku, clean_box, clean_rev],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
  };

  let (item_id, new_total, final_box) = match existing_item {
    Ok((id, current_qty, b)) => {
      let next_qty = current_qty + qty;
      conn.execute("UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![next_qty, id])
        .map_err(|e| format!("Ошибка обновления товара: {}", e))?;
      (id, next_qty, b)
    }
    Err(_) => {
      let new_id = format!("item_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros());
      conn.execute(
        "INSERT INTO inventory_items (id, revision_id, store_number, name, sku, category, quantity, unit, location, box_number, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 'шт.', ?7, ?8, ?9, datetime('now', 'localtime'), datetime('now', 'localtime'))",
        params![new_id, revision_id, store_number, found_name, found_sku, qty, clean_loc, clean_box, item_status],
      ).map_err(|e| format!("Ошибка добавления товара: {}", e))?;
      (new_id, qty, clean_box.to_string())
    }
  };

  if !client_scan_id.is_empty() {
    let _ = conn.execute(
      "INSERT INTO processed_client_scans (client_scan_id, revision_id, store_number, item_id)
       VALUES (?1, ?2, ?3, ?4) ON CONFLICT(client_scan_id) DO NOTHING",
      params![client_scan_id, revision_id, store_number, item_id],
    );
  }

  record_sync_event(
    &conn,
    revision_id,
    store_number,
    "item_scanned",
    &json!({
      "type": "item_scanned",
      "barcode": found_bc,
      "sku": found_sku,
      "name": found_name,
      "location": clean_loc,
      "add_qty": qty,
      "quantity": new_total,
      "box_number": final_box,
      "item_id": item_id,
      "revision_id": revision_id,
      "store_number": store_number,
    }),
  );

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

fn scan_batch(
  db_path: &Path,
  revision_id: &str,
  store_number: &str,
  scans: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
  let mut results = Vec::new();
  for s in scans {
    let location = s.get("location").and_then(|v| v.as_str()).unwrap_or("");
    let barcode = s.get("barcode").and_then(|v| v.as_str()).unwrap_or("");
    let qty = s.get("quantity").and_then(|v| v.as_i64()).unwrap_or(1);
    let box_number = s.get("box_number").and_then(|v| v.as_str()).unwrap_or("");
    let allow_unknown = s.get("allow_unknown").and_then(|v| v.as_bool()).unwrap_or(true);
    let client_scan_id = s.get("client_scan_id").and_then(|v| v.as_str()).unwrap_or("");
    let rev = s.get("revision_id").and_then(|v| v.as_str()).unwrap_or(revision_id);
    let store = s.get("store_number").and_then(|v| v.as_str()).unwrap_or(store_number);

    match scan_barcode(db_path, rev, store, location, barcode, qty, box_number, allow_unknown, client_scan_id) {
      Ok(res) => {
        results.push(json!({ "success": true, "client_scan_id": client_scan_id, "item": res }));
      }
      Err(err) => {
        results.push(json!({ "success": false, "client_scan_id": client_scan_id, "error": err }));
      }
    }
  }

  Ok(json!({
    "success": true,
    "processed": results.len(),
    "results": results
  }))
}

fn update_item_box(db_path: &Path, revision_id: &str, item_id: &str, box_number: &str, location: &str) -> Result<(), String> {
  let conn = open_db(db_path)?;
  let clean_box = box_number.trim();
  conn.execute("UPDATE inventory_items SET box_number = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![clean_box, item_id])
    .map_err(|e| e.to_string())?;
  let clean_loc = location.trim();
  if !clean_loc.is_empty() {
    let _ = conn.execute("UPDATE mobile_tasks SET updated_at = datetime('now', 'localtime') WHERE name = ?1", params![clean_loc]);
  }

  record_sync_event(
    &conn,
    revision_id,
    "",
    "box_updated",
    &json!({
      "type": "box_updated",
      "item_id": item_id,
      "box_number": clean_box,
      "location": clean_loc,
      "revision_id": revision_id,
    }),
  );

  Ok(())
}

fn update_item_qty(db_path: &Path, revision_id: &str, item_id: &str, new_qty: i64, location: &str) -> Result<(), String> {
  let conn = open_db(db_path)?;
  if new_qty <= 0 {
    conn.execute("DELETE FROM inventory_items WHERE id = ?1", params![item_id])
      .map_err(|e| e.to_string())?;
  } else {
    conn.execute("UPDATE inventory_items SET quantity = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2", params![new_qty, item_id])
      .map_err(|e| e.to_string())?;
  }
  let clean_loc = location.trim();
  if !clean_loc.is_empty() {
    let _ = conn.execute("UPDATE mobile_tasks SET updated_at = datetime('now', 'localtime') WHERE name = ?1", params![clean_loc]);
  }

  record_sync_event(
    &conn,
    revision_id,
    "",
    "item_updated",
    &json!({
      "type": "item_updated",
      "item_id": item_id,
      "quantity": new_qty,
      "location": clean_loc,
      "revision_id": revision_id,
    }),
  );

  Ok(())
}

fn complete_task(db_path: &Path, revision_id: &str, store_number: &str, name: &str) -> Result<TaskCompleteResultDto, String> {
  let conn = open_db(db_path)?;
  let clean_name = name.trim();
  let _ = flush_draft_items(&conn, clean_name, revision_id, store_number);

  let (items_count, total_qty): (i64, i64) = conn.query_row(
    "SELECT COALESCE(COUNT(DISTINCT sku), 0), COALESCE(SUM(quantity), 0) FROM inventory_items WHERE TRIM(location) = ?1 OR location = ?1",
    params![clean_name],
    |r| Ok((r.get(0)?, r.get(1)?)),
  ).unwrap_or((0, 0));

  conn.execute(
    "INSERT INTO mobile_tasks (id, revision_id, name, status, created_at, updated_at, completed_at)
     VALUES (?1, ?2, ?3, 'completed', datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
     ON CONFLICT(name) DO UPDATE SET status = 'completed', updated_at = datetime('now', 'localtime'), completed_at = datetime('now', 'localtime')",
    params![clean_name, revision_id, clean_name],
  ).map_err(|e| e.to_string())?;

  record_sync_event(
    &conn,
    revision_id,
    store_number,
    "task_completed",
    &json!({
      "type": "task_completed",
      "task": clean_name,
      "items_count": items_count,
      "total_qty": total_qty,
      "revision_id": revision_id,
    }),
  );

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

fn main() {
  let port_str = std::env::var("PORT").unwrap_or_else(|_| "4820".to_string());
  let port: u16 = port_str.parse().unwrap_or(4820);
  let db_path_str = std::env::var("DB_PATH").unwrap_or_else(|_| "/opt/revizor/data/revision.db".to_string());
  let db_path = PathBuf::from(&db_path_str);

  println!("==========================================");
  println!("🚀 Запуск Ревизор VDS Server v1.0.0");
  println!("📡 Порт: {}", port);
  println!("💾 База данных: {}", db_path.display());
  println!("==========================================");

  if let Ok(conn) = open_db(&db_path) {
    if let Err(e) = ensure_mobile_tables(&conn) {
      eprintln!("⚠️  Предупреждение инициализации таблиц: {}", e);
    } else {
      println!("✅ Таблицы базы данных проверены и готовы.");
    }
  } else {
    eprintln!("❌ Не удалось открыть файл базы данных: {}", db_path.display());
  }

  let bind_addr = format!("0.0.0.0:{}", port);
  let server = match Server::http(&bind_addr) {
    Ok(s) => s,
    Err(e) => {
      eprintln!("❌ Ошибка биндинга сервера на {}: {}", bind_addr, e);
      std::process::exit(1);
    }
  };

  println!("🌐 Сервер слушает на http://{}", bind_addr);

  for mut request in server.incoming_requests() {
    let url = request.url().to_string();
    let method = request.method().clone();

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

    let query_map: HashMap<String, String> = query
      .split('&')
      .filter_map(|kv| {
        let mut parts = kv.splitn(2, '=');
        let k = parts.next()?;
        let v = parts.next().unwrap_or("");
        Some((k.to_string(), urlencoding_decode(v)))
      })
      .collect();

    let active_rev = query_map.get("rev").cloned().unwrap_or_else(|| "default".to_string());
    let active_store = query_map.get("store").cloned().unwrap_or_default();

    let is_post = method == Method::Post;
    println!(">>> HTTP {} {}", method, path);

    match (method, path) {
      (Method::Get, "/") | (Method::Get, "/index.html") | (Method::Get, "/mobile") => {
        let _ = request.respond(respond_html(MOBILE_HTML));
      }

      (Method::Get, "/js/zxing.min.js") | (Method::Get, "/zxing.min.js") => {
        let _ = request.respond(respond_js(ZXING_JS));
      }

      (Method::Get, "/manifest.json") => {
        let manifest = json!({
          "name": "Ревизор — Мобильный сканер",
          "short_name": "Ревизор",
          "start_url": "/",
          "display": "standalone",
          "background_color": "#090d16",
          "theme_color": "#090d16",
          "description": "Мобильный терминал сбора данных для инвентаризации с гарантией сохранения сканов"
        });
        let _ = request.respond(respond_json(&manifest, 200));
      }

      (Method::Get, "/api/status") => {
        let res = json!({
          "status": "ok",
          "is_running": true,
          "vds": true,
          "revision_id": active_rev,
          "store_number": active_store,
        });
        let _ = request.respond(respond_json(&res, 200));
      }

      (Method::Get, "/api/catalog/search") => {
        let q = query_map.get("q").cloned().unwrap_or_default();
        match search_catalog(&db_path, &q) {
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
        match get_product_details(&db_path, &code) {
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
        match get_tasks(&db_path, &active_rev) {
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

        match create_task(&db_path, &active_rev, task_name) {
          Ok(task) => {
            println!("📋 Создана задача: {}", task_name);
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

        match delete_task(&db_path, &active_rev, task_name) {
          Ok(_) => {
            println!("🗑️  Удалена задача: {}", task_name);
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
        match get_task_items(&db_path, &location_str, &active_rev, &active_store) {
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
        let client_scan_id = val.get("client_scan_id").and_then(|v| v.as_str()).unwrap_or("");
        let rev = val.get("revision_id").and_then(|v| v.as_str()).unwrap_or(&active_rev);
        let store = val.get("store_number").and_then(|v| v.as_str()).unwrap_or(&active_store);

        match scan_barcode(&db_path, rev, store, location, barcode, qty, box_number, allow_unknown, client_scan_id) {
          Ok(item) => {
            println!("🔍 Отсканирован: {} ({} шт.) → {}", item.name, qty, location);
            let _ = request.respond(respond_json(&json!({ "success": true, "item": item }), 200));
          }
          Err(e) => {
            let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
          }
        }
      }

      (Method::Post, "/api/scan/batch") => {
        let mut body = String::new();
        let _ = request.as_reader().read_to_string(&mut body);
        let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
        let scans = val.get("scans").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        match scan_batch(&db_path, &active_rev, &active_store, scans) {
          Ok(res) => {
            let _ = request.respond(respond_json(&res, 200));
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

        match complete_task(&db_path, &active_rev, &active_store, task_name) {
          Ok(res) => {
            println!("🏁 Задача «{}» завершена: {} позиций ({} шт.)", res.task, res.items_count, res.total_qty);
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
          match update_item_box(&db_path, &active_rev, item_id, box_num, location) {
            Ok(_) => {
              let _ = request.respond(respond_json(&json!({ "success": true }), 200));
            }
            Err(e) => {
              let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
            }
          }
        } else {
          let new_qty = val.get("quantity").and_then(|v| v.as_i64()).unwrap_or(0);
          match update_item_qty(&db_path, &active_rev, item_id, new_qty, location) {
            Ok(_) => {
              let _ = request.respond(respond_json(&json!({ "success": true }), 200));
            }
            Err(e) => {
              let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
            }
          }
        }
      }

      (Method::Get, "/api/sync/events") => {
        let after_id = query_map.get("after").and_then(|v| v.parse::<i64>().ok()).unwrap_or(0);
        match get_sync_events(&db_path, &active_rev, after_id) {
          Ok((events, latest_id)) => {
            let _ = request.respond(respond_json(&json!({
              "success": true,
              "events": events,
              "latest_id": latest_id
            }), 200));
          }
          Err(e) => {
            let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 500));
          }
        }
      }

      (Method::Post, "/api/sync/upload") => {
        let mut body = String::new();
        let _ = request.as_reader().read_to_string(&mut body);
        let val: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!({}));
        let rev = val.get("revision_id").and_then(|v| v.as_str()).unwrap_or(&active_rev);
        let store = val.get("store_number").and_then(|v| v.as_str()).unwrap_or(&active_store);
        let tasks = val.get("tasks").and_then(|v| v.as_array())
          .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
          .unwrap_or_default();
        let items = val.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let catalog = val.get("catalog").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let stock = val.get("stock").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        match sync_upload_data(&db_path, rev, store, tasks, items, catalog, stock) {
          Ok(res) => {
            let _ = request.respond(respond_json(&res, 200));
          }
          Err(e) => {
            let _ = request.respond(respond_json(&json!({ "success": false, "error": e }), 400));
          }
        }
      }

      _ => {
        let _ = request.respond(Response::from_string("Not Found").with_status_code(StatusCode(404)));
      }
    }
  }
}
