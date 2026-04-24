"""
Similarity Module
- Computes cosine similarity between embedding vectors
- Aggregates similarity across multiple frames vs. candidates
"""

import numpy as np


class SimilarityService:
    """Computes cosine similarity between embeddings."""

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """
        Compute cosine similarity between two vectors.

        Args:
            a: First embedding vector.
            b: Second embedding vector.

        Returns:
            Cosine similarity score in range [-1, 1].
        """
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(dot / (norm_a * norm_b))

    @staticmethod
    def compute_max_similarity(frame_embeddings: list, thumbnail_embedding: np.ndarray) -> float:
        """
        Compute the maximum cosine similarity between a candidate's thumbnail
        and all extracted frames.

        Args:
            frame_embeddings: List of embedding vectors from input video frames.
            thumbnail_embedding: Embedding vector of the candidate's thumbnail.

        Returns:
            Maximum cosine similarity score across all frames.
        """
        if not frame_embeddings:
            return 0.0

        similarities = [
            SimilarityService.cosine_similarity(frame_emb, thumbnail_embedding)
            for frame_emb in frame_embeddings
        ]
        return max(similarities)

    @staticmethod
    def compute_avg_similarity(frame_embeddings: list, thumbnail_embedding: np.ndarray) -> float:
        """
        Compute the average cosine similarity between a candidate's thumbnail
        and all extracted frames.

        Args:
            frame_embeddings: List of embedding vectors from input video frames.
            thumbnail_embedding: Embedding vector of the candidate's thumbnail.

        Returns:
            Average cosine similarity score across all frames.
        """
        if not frame_embeddings:
            return 0.0

        similarities = [
            SimilarityService.cosine_similarity(frame_emb, thumbnail_embedding)
            for frame_emb in frame_embeddings
        ]
        return sum(similarities) / len(similarities)
