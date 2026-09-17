"""Моделийн файлуудыг тогтсон commit + SHA-256-аар татна.

Лиценз (арилжаанд ашиглах боломжтой):
- YuNet (нүүр илрүүлэх): MIT — https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- SFace (нүүр таних): Apache 2.0 — https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface

Ажиллуулах: `uv run python -m app.models`
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path

OPENCV_ZOO_COMMIT = "47534e27c9851bb1128ccc0102f1145e27f23f98"
_ZOO = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{OPENCV_ZOO_COMMIT}/models"


@dataclass(frozen=True)
class ModelFile:
    name: str
    url: str
    sha256: str


YUNET = ModelFile(
    "face_detection_yunet_2023mar.onnx",
    f"{_ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
)
SFACE = ModelFile(
    "face_recognition_sface_2021dec.onnx",
    f"{_ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
)
ALL_MODELS = (YUNET, SFACE)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_models(models_dir: Path) -> None:
    models_dir.mkdir(parents=True, exist_ok=True)
    for model in ALL_MODELS:
        target = models_dir / model.name
        if target.exists() and sha256_file(target) == model.sha256:
            continue
        print(f"downloading {model.name}", file=sys.stderr)
        tmp = target.with_suffix(".part")
        urllib.request.urlretrieve(model.url, tmp)
        actual = sha256_file(tmp)
        if actual != model.sha256:
            tmp.unlink()
            raise RuntimeError(f"{model.name}: sha256 mismatch ({actual})")
        tmp.replace(target)


if __name__ == "__main__":
    from app.config import settings

    ensure_models(Path(settings.models_dir))
    print("models ready", file=sys.stderr)
