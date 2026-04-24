# 📄 Software Requirements Specification (SRS)  
## AI-Based Video Similarity Detection Prototype (2-Hour POC)

---

# 1. 🧠 System Description

## 1.1 Overview

The system is a **lightweight proof-of-concept application** that demonstrates AI-based detection of visually similar videos on YouTube.

It:
- Takes a **YouTube video URL as input**
- Extracts **N representative frames (configurable)**
- Uses **AI embeddings** to represent visual content
- Searches YouTube for related videos
- Compares similarity between the input video and candidate videos
- Flags potential matches based on a similarity threshold

---

## 1.2 Purpose

The purpose of this prototype is to:

- Demonstrate feasibility of **visual similarity detection**
- Validate use of **multimodal embeddings (visual)**
- Provide a working foundation for a larger **digital asset protection system**

---

## 1.3 Key Features

- YouTube video ingestion
- Configurable frame extraction (N frames)
- Visual embedding generation
- YouTube search (top 10 results)
- Thumbnail-based comparison
- Similarity scoring using cosine similarity
- Threshold-based match detection

---

# 2. ⚙️ Specific Requirements (Functional)

---

## 2.1 Functional Requirements

### FR1 — Video Input
- System shall accept a YouTube video URL as input

---

### FR2 — Video Download
- System shall download the input video locally

---

### FR3 — Frame Extraction
- System shall extract **N frames** at configurable timestamps or intervals  
- The value of **N shall be adjustable** to balance accuracy and performance

---

### FR4 — Embedding Generation
- System shall generate embeddings for:
  - Extracted frames  
  - Candidate video thumbnails  

---

### FR5 — Candidate Retrieval
- System shall retrieve **top 10 YouTube videos** based on title

---

### FR6 — Similarity Computation
- System shall compute cosine similarity between:
  - Each frame embedding  
  - Each thumbnail embedding  

---

### FR7 — Match Detection
- System shall:
  - Compute max similarity per candidate across all frames  
  - Flag candidates above threshold (e.g. 0.85)

---

### FR8 — Output Display
- System shall display:
  - Candidate title  
  - Similarity score  
  - Match flag (if applicable)  

---

## 2.2 Use Cases

### UC1 — Detect Similar Videos

**Actor:** User  

**Flow:**
1. User inputs YouTube URL  
2. System processes video  
3. System retrieves candidates  
4. System computes similarity  
5. System displays results  

---

# 3. ⚠️ Constraints (Non-Functional Requirements)

---

## 3.1 Performance

- Total execution time: **≤ 10 seconds**
- Max candidates: **10**
- Number of frames: **N (configurable, recommended range: 1–5)**

---

## 3.2 Usability

- CLI-based interaction (simple input/output)
- Minimal setup required
- Clear printed results

---

## 3.3 Reliability

- System should handle:
  - Missing thumbnails  
  - Failed downloads  
- Partial results should still be displayed

---

## 3.4 Scalability (Not Required for POC)

- No database  
- No persistent storage  
- No batch processing  

---

# 4. 🧩 Modules and Components

---

## 4.1 Core Modules

### 1. Input Module
- Accepts YouTube URL  

---

### 2. Video Processing Module
- Downloads video  
- Extracts N frames  

---

### 3. Search Module
- Retrieves candidate videos from YouTube  

---

### 4. Embedding Module
- Generates embeddings using CLIP  

---

### 5. Similarity Module
- Computes cosine similarity  

---

### 6. Output Module
- Displays results and flags matches  

---

# 5. 🚀 System Features

---

- Visual similarity detection using AI  
- Multi-frame robustness via configurable sampling  
- Lightweight YouTube-based search  
- Threshold-based filtering  
- Fully on-demand processing  

---

# 6. 📏 Constraints and Acceptance Criteria

---

## Constraints

- Must run within **2 hours of development time**
- Must not require:
  - Training models  
  - External databases  
- Must use only:
  - Pretrained models  

---

## Acceptance Criteria

- Video is successfully downloaded  
- Frames are extracted (≥1 frame)  
- At least 1 candidate is processed  
- Similarity scores are computed  
- Matches above threshold are flagged  

---

# 7. 👤 Use Case and Actions

---

## Use Case: Video Similarity Detection

### Actor: User  

### Actions:

1. Provide YouTube URL  
2. Trigger analysis  
3. View results  

---

### System Actions:

1. Download video  
2. Extract N frames  
3. Search YouTube  
4. Fetch thumbnails  
5. Generate embeddings  
6. Compute similarity  
7. Display results  

---

# 8. 🏗️ Classes and Modules

---

## Classes

### 1. VideoProcessor
- download_video()  
- extract_frames(n_frames)  

---

### 2. SearchService
- search_videos(query)  

---

### 3. EmbeddingService
- get_image_embedding(image)  

---

### 4. SimilarityService
- cosine_similarity(a, b)  

---

### 5. Analyzer
- orchestrates full pipeline  

---

# 9. 🔄 Sequence of Actions (System Flow)

---

```text
User Input
   ↓
VideoProcessor.download_video()
   ↓
VideoProcessor.extract_frames(N)
   ↓
SearchService.search_videos()
   ↓
EmbeddingService (frames)
   ↓
EmbeddingService (thumbnails)
   ↓
SimilarityService.compute()
   ↓
Analyzer aggregates results
   ↓
Output displayed
```

# 10. 🔁 States and Transitions

## States

- Idle
- Downloading
- Processing Frames
- Searching
- Embedding
- Comparing
- Completed

### Transitions

Idle → Downloading → Processing → Searching → Embedding → Comparing → Completed

### Failure States

- Download Failed
- Embedding Failed

System should continue if possible.

# 11. 🛠️ Tools and Implementation Specifications

## 11.1 Programming Language

Python 3.x

## 11.2 Libraries / Packages

### Video Handling

- yt-dlp → download videos
- ffmpeg → frame extraction

### AI / Embeddings

- transformers → CLIP model
- torch → inference

### Image Processing

- Pillow
- opencv-python (optional)

### Networking

- requests → fetch thumbnails

### Math

- numpy → similarity computation

## 11.3 Model Used

- CLIP (openai/clip-vit-base-patch32)

## 11.4 System Requirements

- Python ≥ 3.8
- FFmpeg installed
- Internet connection