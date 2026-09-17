from ragflow_sdk import RAGFlow

API_KEY = "ragflow-99UYLBJAvR-h8IJJ6zX6LS4UfQsvotJoDTUGSCywdUk"
rag = RAGFlow(api_key=API_KEY, base_url="http://localhost")

print("[*] Проверка подключения к RAGFlow...")
try:
    datasets = rag.list_datasets()
    print(f"Доступно датасетов под текущим ключом: {len(datasets)}")
    for ds in datasets:
        print(f" - Датасет: {ds.name} (ID: {ds.id})")

    target = [d for d in datasets if d.name == "project-code"]
    if target:
        ds_id = target[0].id
        print(f"\n[*] Выполняем тестовый поиск по датасету '{target[0].name}'...")
        res = rag.retrieve(dataset_ids=[ds_id], question="таблица инвентаризации", page_size=2)
        print(f"Результатов поиска: {len(res)}")
        for r in res:
            doc_name = getattr(r, "document_name", getattr(r, "docnm_kwd", "Документ"))
            content = getattr(r, "content_with_weight", getattr(r, "content", ""))
            print(f"-> Файл: {doc_name} | Фрагмент: {content[:100]}...")
    else:
        print("\n[!] Датасет 'project-code' не найден под этим ключом.")
except Exception as e:
    print(f"[!] Ошибка: {e}")