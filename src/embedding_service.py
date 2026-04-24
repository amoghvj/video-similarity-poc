"""
Embedding Module
- Generates visual embeddings using OpenAI's CLIP model (clip-vit-base-patch32)
- Handles both PIL Images and image URLs (for thumbnails)
"""

import io
import requests
import numpy as np
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel


class EmbeddingService:
    """Generates image embeddings using CLIP."""

    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        """
        Initialize EmbeddingService with the CLIP model.

        Args:
            model_name: HuggingFace model identifier for CLIP.
        """
        print(f"  Loading CLIP model ({model_name})...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.model.eval()
        print(f"  ✓ CLIP model loaded on {self.device}")

    def get_image_embedding(self, image: Image.Image) -> np.ndarray:
        """
        Generate an embedding vector for a PIL Image.

        Args:
            image: A PIL Image object.

        Returns:
            Normalized embedding vector as numpy array.
        """
        inputs = self.processor(images=image, return_tensors="pt").to(self.device)
        with torch.no_grad():
            embedding = self.model.get_image_features(**inputs)

        # Normalize the embedding
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
        return embedding.cpu().numpy().flatten()

    def get_embedding_from_url(self, url: str) -> np.ndarray:
        """
        Download an image from URL and generate its embedding.

        Args:
            url: URL of the image to embed.

        Returns:
            Normalized embedding vector as numpy array.

        Raises:
            RuntimeError: If the image cannot be fetched or processed.
        """
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            image = Image.open(io.BytesIO(response.content)).convert("RGB")
            return self.get_image_embedding(image)
        except Exception as e:
            raise RuntimeError(f"Failed to get embedding from URL {url}: {e}")

    def get_batch_embeddings(self, images: list) -> list:
        """
        Generate embeddings for a batch of PIL Images.

        Args:
            images: List of PIL Image objects.

        Returns:
            List of normalized embedding vectors (numpy arrays).
        """
        embeddings = []
        for img in images:
            emb = self.get_image_embedding(img)
            embeddings.append(emb)
        return embeddings
