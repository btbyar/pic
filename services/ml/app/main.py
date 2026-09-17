from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.faces import FaceEngine, YuNetSFaceEngine
from app.models import ensure_models

log = logging.getLogger("pic-ml")


class Engines:
    face: FaceEngine | None = None
    error: str | None = None


engines = Engines()


def load_engines() -> None:
    try:
        models_dir = Path(settings.models_dir)
        ensure_models(models_dir)
        engines.face = YuNetSFaceEngine(
            models_dir,
            max_side=settings.face_det_max_side,
            score_threshold=settings.face_det_score_threshold,
            nms_threshold=settings.face_det_nms_threshold,
            top_k=settings.face_det_top_k,
        )
        engines.error = None
    except Exception as exc:  # health-д харуулж, сервис унахгүй
        engines.error = str(exc)
        log.exception("failed to load models")


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_engines()
    yield


app = FastAPI(title="pic-ml", version="0.1.0", lifespan=lifespan)


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not settings.service_token:
        return
    expected = f"Bearer {settings.service_token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok" if engines.face else "degraded",
        "modelsLoaded": engines.face is not None,
        "faceModelVersion": engines.face.model_version if engines.face else None,
        "embeddingDim": engines.face.embedding_dim if engines.face else None,
        "error": engines.error,
    }


class FaceOut(BaseModel):
    bbox: list[float]
    landmarks: list[list[float]]
    detScore: float
    sizePx: int
    quality: float
    embedding: list[float]


class FacesOut(BaseModel):
    width: int
    height: int
    modelVersion: str
    faces: list[FaceOut]


@app.post("/v1/faces", dependencies=[Depends(require_token)])
def faces(image: Annotated[UploadFile, File()]) -> FacesOut:
    """Зураг дээрх бүх нүүрийг илрүүлж embedding буцаана.

    Эвэнтийн зураг болон хайлтын селфи хоёуланд ашиглана. Зураг, embedding-ийг энд хадгалахгүй —
    хариу буцаасны дараа санах ойгоос чөлөөлөгдөнө.
    """
    if engines.face is None:
        raise HTTPException(status_code=503, detail="models_not_loaded")

    data = image.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="image_too_large")
    decoded = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(status_code=422, detail="unreadable_image")

    found = engines.face.analyze(decoded)
    h, w = decoded.shape[:2]
    return FacesOut(
        width=w,
        height=h,
        modelVersion=engines.face.model_version,
        faces=[
            FaceOut(
                bbox=[round(v, 1) for v in f.bbox],
                landmarks=[[round(x, 1), round(y, 1)] for x, y in f.landmarks],
                detScore=round(f.det_score, 4),
                sizePx=f.size_px,
                quality=f.quality,
                embedding=[round(float(v), 6) for v in f.embedding],
            )
            for f in found
        ],
    )
