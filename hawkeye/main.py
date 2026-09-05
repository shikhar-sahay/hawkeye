"""Hawkeye main FastAPI application."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hawkeye.api.v1 import api_router
from hawkeye.api.websocket import connection_manager
from hawkeye.api.websocket import router as ws_router
from hawkeye.config import settings
from hawkeye.database import db

# Serverless (Vercel) toggles. Local uvicorn leaves both unset and behaves
# exactly as before.
_SKIP_CREATE_ALL = os.environ.get("HAWKEYE_SKIP_CREATE_ALL") == "1"
_DISABLE_HEARTBEAT = os.environ.get("HAWKEYE_DISABLE_HEARTBEAT") == "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    if not _SKIP_CREATE_ALL:
        await db.create_all()
    if not _DISABLE_HEARTBEAT:
        await connection_manager.start()
    yield
    # Shutdown
    if not _DISABLE_HEARTBEAT:
        await connection_manager.stop()
    await db.close()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered Web Application Security Monitoring Platform",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")
app.include_router(ws_router)


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.app_name, "version": settings.app_version}


@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "hawkeye.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
