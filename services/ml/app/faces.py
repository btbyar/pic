"""Нүүр илрүүлэх + embedding.

`FaceEngine` interface-ийн ард модель солигдож болно (AWS Rekognition, InsightFace-ийн лицензтэй хувилбар).
`model_version` нь DB-д embedding бүртэй хадгалагдана: өөр хувилбарын векторуудыг хооронд нь харьцуулахгүй.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from app.models import SFACE, YUNET

# OpenCV 5-ын "Targets are not supported by the new graph engine" анхааруулгыг нууна
cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)


@dataclass(frozen=True)
class Face:
    # Эх зургийн координатаар: x, y, өргөн, өндөр
    bbox: tuple[float, float, float, float]
    # 5 цэг: баруун нүд, зүүн нүд, хамар, амны баруун, зүүн булан
    landmarks: tuple[tuple[float, float], ...]
    det_score: float
    # bbox-ийн богино тал (px) — `face.minSizePx` тохиргоогоор хайлтаас хасна
    size_px: int
    # 0..1 хурц байдлын ойролцоо үнэлгээ (бүдэг/хөдөлгөөнтэй нүүр бага)
    quality: float
    # L2-normalized
    embedding: np.ndarray


class FaceEngine(Protocol):
    model_version: str
    embedding_dim: int

    def analyze(self, image: np.ndarray) -> list[Face]: ...


class YuNetSFaceEngine:
    model_version = "yunet-2023mar+sface-2021dec"
    embedding_dim = 128

    def __init__(
        self,
        models_dir: Path,
        max_side: int = 2560,
        score_threshold: float = 0.6,
        nms_threshold: float = 0.3,
        top_k: int = 5000,
    ) -> None:
        self._max_side = max_side
        self._detector = cv2.FaceDetectorYN.create(
            str(models_dir / YUNET.name), "", (320, 320), score_threshold, nms_threshold, top_k
        )
        self._recognizer = cv2.FaceRecognizerSF.create(str(models_dir / SFACE.name), "")
        # OpenCV-ийн detector/recognizer thread-safe биш; зэрэг ажиллуулахыг uvicorn worker-ийн тоогоор хийнэ
        self._lock = threading.Lock()

    def analyze(self, image: np.ndarray) -> list[Face]:
        h, w = image.shape[:2]
        scale = min(1.0, self._max_side / max(h, w))
        det_input = image if scale == 1.0 else cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        dh, dw = det_input.shape[:2]

        with self._lock:
            self._detector.setInputSize((dw, dh))
            _, detections = self._detector.detect(det_input)
            if detections is None:
                return []

            faces: list[Face] = []
            for row in detections:
                # Эх зургийн координат руу буцааж, эх зургаас align хийнэ — жижиг нүүрэнд илүү нарийвчлалтай
                orig = row.copy()
                orig[:14] /= scale
                aligned = self._recognizer.alignCrop(image, orig)
                feature = self._recognizer.feature(aligned).reshape(-1).astype(np.float32)
                norm = float(np.linalg.norm(feature))
                if norm == 0:
                    continue
                x, y, bw, bh = (float(v) for v in orig[:4])
                faces.append(
                    Face(
                        bbox=(x, y, bw, bh),
                        landmarks=tuple((float(orig[4 + 2 * i]), float(orig[5 + 2 * i])) for i in range(5)),
                        det_score=float(row[14]),
                        size_px=round(min(bw, bh)),
                        quality=_sharpness(aligned),
                        embedding=feature / norm,
                    )
                )
        return faces


def _sharpness(aligned: np.ndarray) -> float:
    """112×112 align хийсэн нүүрний Laplacian variance-ийг 0..1 болгоно (≈300-аас дээш бол хурц)."""
    gray = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)
    variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return round(min(1.0, variance / 300.0), 4)
