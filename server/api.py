import sys
import os
import datetime
import time
import uuid
import json
import subprocess
import tempfile
import shutil
import threading
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File, Depends, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from psycopg2 import pool
from psycopg2.extras import RealDictCursor, Json
import google.generativeai as genai
from dotenv import load_dotenv
import jwt as pyjwt
from passlib.context import CryptContext
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

from src.analyzer import Analyzer
from src.video_processor import VideoProcessor
from src.search_service import SearchService
from src.similarity_service import SimilarityService
from src.vectorise import vectorise, VectorEmbedding

app = FastAPI()


# Read allowed CORS origin from environment variable
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing env variable: {name}")
    return value


DB_HOST = get_env("DB_HOST")
DB_PORT = int(get_env("DB_PORT"))
DB_NAME = get_env("DB_NAME")
DB_USER = get_env("DB_USER")
DB_PASS = get_env("DB_PASS")
JWT_SECRET = get_env("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

_db_pool: Optional[pool.SimpleConnectionPool] = None
_scheduler: Optional[BackgroundScheduler] = None


# ─── Database ────────────────────────────────────────────────────────────────

def get_db_pool() -> pool.SimpleConnectionPool:
    global _db_pool
    if _db_pool is None:
        _db_pool = pool.SimpleConnectionPool(
            1,
            10,
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            connect_timeout=5,
        )
        # Ensure schema migrations (safe re-runs) using a connection from the pool
        conn = _db_pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID")
                cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_scan_job_id UUID")
                cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS url TEXT")
                cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ")
                cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'idle'")
            conn.commit()
        finally:
            _db_pool.putconn(conn)
    return _db_pool


@contextmanager
def db_cursor():
    conn = get_db_pool().getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        get_db_pool().putconn(conn)


def init_db() -> None:
    with db_cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id UUID PRIMARY KEY,
                status TEXT NOT NULL,
                progress JSONB,
                results JSONB,
                report JSONB,
                error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                hashed_password TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS assets (
                id UUID PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                monitoring_frequency TEXT,
                last_checked TIMESTAMPTZ,
                status TEXT NOT NULL DEFAULT 'idle'
            )
            """
        )
        # Additive migrations — safe to re-run
        cursor.execute(
            "ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE"
        )
        cursor.execute(
            "ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_scan_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL"
        )


# ─── Serializers ─────────────────────────────────────────────────────────────

def parse_iso_datetime(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    cleaned = value.replace("Z", "+00:00")
    return datetime.datetime.fromisoformat(cleaned)


def parse_uuid(value: str) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        return None


def serialize_job(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "progress": row.get("progress") or {},
        "results": row.get("results"),
        "report": row.get("report"),
        "error": row.get("error"),
    }


_HOURS_TO_FREQ = {1: "1h", 2: "2h", 6: "6h", 24: "24h"}


def serialize_asset(row: Dict[str, Any]) -> Dict[str, Any]:
    freq_raw = row.get("monitoring_frequency")
    if isinstance(freq_raw, int):
        freq = _HOURS_TO_FREQ.get(freq_raw, str(freq_raw) + "h")
    elif isinstance(freq_raw, str) and freq_raw.isdigit():
        freq = _HOURS_TO_FREQ.get(int(freq_raw), freq_raw + "h")
    else:
        freq = freq_raw  # already "1h" / None

    last_checked = row.get("last_checked")
    added_at = row.get("created_at") or row.get("added_at")

    return {
        "id": str(row["id"]),
        "url": row.get("url") or row.get("source_url") or "",
        "title": row["title"],
        "addedAt": added_at.isoformat() if added_at else None,
        "monitoringFrequency": freq,
        "lastChecked": last_checked.isoformat() if last_checked else None,
        "status": row.get("status") or row.get("fingerprint_status") or "idle",
        "lastScanJobId": str(row["last_scan_job_id"]) if row.get("last_scan_job_id") else None,
    }


def serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "displayName": row["display_name"],
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ─── Job DB helpers ──────────────────────────────────────────────────────────

def create_job(job_id: str, status: str, progress: Dict[str, Any]) -> Dict[str, Any]:
    with db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO jobs (id, status, progress)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (job_id, status, Json(progress)),
        )
        return serialize_job(cursor.fetchone())


def update_job(
    job_id: str,
    status: Optional[str] = None,
    progress: Optional[Dict[str, Any]] = None,
    results: Optional[Dict[str, Any]] = None,
    report: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    fields: List[str] = []
    values: List[Any] = []

    if status is not None:
        fields.append("status = %s")
        values.append(status)
    if progress is not None:
        fields.append("progress = %s")
        values.append(Json(progress))
    if results is not None:
        fields.append("results = %s")
        values.append(Json(results))
    if report is not None:
        fields.append("report = %s")
        values.append(Json(report))
    if error is not None:
        fields.append("error = %s")
        values.append(error)

    if not fields:
        return get_job(job_id)

    fields.append("updated_at = NOW()")
    values.append(job_id)

    with db_cursor() as cursor:
        cursor.execute(
            f"UPDATE jobs SET {', '.join(fields)} WHERE id = %s RETURNING *",
            values,
        )
        row = cursor.fetchone()
        return serialize_job(row) if row else None


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    parsed_id = parse_uuid(job_id)
    if not parsed_id:
        return None
    with db_cursor() as cursor:
        cursor.execute("SELECT * FROM jobs WHERE id = %s", (str(parsed_id),))
        row = cursor.fetchone()
        return serialize_job(row) if row else None


# ─── User DB helpers ──────────────────────────────────────────────────────────

def create_user_db(email: str, hashed_password: str, display_name: str) -> Dict[str, Any]:
    user_id = uuid.uuid4()
    with db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO users (id, email, hashed_password, display_name)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (str(user_id), email, hashed_password, display_name),
        )
        return serialize_user(cursor.fetchone())


def get_user_by_email_db(email: str) -> Optional[Dict[str, Any]]:
    with db_cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cursor.fetchone()
        if not row:
            return None
        return {**serialize_user(row), "hashed_password": row["hashed_password"]}


# ─── Asset DB helpers ─────────────────────────────────────────────────────────

def list_assets_db(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with db_cursor() as cursor:
        if user_id:
            cursor.execute(
                "SELECT * FROM assets WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
        else:
            cursor.execute("SELECT * FROM assets ORDER BY created_at DESC")
        rows = cursor.fetchall() or []
        return [serialize_asset(row) for row in rows]


def get_asset_db(asset_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    parsed_id = parse_uuid(asset_id)
    if not parsed_id:
        return None
    with db_cursor() as cursor:
        if user_id:
            cursor.execute(
                "SELECT * FROM assets WHERE id = %s AND user_id = %s",
                (str(parsed_id), user_id),
            )
        else:
            cursor.execute("SELECT * FROM assets WHERE id = %s", (str(parsed_id),))
        row = cursor.fetchone()
        return serialize_asset(row) if row else None


def create_asset_db(url: str, title: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    asset_id = str(uuid.uuid4())
    org_id = os.getenv("DEFAULT_ORG_ID", "org-default")
    with db_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO assets
                (id, url, source_url, title, org_id, platform, fingerprint_status, embedding_dim, created_at, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            RETURNING *
            """,
            (asset_id, url, url, title, org_id, "youtube", "pending", 3072, user_id),
        )
        return serialize_asset(cursor.fetchone())


def update_asset_db(
    asset_id: str,
    updates: Dict[str, Any],
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    fields: List[str] = []
    values: List[Any] = []

    if "monitoringFrequency" in updates:
        fields.append("monitoring_frequency = %s")
        freq_val = updates["monitoringFrequency"]
        # DB column is integer (hours); frontend sends "1h"/"2h" etc.
        if isinstance(freq_val, str) and freq_val.endswith("h") and freq_val[:-1].isdigit():
            freq_val = int(freq_val[:-1])
        values.append(freq_val)
    if "lastChecked" in updates:
        fields.append("last_checked = %s")
        values.append(updates["lastChecked"])
    if "status" in updates:
        fields.append("status = %s")
        values.append(updates["status"])
    if "lastScanJobId" in updates:
        fields.append("last_scan_job_id = %s")
        values.append(updates["lastScanJobId"])

    if not fields:
        return get_asset_db(asset_id, user_id)

    parsed_id = parse_uuid(asset_id)
    if not parsed_id:
        return None

    if user_id:
        values.extend([str(parsed_id), user_id])
        where = "WHERE id = %s AND user_id = %s"
    else:
        values.append(str(parsed_id))
        where = "WHERE id = %s"

    with db_cursor() as cursor:
        cursor.execute(
            f"UPDATE assets SET {', '.join(fields)} {where} RETURNING *",
            values,
        )
        row = cursor.fetchone()
        return serialize_asset(row) if row else None


def delete_asset_db(asset_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    parsed_id = parse_uuid(asset_id)
    if not parsed_id:
        return None
    with db_cursor() as cursor:
        if user_id:
            cursor.execute(
                "DELETE FROM assets WHERE id = %s AND user_id = %s RETURNING *",
                (str(parsed_id), user_id),
            )
        else:
            cursor.execute("DELETE FROM assets WHERE id = %s RETURNING *", (str(parsed_id),))
        row = cursor.fetchone()
        return serialize_asset(row) if row else None


# ─── Auth utilities ───────────────────────────────────────────────────────────

_pwd_ctx = None


def get_pwd_ctx():
    global _pwd_ctx
    if _pwd_ctx is None:
        _pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")
    return _pwd_ctx


def hash_password(plain: str) -> str:
    return get_pwd_ctx().hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return get_pwd_ctx().verify(plain, hashed)


def create_access_token(user_id: str, email: str, display_name: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "name": display_name,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(authorization: str = Header(...)) -> Dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ", 1)[1]
    return decode_token(token)


# ─── Scheduler ───────────────────────────────────────────────────────────────

FREQ_TO_HOURS: Dict[str, int] = {"1h": 1, "2h": 2, "6h": 6, "24h": 24}


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(daemon=True)
    return _scheduler


def run_scheduled_asset_scan(asset_id: str, asset_url: str) -> None:
    """Runs a full similarity scan for an asset. Called by APScheduler."""
    job_id = str(uuid.uuid4())
    create_job(job_id, "pending", {"stage": "queued", "percent": 0, "details": "Scheduled scan queued"})
    update_asset_db(asset_id, {"status": "checking"})
    try:
        req = AnalyzeRequest(url=asset_url)
        run_analysis_task(job_id, req)
        update_asset_db(asset_id, {
            "lastChecked": datetime.datetime.utcnow().isoformat(),
            "status": "active",
            "lastScanJobId": job_id,
        })
    except Exception as exc:
        print(f"[Scheduler] Scan failed for asset {asset_id}: {exc}")
        update_asset_db(asset_id, {"status": "active"})


def schedule_asset_job(asset_id: str, asset_url: str, frequency: str) -> None:
    scheduler = get_scheduler()
    job_key = f"asset_{asset_id}"
    hours = FREQ_TO_HOURS.get(frequency, 24)
    if scheduler.get_job(job_key):
        scheduler.remove_job(job_key)
    scheduler.add_job(
        run_scheduled_asset_scan,
        trigger="interval",
        hours=hours,
        id=job_key,
        args=[asset_id, asset_url],
        replace_existing=True,
        max_instances=1,
    )
    print(f"[Scheduler] Scheduled asset {asset_id} every {hours}h")


def unschedule_asset_job(asset_id: str) -> None:
    scheduler = get_scheduler()
    job_key = f"asset_{asset_id}"
    if scheduler.get_job(job_key):
        scheduler.remove_job(job_key)
        print(f"[Scheduler] Removed schedule for asset {asset_id}")


def reload_scheduled_jobs() -> None:
    """Re-register all active scheduled assets on server startup."""
    with db_cursor() as cursor:
        cursor.execute(
            "SELECT id, url, source_url, monitoring_frequency FROM assets WHERE monitoring_frequency IS NOT NULL"
        )
        rows = cursor.fetchall() or []
    for row in rows:
        asset_url = row.get("url") or row.get("source_url") or ""
        freq_raw = row["monitoring_frequency"]
        # Convert integer hours back to "Xh" key for FREQ_TO_HOURS lookup
        freq_str = _HOURS_TO_FREQ.get(int(freq_raw), "24h") if freq_raw else "24h"
        schedule_asset_job(str(row["id"]), asset_url, freq_str)
    print(f"[Scheduler] Reloaded {len(rows)} scheduled asset jobs")


# ─── App lifecycle ────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup() -> None:
    # init_db()
    get_scheduler().start()
    reload_scheduled_jobs()


@app.on_event("shutdown")
def shutdown() -> None:
    global _db_pool
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
    if _db_pool is not None:
        _db_pool.closeall()
        _db_pool = None


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    url: str
    frames: int = 3
    candidate_frames: int = 0
    threshold: float = 0.85


class AssetCreateRequest(BaseModel):
    url: str
    title: str | None = None


class AssetUpdateRequest(BaseModel):
    monitoringFrequency: str | None = None
    lastChecked: str | None = None
    status: str | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    displayName: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Analysis pipeline ───────────────────────────────────────────────────────

def run_analysis_task(job_id: str, req: AnalyzeRequest) -> None:
    update_job(
        job_id,
        status="active",
        progress={"stage": "extracting", "percent": 10, "details": "Extracting input video..."},
    )
    try:
        analyzer = Analyzer(
            n_frames=req.frames,
            m_frames=req.candidate_frames,
            threshold=req.threshold,
            max_candidates=10,
        )
        update_job(
            job_id,
            progress={"stage": "detecting", "percent": 50, "details": "Analyzing candidates..."},
        )

        raw_results = analyzer.run(req.url)

        high_risk = 0
        med_risk = 0
        low_risk = 0

        detections = []
        propagation_nodes = [
            {
                "id": "original",
                "title": raw_results["input_video"].get("title", "Unknown"),
                "views": 1000000,
                "risk": "original",
                "similarity": 1.0,
                "x": 50,
                "y": 50,
                "connections": [],
            }
        ]

        for c in raw_results.get("candidates", []):
            sim = c["max_similarity"]
            if sim >= 0.85:
                risk = "high"
                high_risk += 1
            elif sim >= 0.70:
                risk = "medium"
                med_risk += 1
            else:
                risk = "low"
                low_risk += 1

            det_id = str(uuid.uuid4())
            detections.append({
                "id": det_id,
                "title": c["title"],
                "channel": c.get("uploader", "Unknown Channel"),
                "thumbnailUrl": c["thumbnail_url"],
                "views": int(10000 * float(sim)),
                "similarity": float(sim),
                "risk": risk,
                "platform": "youtube",
                "uploadedAt": "2024-03-20T12:00:00Z",
                "duration": "10:00",
                "url": c["url"],
            })

            propagation_nodes.append({
                "id": det_id,
                "title": c["title"][:20] + "...",
                "views": int(10000 * float(sim)),
                "risk": risk,
                "similarity": float(sim),
                "x": 0,
                "y": 0,
                "connections": ["original"],
            })
            propagation_nodes[0]["connections"].append(det_id)

        mapped_results = {
            "job_id": job_id,
            "status": "completed",
            "input_video": {
                "title": raw_results["input_video"].get("title", "Unknown"),
                "thumbnailUrl": raw_results["input_video"].get("thumbnail_url", ""),
                "duration": "00:00",
                "resolution": "1080p",
                "uploadedAt": "2024-03-27T10:00:00Z",
                "platform": "youtube",
                "channel": raw_results["input_video"].get("uploader", "Unknown Channel"),
            },
            "fingerprint": {
                "id": f"FP-{uuid.uuid4().hex[:8].upper()}",
                "framesAnalyzed": raw_results["n_frames"],
                "model": "CLIP ViT-B/32",
                "createdAt": "2024-03-27T10:05:00Z",
            },
            "risk_summary": {
                "high": high_risk,
                "medium": med_risk,
                "low": low_risk,
            },
            "metrics": [
                {"label": "Total Reach Impact", "value": "2.4M", "change": "+12.4%", "positive": False},
                {"label": "Estimated Revenue Loss", "value": "$14,200", "change": "+8.1%", "positive": False},
                {"label": "Candidate Key", "value": f"{len(detections)}", "change": f"Frame matches: {len(detections)}", "positive": True},
            ],
            "detections": detections,
            "propagation_nodes": propagation_nodes,
        }

        update_job(
            job_id,
            status="completed",
            progress={"stage": "done", "percent": 100, "details": "Analysis complete"},
            results=mapped_results,
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        update_job(job_id, status="failed", error=str(e))


# ─── Auth endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    existing = get_user_by_email_db(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(req.password)
    user = create_user_db(req.email, hashed, req.displayName)
    token = create_access_token(user["id"], user["email"], user["displayName"])
    return {"token": token, "user": user}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = get_user_by_email_db(req.email)
    # Same error for missing user and wrong password to avoid enumeration
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"], user["email"], user["displayName"])
    return {"token": token, "user": {k: v for k, v in user.items() if k != "hashed_password"}}


@app.get("/api/auth/me")
def me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "id": current_user["sub"],
        "email": current_user["email"],
        "displayName": current_user["name"],
    }


# ─── Analysis endpoints ───────────────────────────────────────────────────────

@app.post("/api/analyze")
def start_analyze(req: AnalyzeRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    job_id = str(uuid.uuid4())
    create_job(job_id, "pending", {"stage": "queued", "percent": 0, "details": "Job queued"})
    t = threading.Thread(target=run_analysis_task, args=(job_id, req), daemon=True)
    t.start()
    return {"job_id": job_id, "status": "pending", "message": "Analysis started successfully"}


@app.get("/api/analyze/{job_id}")
def get_status(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job.get("progress", {}),
        "error": job.get("error"),
    }


@app.get("/api/results/{job_id}")
def get_results(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        return {"status": job["status"], "message": "Job not completed yet"}
    return job.get("results")


# ─── Report generation ────────────────────────────────────────────────────────

def build_report(job_id: str, results: Dict[str, Any]) -> Dict[str, Any]:
    detections = results.get("detections", [])
    input_video = results.get("input_video", {})
    risk_summary = results.get("risk_summary", {})

    total_detections = len(detections)
    high_risk = risk_summary.get("high", 0)
    medium_risk = risk_summary.get("medium", 0)
    low_risk = risk_summary.get("low", 0)
    avg_similarity = sum(d.get("similarity", 0) for d in detections) / max(total_detections, 1)

    api_key = os.environ.get("GEMINI_API_KEY")

    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("models/gemini-2.5-flash")
            prompt = f"""
            Analyze the following copyright detection results and provide professional insights and recommendations.

            Original Video:
            - Title: {input_video.get("title", "Unknown")}
            - Channel: {input_video.get("uploader", "Unknown")}

            Detection Summary:
            - Total matches: {total_detections}
            - High risk: {high_risk}
            - Medium risk: {medium_risk}
            - Low risk: {low_risk}
            - Average similarity: {avg_similarity:.1%}

            Top 5 detections:
            {[
                f"- {d.get('title', '')} by {d.get('channel', '')} (similarity: {d.get('similarity', 0):.1%})"
                for d in detections[:5]
            ]}

            Provide:
            1. 3-5 key insights about the infringement patterns and risks
            2. 3-5 actionable recommendations for the copyright holder

            Format STRICTLY as JSON:
            {{
                "insights": ["..."],
                "recommendations": ["..."]
            }}
            """
            response = model.generate_content(prompt)
            try:
                ai_content = json.loads(response.text.strip())
                insights = ai_content.get("insights", [])
                recommendations = ai_content.get("recommendations", [])
            except Exception:
                insights = [response.text]
                recommendations = []
        except Exception as e:
            print(f"Gemini API error: {e}")
            insights = ["AI insights unavailable due to API error"]
            recommendations = ["Contact support for AI-powered recommendations"]
    else:
        insights = ["GEMINI_API_KEY not configured"]
        recommendations = ["Configure Gemini API key for AI insights"]

    return {
        "job_id": job_id,
        "generated_at": datetime.datetime.utcnow().isoformat(),
        "original_video": {
            "title": input_video.get("title", "Unknown"),
            "channel": input_video.get("channel", "Unknown"),
            "url": input_video.get("url", ""),
        },
        "executive_summary": {
            "total_matches": total_detections,
            "high_risk": high_risk,
            "medium_risk": medium_risk,
            "low_risk": low_risk,
            "average_similarity": round(avg_similarity, 4),
            "risk_level": (
                "CRITICAL" if high_risk > 0
                else "HIGH" if medium_risk > 2
                else "MEDIUM" if medium_risk > 0
                else "LOW"
            ),
        },
        "ai_insights": insights,
        "recommendations": recommendations,
        "detections": [
            {
                "rank": i + 1,
                "title": d.get("title", ""),
                "channel": d.get("channel", ""),
                "similarity": d.get("similarity", 0),
                "risk": d.get("risk", "low"),
                "url": d.get("url", ""),
            }
            for i, d in enumerate(detections[:20])
        ],
    }


@app.post("/api/report/generate")
def generate_report(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    job = get_job(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not completed")
    results = job.get("results", {})
    report = build_report(job_id, results)
    update_job(job_id, report=report)
    return report


@app.get("/api/reports/{job_id}")
def get_report(job_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("report"):
        return job["report"]
    if job.get("status") != "completed":
        return {"status": job.get("status"), "message": "Job not completed yet"}
    results = job.get("results", {})
    report = build_report(job_id, results)
    update_job(job_id, report=report)
    return report


# ─── Pre-upload check ─────────────────────────────────────────────────────────

@app.post("/api/precheck")
async def precheck(
    file: UploadFile = File(...),
    title: str = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    allowed_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(allowed_extensions)}",
        )

    tmp_path: Optional[str] = None
    try:
        # Save uploaded file to a temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # Probe duration via ffprobe
        duration = 60.0
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", tmp_path],
                capture_output=True, text=True, timeout=15,
            )
            duration = float(result.stdout.strip()) if result.stdout.strip() else 60.0
        except Exception:
            pass

        # Determine search title
        search_title = title or ""
        if not search_title:
            try:
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format_tags=title",
                     "-of", "csv=p=0", tmp_path],
                    capture_output=True, text=True, timeout=15,
                )
                search_title = result.stdout.strip()
            except Exception:
                pass
        if not search_title:
            search_title = os.path.splitext(os.path.basename(file.filename or "video"))[0]

        # Extract frames from local file using VideoProcessor (FFmpeg accepts local paths)
        processor = VideoProcessor()
        timestamps = processor.calculate_frame_timestamps(duration, n_frames=3)
        from PIL import Image
        frames = []
        for ts in timestamps:
            try:
                frame = processor._grab_frame_at_timestamp(tmp_path, ts)
                if frame:
                    frames.append(frame)
            except Exception:
                pass

        if not frames:
            raise HTTPException(status_code=422, detail="Could not extract frames from video file")

        # Build embeddings for the local file's frames
        input_embedding = VectorEmbedding()
        for frame in frames:
            input_embedding.add(frame)
        frame_vectors = input_embedding.get_vectors()

        # Search YouTube candidates by title
        candidates = SearchService(max_results=10).search_videos(search_title)

        # Score candidates
        similarity_service = SimilarityService()
        high_risk = 0
        med_risk = 0
        low_risk = 0
        detections = []

        for c in candidates:
            try:
                candidate_vector = vectorise(c["url"], n_frames=0)
                candidate_vectors = candidate_vector.get_vectors()
                max_sim = similarity_service.compute_max_similarity(frame_vectors, candidate_vectors)
                sim = float(max_sim)

                if sim >= 0.85:
                    risk = "high"
                    high_risk += 1
                elif sim >= 0.70:
                    risk = "medium"
                    med_risk += 1
                else:
                    risk = "low"
                    low_risk += 1

                detections.append({
                    "id": str(uuid.uuid4()),
                    "title": c["title"],
                    "channel": c.get("uploader", "Unknown Channel"),
                    "thumbnailUrl": c.get("thumbnail_url", ""),
                    "similarity": round(sim, 4),
                    "risk": risk,
                    "platform": "youtube",
                    "url": c["url"],
                })
            except Exception:
                continue

        detections.sort(key=lambda x: x["similarity"], reverse=True)

        return {
            "status": "completed",
            "safe_to_upload": high_risk == 0,
            "searchTitle": search_title,
            "riskSummary": {"high": high_risk, "medium": med_risk, "low": low_risk},
            "detections": detections,
        }

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ─── Video info ───────────────────────────────────────────────────────────────

@app.get("/api/video-info")
def get_video_info(url: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        processor = VideoProcessor()
        info = processor.get_video_info(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "id": info.get("id", ""),
        "title": info.get("title", "Unknown"),
        "duration": info.get("duration", 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", "Unknown Channel"),
        "url": info.get("url", url),
    }


# ─── Asset endpoints ──────────────────────────────────────────────────────────

@app.get("/api/assets")
def list_assets(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"assets": list_assets_db(user_id=current_user["sub"])}


@app.get("/api/assets/{asset_id}")
def get_asset(asset_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    asset = get_asset_db(asset_id, user_id=current_user["sub"])
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@app.post("/api/assets")
def register_asset(req: AssetCreateRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    title = req.title
    if not title:
        try:
            processor = VideoProcessor()
            info = processor.get_video_info(req.url)
            title = info.get("title", "Untitled Video")
        except Exception:
            title = "Untitled Video"
    return create_asset_db(req.url, title, user_id=current_user["sub"])


@app.patch("/api/assets/{asset_id}")
def update_asset(
    asset_id: str,
    req: AssetUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    updates: Dict[str, Any] = {}
    if req.monitoringFrequency is not None:
        updates["monitoringFrequency"] = req.monitoringFrequency if req.monitoringFrequency else None
    if req.lastChecked is not None:
        try:
            updates["lastChecked"] = parse_iso_datetime(req.lastChecked)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid lastChecked format") from exc
    if req.status is not None:
        updates["status"] = req.status

    asset = update_asset_db(asset_id, updates, user_id=current_user["sub"])
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Sync APScheduler when frequency changes
    if req.monitoringFrequency is not None:
        if req.monitoringFrequency:
            schedule_asset_job(asset_id, asset["url"], req.monitoringFrequency)
        else:
            unschedule_asset_job(asset_id)

    return asset


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    unschedule_asset_job(asset_id)
    removed = delete_asset_db(asset_id, user_id=current_user["sub"])
    if not removed:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"deleted": True, "asset": removed}


@app.post("/api/assets/{asset_id}/scan")
def trigger_asset_scan(
    asset_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    asset = get_asset_db(asset_id, user_id=current_user["sub"])
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    job_id = str(uuid.uuid4())
    create_job(job_id, "pending", {"stage": "queued", "percent": 0, "details": "On-demand scan queued"})
    req = AnalyzeRequest(url=asset["url"])

    def run_and_update():
        update_asset_db(asset_id, {"status": "checking"})
        try:
            run_analysis_task(job_id, req)
            update_asset_db(asset_id, {
                "lastChecked": datetime.datetime.utcnow().isoformat(),
                "status": "active",
                "lastScanJobId": job_id,
            })
        except Exception as exc:
            print(f"[Scan] On-demand scan failed for asset {asset_id}: {exc}")
            update_asset_db(asset_id, {"status": "active"})

    t = threading.Thread(target=run_and_update, daemon=True)
    t.start()
    return {"job_id": job_id, "status": "pending", "message": "Scan started"}


@app.get("/api/assets/{asset_id}/results")
def get_asset_results(
    asset_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    asset = get_asset_db(asset_id, user_id=current_user["sub"])
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    last_job_id = asset.get("lastScanJobId")
    if not last_job_id:
        return {"status": "no_scan", "message": "No scan has been run for this asset yet"}

    job = get_job(last_job_id)
    if not job:
        return {"status": "no_scan", "message": "Scan job not found"}
    if job["status"] != "completed":
        return {"status": job["status"], "message": "Scan not completed yet"}

    results = job.get("results") or {}
    risk_summary = results.get("risk_summary", {"high": 0, "medium": 0, "low": 0})
    return {
        "status": "completed",
        "jobId": last_job_id,
        "riskSummary": risk_summary,
        "detectionCount": len(results.get("detections", [])),
    }


# ─── Debug ────────────────────────────────────────────────────────────────────

@app.get("/api/debug/threads")
def debug_threads():
    import traceback
    stacks = []
    for thread_id, frame in sys._current_frames().items():
        stacks.append(f"Thread ID: {thread_id}")
        stacks.append("".join(traceback.format_stack(frame)))
        stacks.append("-" * 40)
    return {"threads": "\n".join(stacks)}
