"""Services package exports."""

from hawkeye.services.detection import DetectionEngine
from hawkeye.services.ingestion_service import IngestionService

__all__ = ["IngestionService", "DetectionEngine"]
