# AI-Based Video Similarity Detection — Proof of Concept

A lightweight CLI tool that detects visually similar videos on YouTube using AI embeddings (CLIP).

## How It Works

1. **Input** — You provide a YouTube video URL
2. **Download** — The video is downloaded locally via `yt-dlp`
3. **Frame Extraction** — N frames are sampled at even intervals using OpenCV
4. **Search** — YouTube is searched for videos with similar titles
5. **Embedding** — CLIP generates visual embeddings for frames and candidate thumbnails
6. **Comparison** — Cosine similarity scores are computed
7. **Output** — Candidates are ranked and matches above threshold are flagged

## Setup

```bash
pip install -r requirements.txt
```

**Requirements:** Python >= 3.8, Internet connection

## Usage

```bash
# Basic usage
python main.py "https://www.youtube.com/watch?v=VIDEO_ID"

# Custom settings
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" --frames 5 --threshold 0.80 --candidates 15
```

### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--frames` | 3 | Number of frames to extract (1-10) |
| `--threshold` | 0.85 | Similarity threshold for flagging matches |
| `--candidates` | 10 | Max YouTube candidates to compare |

## Project Structure

```
Prototype/
├── main.py                  # CLI entry point
├── requirements.txt         # Dependencies
├── PROJECT_SRS.md           # Software Requirements Specification
├── README.md
└── src/
    ├── __init__.py
    ├── video_processor.py   # Download & frame extraction
    ├── search_service.py    # YouTube search via yt-dlp
    ├── embedding_service.py # CLIP embeddings
    ├── similarity_service.py# Cosine similarity
    └── analyzer.py          # Pipeline orchestrator
```

## Tech Stack

- **yt-dlp** — YouTube video download
- **OpenCV** — Frame extraction (no ffmpeg needed)
- **CLIP** (`openai/clip-vit-base-patch32`) — Visual embeddings
- **NumPy** — Cosine similarity computation
- **Transformers + PyTorch** — Model inference
