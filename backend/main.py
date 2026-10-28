"""CYRUS API — workflow orchestration starter.

The default adapters are deterministic and safe for local development. Connect a
model/provider adapter before describing generated artifacts as production output.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, JSON, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

APP_VERSION = "0.1.0"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cyrus.db")
CONNECT_ARGS = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=CONNECT_ARGS, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    goal: Mapped[str] = mapped_column(String(1200), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="queued", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    stages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(40), default="deterministic-preview", nullable=False)


AGENTS = [
    {"id": "planner", "name": "Atlas", "role": "Planning agent", "mission": "Turn an outcome into milestones, constraints, and acceptance criteria.", "stage": "plan", "capabilities": ["task decomposition", "acceptance criteria", "dependency mapping"]},
    {"id": "researcher", "name": "Scout", "role": "Research agent", "mission": "Collect relevant context, reference material, and implementation risks.", "stage": "research", "capabilities": ["source review", "technical research", "risk inventory"]},
    {"id": "architect", "name": "Forma", "role": "Architecture agent", "mission": "Define service boundaries, data contracts, and implementation choices.", "stage": "architect", "capabilities": ["API design", "data modelling", "technical decisions"]},
    {"id": "coder", "name": "Forge", "role": "Coding agent", "mission": "Implement approved tasks through a configurable coding-provider adapter.", "stage": "code", "capabilities": ["implementation plans", "patch generation adapter", "refactoring"]},
    {"id": "tester", "name": "Sentinel", "role": "QA agent", "mission": "Map acceptance criteria to test cases and quality checks.", "stage": "test", "capabilities": ["test planning", "regression checks", "edge cases"]},
    {"id": "reviewer", "name": "Lens", "role": "Review agent", "mission": "Review correctness, maintainability, security, and operational risks.", "stage": "review", "capabilities": ["code review", "security checklist", "quality gates"]},
    {"id": "release", "name": "Orbit", "role": "Release agent", "mission": "Prepare release artifacts and require explicit approval before shipping.", "stage": "release", "capabilities": ["release notes", "deployment checklist", "rollback planning"]},
]
STAGE_DEFINITIONS = [
    ("plan", "Atlas", "Plan the outcome and acceptance criteria."),
    ("research", "Scout", "Identify relevant context and implementation risks."),
    ("architect", "Forma", "Outline the technical design and service contracts."),
    ("code", "Forge", "Prepare an implementation hand-off for the configured coding adapter."),
    ("test", "Sentinel", "Build a verification checklist for the proposed change."),
    ("review", "Lens", "Prepare a human-readable review and risk summary."),
    ("release", "Orbit", "Prepare a release checklist; do not deploy automatically."),
]


class RunCreate(BaseModel):
    goal: str = Field(min_length=8, max_length=1200, description="Desired engineering outcome")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_run(item: WorkflowRun) -> dict[str, Any]:
    created = item.created_at
    updated = item.updated_at
    return {
        "id": item.id,
        "goal": item.goal,
        "status": item.status,
        "progress": item.progress,
        "created_at": created.isoformat() if created else None,
        "updated_at": updated.isoformat() if updated else None,
        "stages": item.stages or [],
        "events": item.events or [],
        "execution_mode": item.execution_mode,
        "agent_count": len(AGENTS),
    }


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="CYRUS Engineering API",
    description="A review-first multi-agent software engineering workspace API.",
    version=APP_VERSION,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_schema()


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "CYRUS Engineering API", "version": APP_VERSION, "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    database_ok = False
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        database_ok = True
    except Exception:
        database_ok = False
    return {
        "status": "ok" if database_ok else "degraded",
        "service": "cyrus-api",
        "version": APP_VERSION,
        "database": "reachable" if database_ok else "unreachable",
        "timestamp": utcnow().isoformat(),
        "mode": "deterministic-preview",
    }


@app.get("/api/agents")
def list_agents() -> dict[str, Any]:
    return {"items": AGENTS, "total": len(AGENTS), "mode": "deterministic-preview"}


@app.get("/api/runs")
def list_runs(
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    statement = select(WorkflowRun).order_by(WorkflowRun.created_at.desc()).limit(limit)
    items = db.scalars(statement).all()
    return {"items": [as_run(item) for item in items], "total": len(items)}


def append_event(run: WorkflowRun, stage: str, agent: str, message: str, status: str) -> None:
    run.events = list(run.events or []) + [{
        "at": utcnow().isoformat(),
        "stage": stage,
        "agent": agent,
        "message": message,
        "status": status,
    }]
    run.updated_at = utcnow()


def execute_preview(run_id: str) -> None:
    """Advance a run through deterministic stage previews without calling an LLM."""
    with SessionLocal() as db:
        run = db.get(WorkflowRun, run_id)
        if run is None:
            return
        run.status = "running"
        append_event(run, "workflow", "CYRUS", "Workflow accepted; deterministic preview mode is active.", "started")
        db.commit()

    total = len(STAGE_DEFINITIONS)
    for index, (stage_id, agent_name, summary) in enumerate(STAGE_DEFINITIONS, start=1):
        time.sleep(0.25)
        with SessionLocal() as db:
            run = db.get(WorkflowRun, run_id)
            if run is None:
                return
            run.status = "running"
            run.progress = int(index / total * 100)
            run.stages = list(run.stages or []) + [{
                "id": stage_id,
                "agent": agent_name,
                "status": "preview_ready",
                "summary": summary,
                "artifact": "Preview only — connect a model/tool adapter for real agent output.",
            }]
            append_event(run, stage_id, agent_name, summary, "preview_ready")
            if stage_id == "review":
                append_event(run, stage_id, "Human review", "Review gate remains open; inspect artifacts before release.", "approval_required")
            if stage_id == "release":
                run.status = "review"
                append_event(run, stage_id, agent_name, "Release checklist prepared. No deployment was triggered.", "approval_required")
            run.updated_at = utcnow()
            db.commit()


@app.post("/api/runs", status_code=202)
def create_run(payload: RunCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict[str, Any]:
    goal = payload.goal.strip()
    if len(goal) < 8:
        raise HTTPException(status_code=422, detail="Describe the engineering outcome in at least 8 characters.")
    run = WorkflowRun(
        id="RUN-" + uuid4().hex[:10].upper(),
        goal=goal,
        status="queued",
        progress=0,
        stages=[],
        events=[],
        execution_mode="deterministic-preview",
    )
    append_event(run, "workflow", "CYRUS", "Run queued for the seven-stage workflow.", "queued")
    db.add(run)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(execute_preview, run.id)
    return {"item": as_run(run), "notice": "Accepted in deterministic preview mode."}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = db.get(WorkflowRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Workflow run not found.")
    return {"item": as_run(run)}


@app.get("/api/ready")
def ready() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        return {"status": "ready"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready.") from exc
