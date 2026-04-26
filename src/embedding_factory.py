import os

def get_embedding_service():
    backend = os.getenv("EMBEDDING_BACKEND", "gemini").lower()
    if backend == "gemini":
        from .gemini_embedding_service import GeminiEmbeddingService
        return GeminiEmbeddingService()
    else:
        from .embedding_service import EmbeddingService
        return EmbeddingService()
