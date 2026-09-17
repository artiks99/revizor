import sys
import json
from mcp.server.fastmcp import FastMCP
from ragflow_sdk import RAGFlow

mcp = FastMCP("ragflow")

API_KEY = "ragflow-99UYLBJAvR-h8IJJ6zX6LS4UfQsvotJoDTUGSCywdUk"
RAGFLOW_HOST = "http://localhost"
DATASET_NAME = "project-code"

# Кэш клиента и датасета — не пересоздаём на каждый запрос
_rag_client = None
_dataset = None


def get_rag_and_dataset():
    global _rag_client, _dataset
    if _rag_client is None:
        _rag_client = RAGFlow(api_key=API_KEY, base_url=RAGFLOW_HOST)
    if _dataset is None:
        datasets = _rag_client.list_datasets(name=DATASET_NAME)
        if not datasets:
            raise RuntimeError(f"Датасет '{DATASET_NAME}' не найден.")
        _dataset = datasets[0]
    return _rag_client, _dataset


@mcp.tool()
def search_knowledge_base(query: str) -> str:
    """Ищет релевантные куски кода и структуры в базе знаний RAGFlow."""
    try:
        rag, ds = get_rag_and_dataset()
        # Вызов retrieve выполняется через основной клиент RAGFlow
        chunks = rag.retrieve(
            dataset_ids=[ds.id],
            question=query,
            page=1,
            page_size=6,
            similarity_threshold=0.2,
            vector_similarity_weight=0.3
        )
        
        if not chunks:
            return f"По запросу '{query}' ничего не найдено в базе знаний."

        results = []
        for i, chunk in enumerate(chunks, 1):
            doc_name = getattr(chunk, "document_name", getattr(chunk, "docnm_kwd", "Документ"))
            content = getattr(chunk, "content_with_weight", getattr(chunk, "content", ""))
            results.append(f"[{i}] Файл: {doc_name}\nСодержимое:\n{content}\n{'-'*40}")

        return "\n".join(results)
    except Exception as e:
        return f"Ошибка RAGFlow: {str(e)}"

if __name__ == "__main__":
    mcp.run()