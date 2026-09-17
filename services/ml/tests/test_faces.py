from __future__ import annotations

import numpy as np

from app.faces import YuNetSFaceEngine
from tests.conftest import load

PEOPLE = ("obama", "biden", "harris")
# ARCHITECTURE.md: хайлтын босго. Бодит хэмжилт benchmark/RESULTS.md-д.
SAME_PERSON_MIN = 0.5
DIFFERENT_PERSON_MAX = 0.35


def reference(engine: YuNetSFaceEngine, name: str) -> np.ndarray:
    faces = engine.analyze(load(f"{name}.jpg"))
    assert len(faces) == 1
    return faces[0].embedding


def test_portrait_yields_one_normalized_128d_embedding(face_engine: YuNetSFaceEngine) -> None:
    faces = face_engine.analyze(load("obama.jpg"))
    assert len(faces) == 1
    face = faces[0]
    assert face.embedding.shape == (128,)
    assert abs(float(np.linalg.norm(face.embedding)) - 1.0) < 1e-5
    assert face.det_score > 0.8
    assert face.size_px > 150
    assert len(face.landmarks) == 5


def test_finds_every_person_in_group_photos_and_matches_identity(face_engine: YuNetSFaceEngine) -> None:
    refs = {name: reference(face_engine, name) for name in PEOPLE}
    for group in ("group-P20220405CS-0323.jpg", "group-P20220405AS-0959.jpg", "group-P20220405AS-1525.jpg"):
        faces = face_engine.analyze(load(group))
        matched: set[str] = set()
        for face in faces:
            sims = {name: float(face.embedding @ ref) for name, ref in refs.items()}
            best = max(sims, key=lambda n: sims[n])
            if sims[best] < SAME_PERSON_MIN:
                continue  # арын хүмүүс
            matched.add(best)
            # Өөр хүмүүстэй төсөө бага байх ёстой
            for other, sim in sims.items():
                if other != best:
                    assert sim < DIFFERENT_PERSON_MAX, (group, best, other, sim)
        assert matched == set(PEOPLE), (group, matched)


def test_coordinates_are_in_original_image_space_when_downscaled(models_dir) -> None:
    image = load("group-P20220405CS-0323.jpg")
    full = YuNetSFaceEngine(models_dir, max_side=4000).analyze(image)
    small = YuNetSFaceEngine(models_dir, max_side=960).analyze(image)
    # Бүтэн нягтралаар олдсон итгэлтэй нүүр бүр жижигрүүлсэн илрүүлэлтэд ч эх зургийн координатаар
    # ойролцоо байрлалд олдоно (жижигрүүлэхэд худал илрүүлэлт нэмэгдэж болох тул эсрэг чиглэлд шалгахгүй)
    for face in (f for f in full if f.det_score > 0.85):
        nearest = min(small, key=lambda s: abs(s.bbox[0] - face.bbox[0]) + abs(s.bbox[1] - face.bbox[1]))
        assert abs(nearest.bbox[0] - face.bbox[0]) < 10
        assert abs(nearest.bbox[1] - face.bbox[1]) < 10
        assert abs(nearest.size_px - face.size_px) <= max(8, face.size_px * 0.15)


def test_no_faces_in_blank_image(face_engine: YuNetSFaceEngine) -> None:
    assert face_engine.analyze(np.full((600, 800, 3), 128, np.uint8)) == []
