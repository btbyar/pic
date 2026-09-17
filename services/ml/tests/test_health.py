from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from tests.conftest import FIXTURES

TOKEN = "test-token-" + "x" * 32


@pytest.fixture(scope="module")
def client(models_dir) -> Iterator[TestClient]:
    original = settings.service_token
    settings.service_token = TOKEN
    with TestClient(app) as c:  # lifespan → модель ачаална
        yield c
    settings.service_token = original


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def upload(name: str) -> dict[str, tuple[str, bytes, str]]:
    return {"image": (name, (FIXTURES / name).read_bytes(), "image/jpeg")}


def test_health_reports_loaded_models(client: TestClient) -> None:
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["modelsLoaded"] is True
    assert body["faceModelVersion"] == "yunet-2023mar+sface-2021dec"
    assert body["embeddingDim"] == 128


def test_faces_requires_service_token(client: TestClient) -> None:
    assert client.post("/v1/faces", files=upload("obama.jpg")).status_code == 401
    wrong = {"Authorization": "Bearer wrong"}
    assert client.post("/v1/faces", files=upload("obama.jpg"), headers=wrong).status_code == 401


def test_faces_returns_embeddings(client: TestClient) -> None:
    res = client.post("/v1/faces", files=upload("group-P20220405CS-0323.jpg"), headers=auth())
    assert res.status_code == 200
    body = res.json()
    assert (body["width"], body["height"]) == (1920, 1280)
    assert body["modelVersion"] == "yunet-2023mar+sface-2021dec"
    assert len(body["faces"]) >= 3
    face = body["faces"][0]
    assert len(face["embedding"]) == 128
    assert len(face["bbox"]) == 4 and len(face["landmarks"]) == 5


def test_faces_rejects_non_images(client: TestClient) -> None:
    files = {"image": ("x.jpg", b"not an image", "image/jpeg")}
    assert client.post("/v1/faces", files=files, headers=auth()).status_code == 422
