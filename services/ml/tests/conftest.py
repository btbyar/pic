from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from app.config import settings
from app.faces import YuNetSFaceEngine
from app.models import ensure_models

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def models_dir() -> Path:
    path = Path(settings.models_dir)
    # Эхний удаа ~39MB татна (hash шалгана), дараа нь кэшээс
    ensure_models(path)
    return path


@pytest.fixture(scope="session")
def face_engine(models_dir: Path) -> YuNetSFaceEngine:
    return YuNetSFaceEngine(models_dir)


def load(name: str) -> np.ndarray:
    image = cv2.imread(str(FIXTURES / name))
    assert image is not None, name
    return image
