import os
import time
import json
import hashlib
from ragflow_sdk import RAGFlow

API_KEY = "ragflow-99UYLBJAvR-h8IJJ6zX6LS4UfQsvotJoDTUGSCywdUk"
RAGFLOW_HOST = "http://localhost"
DATASET_NAME = "project-code"
PROJECT_ROOT = r"E:\rabstol\revizor"
CACHE_FILE = os.path.join(PROJECT_ROOT, ".ragflow_cache.json")

# --- Tuning knobs ---
UPLOAD_BATCH_SIZE = 5        # файлов за одну пачку загрузки
PARSE_BATCH_SIZE = 10        # документов за один вызов async_parse
UPLOAD_PAUSE = 1.0           # пауза между пачками загрузки (сек)
PARSE_PAUSE = 3.0            # пауза после отправки пачки на парсинг (сек)
MONITOR_INTERVAL = 5         # пауза основного цикла мониторинга (сек)
RETRY_CHECK_EVERY = 12       # каждые N итераций мониторинга — проверяем Failed
BASE_BACKOFF = 5.0           # начальный backoff при 429 (сек)
MAX_BACKOFF = 120.0          # максимальный backoff при 429 (сек)

# Игнорируем тяжелые, сгенерированные и служебные файлы
IGNORED_DIRS = {"node_modules", "ragflow", ".git", ".idea", ".vscode", "dist", "target", "build", "__pycache__", "gen", "schemas"}
IGNORED_FILES = {"package-lock.json", "Cargo.lock", "yarn.lock", "pnpm-lock.yaml", ".ragflow_cache.json", "sync_ragflow.py", "ragflow_mcp.py"}
ALLOWED_EXTENSIONS = {".ts", ".js", ".vue", ".json", ".html", ".css", ".rs", ".md", ".toml", ".sql"}
WRAP_AS_TEXT = {".vue", ".rs", ".css", ".toml", ".sql"}


def get_file_hash(path: str) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache: dict):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def init_dataset():
    rag = RAGFlow(api_key=API_KEY, base_url=RAGFLOW_HOST)
    datasets = rag.list_datasets(name=DATASET_NAME)
    if not datasets:
        raise RuntimeError(f"Датасет '{DATASET_NAME}' не найден.")
    return datasets[0]


def should_process(file_path: str) -> bool:
    name = os.path.basename(file_path)
    if name in IGNORED_FILES:
        return False
    parts = set(file_path.replace("\\", "/").split("/"))
    if IGNORED_DIRS & parts:
        return False
    _, ext = os.path.splitext(file_path)
    return ext.lower() in ALLOWED_EXTENSIONS


def make_unique_name(rel_path: str) -> str:
    clean_path = rel_path.replace("\\", "__").replace("/", "__")
    _, ext = os.path.splitext(clean_path)
    if ext.lower() in WRAP_AS_TEXT:
        return f"{clean_path}.md"
    return clean_path


def fetch_all_documents(ds):
    all_docs = []
    page = 1
    page_size = 100
    while True:
        try:
            docs = ds.list_documents(page=page, page_size=page_size)
            if not docs:
                break
            all_docs.extend(docs)
            if len(docs) < page_size:
                break
            page += 1
        except Exception:
            try:
                all_docs = ds.list_documents()
            except Exception:
                pass
            break
    return all_docs


def get_local_files():
    local_map = {}
    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for file in files:
            full_path = os.path.join(root, file)
            if should_process(full_path):
                rel_path = os.path.relpath(full_path, PROJECT_ROOT)
                disp_name = make_unique_name(rel_path)
                local_map[disp_name] = full_path
    return local_map


def print_summary(local_map, remote_docs):
    success_count = 0
    failed_count = 0
    pending_count = 0
    failed_files = []

    for doc in remote_docs:
        status = getattr(doc, "run", None) or getattr(doc, "status", "")
        if str(status) in ["1", "SUCCESS", "success"]:
            success_count += 1
        elif str(status) in ["3", "FAIL", "FAILED", "failed"]:
            failed_count += 1
            failed_files.append(doc.name)
        else:
            pending_count += 1

    remote_names = {d.name for d in remote_docs}
    missing_on_server = [name for name in local_map.keys() if name not in remote_names]

    print("\n" + "=" * 50)
    print(f"📊 СВОДКА СИНХРОНИЗАЦИИ [{DATASET_NAME}]")
    print("=" * 50)
    print(f"• Локальных файлов проекта     : {len(local_map)}")
    print(f"• Файлов в базе знаний RAGFlow : {len(remote_docs)}")
    print(f"  ├─ Успешно готовы (Success)  : {success_count}")
    print(f"  ├─ В обработке (Running)     : {pending_count}")
    print(f"  └─ С ошибкой (Failed)        : {failed_count}")

    if missing_on_server:
        print(f"• Ожидают первой загрузки      : {len(missing_on_server)}")
        for m in missing_on_server[:3]:
            print(f"    - {m}")
        if len(missing_on_server) > 3:
            print(f"    ... еще {len(missing_on_server) - 3}")

    if failed_files:
        print(f"• Файлы с ошибкой векторизации :")
        for f in failed_files:
            print(f"    ❌ {f}")
    print("=" * 50 + "\n")


def retry_failed_documents(ds, remote_docs):
    failed_ids = []
    for doc in remote_docs:
        status = getattr(doc, "run", None) or getattr(doc, "status", "")
        if str(status) in ["3", "FAIL", "FAILED", "failed"]:
            failed_ids.append(doc.id)

    if failed_ids:
        print(f"[*] Найдено {len(failed_ids)} упавших файлов. Перезапуск парсинга...")
        # Парсим пачками, чтобы не перегружать API
        for i in range(0, len(failed_ids), PARSE_BATCH_SIZE):
            batch = failed_ids[i:i + PARSE_BATCH_SIZE]
            try:
                ds.async_parse_documents(batch)
                print(f"[+] Повторный парсинг: пачка {i // PARSE_BATCH_SIZE + 1} ({len(batch)} файлов)")
            except Exception as e:
                print(f"[-] Ошибка при повторном запуске: {e}")
            if i + PARSE_BATCH_SIZE < len(failed_ids):
                time.sleep(PARSE_PAUSE)


def cleanup_orphan_documents(ds, local_files, remote_docs):
    orphan_ids = []
    for doc in remote_docs:
        if doc.name not in local_files:
            orphan_ids.append(doc.id)

    if orphan_ids:
        print(f"[*] Удаление {len(orphan_ids)} устаревших / исключенных файлов из базы RAGFlow...")
        try:
            ds.delete_documents(orphan_ids)
            print("[+] Очистка завершена.")
        except Exception as e:
            print(f"[-] Ошибка при удалении устаревших файлов: {e}")


def _is_rate_limited(err: Exception) -> bool:
    """Проверяем, является ли ошибка rate-limit (429 / RESOURCE_EXHAUSTED)."""
    msg = str(err)
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg


def _backoff_sleep(attempt: int) -> float:
    """Экспоненциальный backoff: 5 → 10 → 20 → 40 → ... до MAX_BACKOFF."""
    delay = min(BASE_BACKOFF * (2 ** attempt), MAX_BACKOFF)
    print(f"[!] Rate-limit, пауза {delay:.0f} сек (попытка {attempt + 1})...")
    time.sleep(delay)
    return delay


def _upload_and_collect(ds, batch_items, server_docs, cache):
    """
    Загружает пачку файлов и возвращает список doc_id для последующего парсинга.
    Не вызывает async_parse — парсинг будет запущен отдельно, пачками.
    """
    uploaded_ids = []
    rate_limit_attempts = 0

    for disp_name, full_path, current_hash in batch_items:
        # Удаляем старую версию, если есть
        if disp_name in server_docs:
            try:
                ds.delete_documents([server_docs[disp_name]])
            except Exception:
                pass

        # Загружаем новую версию
        success = False
        while not success:
            try:
                with open(full_path, "rb") as f:
                    blob = f.read()

                uploaded = ds.upload_documents([{"display_name": disp_name, "blob": blob}])
                if uploaded:
                    doc_id = uploaded[0].id
                    uploaded_ids.append(doc_id)
                    server_docs[disp_name] = doc_id
                    print(f"[+] Загружен: {disp_name}")

                cache[full_path] = current_hash
                success = True
                rate_limit_attempts = 0  # сбрасываем при успехе

            except Exception as e:
                if _is_rate_limited(e):
                    _backoff_sleep(rate_limit_attempts)
                    rate_limit_attempts += 1
                else:
                    print(f"[-] Ошибка для {disp_name}: {e}")
                    success = True  # пропускаем файл, не зацикливаемся

    return uploaded_ids


def _trigger_parse_batched(ds, doc_ids):
    """Запускает парсинг пачками, с паузой между ними."""
    if not doc_ids:
        return
    total = len(doc_ids)
    print(f"[*] Запуск парсинга {total} документов (пачки по {PARSE_BATCH_SIZE})...")
    for i in range(0, total, PARSE_BATCH_SIZE):
        batch = doc_ids[i:i + PARSE_BATCH_SIZE]
        try:
            ds.async_parse_documents(batch)
            print(f"[▸] Парсинг: пачка {i // PARSE_BATCH_SIZE + 1} ({len(batch)} шт.)")
        except Exception as e:
            if _is_rate_limited(e):
                _backoff_sleep(0)
                try:
                    ds.async_parse_documents(batch)
                except Exception as e2:
                    print(f"[-] Не удалось запарсить пачку: {e2}")
            else:
                print(f"[-] Ошибка парсинга пачки: {e}")
        # Пауза между пачками парсинга
        if i + PARSE_BATCH_SIZE < total:
            time.sleep(PARSE_PAUSE)


def initial_sync(ds, cache, local_files, server_docs):
    """
    Начальная синхронизация: собирает все изменённые файлы, загружает пачками,
    потом запускает парсинг пачками. Не блокирует API шквалом запросов.
    """
    # 1. Собираем список файлов, которые нужно загрузить
    to_upload = []
    for disp_name, full_path in local_files.items():
        try:
            current_hash = get_file_hash(full_path)
            if cache.get(full_path) == current_hash and disp_name in server_docs:
                continue
            to_upload.append((disp_name, full_path, current_hash))
        except Exception as e:
            print(f"[-] Не удалось прочитать {disp_name}: {e}")

    if not to_upload:
        print("[✓] Все файлы актуальны, загрузка не требуется.")
        return

    print(f"[*] Необходимо загрузить {len(to_upload)} файлов (пачки по {UPLOAD_BATCH_SIZE})...")

    # 2. Загружаем пачками, собираем ID для парсинга
    all_uploaded_ids = []
    for i in range(0, len(to_upload), UPLOAD_BATCH_SIZE):
        batch = to_upload[i:i + UPLOAD_BATCH_SIZE]
        ids = _upload_and_collect(ds, batch, server_docs, cache)
        all_uploaded_ids.extend(ids)
        save_cache(cache)
        # Пауза между пачками загрузки
        if i + UPLOAD_BATCH_SIZE < len(to_upload):
            time.sleep(UPLOAD_PAUSE)

    # 3. После всех загрузок — парсим пачками
    _trigger_parse_batched(ds, all_uploaded_ids)

    print(f"[✓] Начальная синхронизация завершена: {len(all_uploaded_ids)} файлов отправлено на парсинг.")


def monitor_loop(ds, cache, server_docs):
    """
    Цикл мониторинга: отслеживает изменения файлов,
    загружает и парсит только изменённые, пачками.
    """
    print("[*] Мониторинг изменений запущен...")
    loop_counter = 0

    while True:
        local_files = get_local_files()
        changed_items = []

        for disp_name, full_path in local_files.items():
            try:
                current_hash = get_file_hash(full_path)
                if cache.get(full_path) != current_hash:
                    changed_items.append((disp_name, full_path, current_hash))
            except Exception:
                pass

        # Загружаем и парсим изменённые файлы
        if changed_items:
            print(f"[~] Обнаружено {len(changed_items)} изменений...")
            all_ids = []
            for i in range(0, len(changed_items), UPLOAD_BATCH_SIZE):
                batch = changed_items[i:i + UPLOAD_BATCH_SIZE]
                ids = _upload_and_collect(ds, batch, server_docs, cache)
                all_ids.extend(ids)
                save_cache(cache)
                if i + UPLOAD_BATCH_SIZE < len(changed_items):
                    time.sleep(UPLOAD_PAUSE)

            _trigger_parse_batched(ds, all_ids)

        # Периодическая проверка Failed-документов
        loop_counter += 1
        if loop_counter >= RETRY_CHECK_EVERY:
            loop_counter = 0
            try:
                docs = fetch_all_documents(ds)
                retry_failed_documents(ds, docs)
            except Exception:
                pass

        time.sleep(MONITOR_INTERVAL)


def sync():
    ds = init_dataset()
    cache = load_cache()

    print(f"[*] Инициализация датасета: {ds.name}")

    local_files = get_local_files()
    remote_docs = fetch_all_documents(ds)

    # Удаляем файлы, которых больше нет локально или которые добавлены в IGNORED
    cleanup_orphan_documents(ds, local_files, remote_docs)

    # Повторяем упавшие файлы
    retry_failed_documents(ds, remote_docs)

    remote_docs = fetch_all_documents(ds)
    server_docs = {d.name: d.id for d in remote_docs}
    print_summary(local_files, remote_docs)

    # Начальная синхронизация (пакетная, не спамит API)
    initial_sync(ds, cache, local_files, server_docs)

    # Финальная сводка
    remote_docs = fetch_all_documents(ds)
    print_summary(local_files, remote_docs)

    # Мониторинг изменений
    monitor_loop(ds, cache, server_docs)


if __name__ == "__main__":
    sync()