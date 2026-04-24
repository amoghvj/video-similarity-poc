"""
Video Processing Module
- Downloads YouTube videos using yt-dlp
- Extracts N frames at evenly spaced intervals using OpenCV
"""

import os
import tempfile
import cv2
import yt_dlp
from PIL import Image


class VideoProcessor:
    """Handles video downloading and frame extraction."""

    def __init__(self, output_dir: str = None):
        """
        Initialize VideoProcessor.

        Args:
            output_dir: Directory to store downloaded videos and frames.
                        If None, uses a temporary directory.
        """
        if output_dir is None:
            output_dir = os.path.join(tempfile.gettempdir(), "video_similarity_poc")
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def download_video(self, url: str) -> dict:
        """
        Download a YouTube video and return metadata + file path.

        Args:
            url: YouTube video URL.

        Returns:
            dict with keys: 'filepath', 'title', 'id', 'duration'

        Raises:
            RuntimeError: If the download fails.
        """
        video_path = os.path.join(self.output_dir, "input_video.mp4")

        ydl_opts = {
            "format": "worst[ext=mp4]",  # Smallest MP4 for speed
            "outtmpl": video_path,
            "quiet": True,
            "no_warnings": True,
            "overwrites": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return {
                    "filepath": video_path,
                    "title": info.get("title", "Unknown"),
                    "id": info.get("id", ""),
                    "duration": info.get("duration", 0),
                }
        except Exception as e:
            raise RuntimeError(f"Failed to download video: {e}")

    def extract_frames(self, video_path: str, n_frames: int = 3) -> list:
        """
        Extract N evenly spaced frames from a video file using OpenCV.

        Args:
            video_path: Path to the video file.
            n_frames: Number of frames to extract (default 3).

        Returns:
            List of PIL Image objects.

        Raises:
            RuntimeError: If the video cannot be opened or frames cannot be extracted.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            raise RuntimeError("Video has no frames.")

        # Calculate evenly spaced frame indices
        # Avoid first and last 5% to skip intros/outros
        start_frame = int(total_frames * 0.05)
        end_frame = int(total_frames * 0.95)
        if end_frame <= start_frame:
            start_frame = 0
            end_frame = total_frames - 1

        if n_frames == 1:
            indices = [total_frames // 2]
        else:
            step = (end_frame - start_frame) / (n_frames - 1)
            indices = [int(start_frame + i * step) for i in range(n_frames)]

        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret:
                # Convert BGR (OpenCV) to RGB (PIL)
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(frame_rgb)
                frames.append(pil_image)

        cap.release()

        if not frames:
            raise RuntimeError("Failed to extract any frames from the video.")

        print(f"  ✓ Extracted {len(frames)} frames from video")
        return frames
