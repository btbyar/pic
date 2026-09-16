from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="pic-ml", version="0.0.0")


@app.get("/health")
def health() -> dict[str, object]:
    # Phase 3-т модель ачаалсан эсэхийг энд тусгана.
    return {
        "status": "ok",
        "faceModelVersion": settings.face_model_version,
        "modelsLoaded": False,
    }
