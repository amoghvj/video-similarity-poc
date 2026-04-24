"""
Analyzer Module
- Orchestrates the full video similarity detection pipeline
- Coordinates all modules: VideoProcessor, SearchService, EmbeddingService, SimilarityService
"""

from .video_processor import VideoProcessor
from .search_service import SearchService
from .embedding_service import EmbeddingService
from .similarity_service import SimilarityService


class Analyzer:
    """Orchestrates the full video similarity detection pipeline."""

    def __init__(self, n_frames: int = 3, threshold: float = 0.85, max_candidates: int = 10):
        """
        Initialize Analyzer with configurable parameters.

        Args:
            n_frames: Number of frames to extract from the input video.
            threshold: Similarity threshold for flagging matches.
            max_candidates: Maximum number of candidate videos to compare.
        """
        self.n_frames = n_frames
        self.threshold = threshold
        self.max_candidates = max_candidates

        self.video_processor = VideoProcessor()
        self.search_service = SearchService(max_results=max_candidates)
        self.embedding_service = None  # Lazy-loaded
        self.similarity_service = SimilarityService()

    def _ensure_embedding_service(self):
        """Lazy-load the embedding service (CLIP model) only when needed."""
        if self.embedding_service is None:
            self.embedding_service = EmbeddingService()

    def run(self, youtube_url: str) -> dict:
        """
        Run the full video similarity detection pipeline.

        Args:
            youtube_url: YouTube video URL to analyze.

        Returns:
            dict with keys:
                - 'input_video': dict with title, id, url
                - 'candidates': list of dicts with title, url, similarity, is_match
                - 'matches': list of candidates above threshold
                - 'threshold': the similarity threshold used
                - 'n_frames': number of frames used
        """
        results = {
            "input_video": {},
            "candidates": [],
            "matches": [],
            "threshold": self.threshold,
            "n_frames": self.n_frames,
        }

        # === Step 1: Download Video ===
        print("\n[1/6] 📥 Downloading video...")
        try:
            video_info = self.video_processor.download_video(youtube_url)
            results["input_video"] = {
                "title": video_info["title"],
                "id": video_info["id"],
                "url": youtube_url,
            }
            print(f"  ✓ Downloaded: {video_info['title']}")
        except RuntimeError as e:
            print(f"  ✗ {e}")
            return results

        # === Step 2: Extract Frames ===
        print(f"\n[2/6] 🎞️  Extracting {self.n_frames} frames...")
        try:
            frames = self.video_processor.extract_frames(
                video_info["filepath"], n_frames=self.n_frames
            )
        except RuntimeError as e:
            print(f"  ✗ {e}")
            return results

        # === Step 3: Search YouTube ===
        print(f"\n[3/6] 🔍 Searching YouTube for similar videos...")
        candidates = self.search_service.search_videos(video_info["title"])
        if not candidates:
            print("  ✗ No candidates found.")
            return results

        # Filter out the input video itself
        candidates = [c for c in candidates if c["id"] != video_info["id"]]
        print(f"  ✓ {len(candidates)} candidates after filtering self")

        # === Step 4: Generate Frame Embeddings ===
        print(f"\n[4/6] 🧠 Generating embeddings for {len(frames)} frames...")
        self._ensure_embedding_service()
        frame_embeddings = self.embedding_service.get_batch_embeddings(frames)
        print(f"  ✓ Generated {len(frame_embeddings)} frame embeddings")

        # === Step 5: Compare with Candidates ===
        print(f"\n[5/6] 📊 Comparing with {len(candidates)} candidates...")
        for i, candidate in enumerate(candidates):
            try:
                thumb_embedding = self.embedding_service.get_embedding_from_url(
                    candidate["thumbnail_url"]
                )
                max_sim = self.similarity_service.compute_max_similarity(
                    frame_embeddings, thumb_embedding
                )
                avg_sim = self.similarity_service.compute_avg_similarity(
                    frame_embeddings, thumb_embedding
                )
                is_match = max_sim >= self.threshold

                result_entry = {
                    "title": candidate["title"],
                    "url": candidate["url"],
                    "thumbnail_url": candidate["thumbnail_url"],
                    "max_similarity": round(max_sim, 4),
                    "avg_similarity": round(avg_sim, 4),
                    "is_match": is_match,
                }
                results["candidates"].append(result_entry)

                if is_match:
                    results["matches"].append(result_entry)

                status = "🔴 MATCH" if is_match else "⚪"
                print(f"  [{i+1}/{len(candidates)}] {status} {max_sim:.4f} — {candidate['title'][:60]}")

            except RuntimeError as e:
                print(f"  [{i+1}/{len(candidates)}] ⚠️  Skipped (thumbnail error): {candidate['title'][:40]}")
                continue

        # === Step 6: Sort & Summarize ===
        print(f"\n[6/6] 📋 Finalizing results...")
        results["candidates"].sort(key=lambda x: x["max_similarity"], reverse=True)
        results["matches"].sort(key=lambda x: x["max_similarity"], reverse=True)

        return results
