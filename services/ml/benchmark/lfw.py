"""LFW (Labeled Faces in the Wild) дээр YuNet + SFace-ийн нарийвчлалыг хэмжинэ.

Ажиллуулах:  cd services/ml && uv run python -m benchmark.lfw
Үр дүн:      benchmark/RESULTS.md (git-д орно), өгөгдөл benchmark/data/ (git-д орохгүй, ~180MB)

LFW нь судалгааны өгөгдөл — зөвхөн дотоод хэмжилтэд, түгээхгүй, бүтээгдэхүүнд ашиглахгүй.

Гурван хэмжилт:
1. Verification — LFW-ийн стандарт 6000 хос (ижил/өөр хүн), босго тус бүрт зөв/буруу таарал.
2. Эвэнтийн хайлтын симуляци — 2+ зурагтай хүн бүрийн нэг зургийг "селфи" болгож, бусад ~13k зургаас
   хайна. Recall = тухайн хүний зургуудаас олдсон хувь; буруу олдсон = өөр хүний зураг босго давсан тоо.
3. Жижиг нүүр — зургийг жижигрүүлж том дэвсгэр дээр тавиад (хол зогссон гүйгч) илрүүлэлт ба таних чадвар.
"""

from __future__ import annotations

import sys
import tarfile
import time
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.faces import YuNetSFaceEngine
from app.models import ensure_models

ROOT = Path(__file__).parent
DATA = ROOT / "data"
LFW_URL = "https://ndownloader.figshare.com/files/5976018"  # lfw.tgz (scikit-learn-ийн ашигладаг mirror)
PAIRS_URL = "https://ndownloader.figshare.com/files/5976006"  # pairs.txt
THRESHOLDS = [round(t, 2) for t in np.arange(0.20, 0.65, 0.05)]
SMALL_FACE_SIZES = [16, 24, 32, 48, 64]


@dataclass
class Embedded:
    person: str
    path: Path
    embedding: np.ndarray | None  # нүүр олдоогүй бол None


def download() -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    lfw_dir = DATA / "lfw"
    if not lfw_dir.exists():
        archive = DATA / "lfw.tgz"
        if not archive.exists():
            print("downloading LFW (~180MB)…")
            urllib.request.urlretrieve(LFW_URL, archive)
        with tarfile.open(archive) as tar:
            tar.extractall(DATA, filter="data")
    if not (DATA / "pairs.txt").exists():
        urllib.request.urlretrieve(PAIRS_URL, DATA / "pairs.txt")
    return lfw_dir


def central_face(engine: YuNetSFaceEngine, image: np.ndarray):
    """LFW зураг бүрт гол хүн төвд байдаг; арын хүмүүсийг хасна."""
    faces = engine.analyze(image)
    if not faces:
        return None
    h, w = image.shape[:2]
    return min(faces, key=lambda f: (f.bbox[0] + f.bbox[2] / 2 - w / 2) ** 2 + (f.bbox[1] + f.bbox[3] / 2 - h / 2) ** 2)


def embed_all(engine: YuNetSFaceEngine, lfw_dir: Path) -> tuple[list[Embedded], float]:
    items: list[Embedded] = []
    start = time.perf_counter()
    paths = sorted(lfw_dir.glob("*/*.jpg"))
    for i, path in enumerate(paths):
        face = central_face(engine, cv2.imread(str(path)))
        items.append(Embedded(path.parent.name, path, face.embedding if face else None))
        if i % 2000 == 0:
            print(f"  {i}/{len(paths)}")
    return items, (time.perf_counter() - start) / len(paths)


def verification(items: list[Embedded]) -> tuple[list[tuple[float, float, float]], float, float, int]:
    by_path = {(e.person, int(e.path.stem.rsplit("_", 1)[1])): e.embedding for e in items}
    same: list[float] = []
    diff: list[float] = []
    missing = 0
    lines = (DATA / "pairs.txt").read_text().splitlines()[1:]
    for line in lines:
        parts = line.split("\t")
        if len(parts) == 3:
            a, b, target = by_path.get((parts[0], int(parts[1]))), by_path.get((parts[0], int(parts[2]))), same
        else:
            a, b, target = by_path.get((parts[0], int(parts[1]))), by_path.get((parts[2], int(parts[3]))), diff
        if a is None or b is None:
            missing += 1
            continue
        target.append(float(a @ b))
    s, d = np.array(same), np.array(diff)
    rows = [(t, float((s >= t).mean()), float((d >= t).mean())) for t in THRESHOLDS]
    candidates = np.unique(np.concatenate([s, d]))
    accuracies = [((s >= t).sum() + (d < t).sum()) / (len(s) + len(d)) for t in candidates]
    best = int(np.argmax(accuracies))
    return rows, float(candidates[best]), float(accuracies[best]), missing


def retrieval(items: list[Embedded]) -> tuple[list[tuple[float, float, float]], int, int]:
    found = [e for e in items if e.embedding is not None]
    matrix = np.stack([e.embedding for e in found])
    labels = np.array([e.person for e in found])
    by_person: dict[str, list[int]] = defaultdict(list)
    for i, e in enumerate(found):
        by_person[e.person].append(i)
    queries = [idx[0] for idx in by_person.values() if len(idx) >= 2]

    hits = {t: 0 for t in THRESHOLDS}
    false = {t: 0 for t in THRESHOLDS}
    genuine_total = 0
    for q in queries:
        sims = matrix @ matrix[q]
        sims[q] = -1  # селфи өөрөө галерейд байхгүй
        same = labels == labels[q]
        same[q] = False
        genuine_total += int(same.sum())
        for t in THRESHOLDS:
            above = sims >= t
            hits[t] += int((above & same).sum())
            false[t] += int((above & ~same).sum())
    rows = [(t, hits[t] / genuine_total, false[t] / len(queries)) for t in THRESHOLDS]
    return rows, len(queries), len(found)


def small_faces(engine: YuNetSFaceEngine, items: list[Embedded], samples: int = 400) -> list[tuple[int, float, float]]:
    """Нүүрийг N px болгож 1280×960 дэвсгэрийн дунд байрлуулна. LFW-ийн 250px зурагт нүүр ≈110px."""
    rng = np.random.default_rng(7)
    pool = [e for e in items if e.embedding is not None]
    chosen = [pool[i] for i in rng.choice(len(pool), size=min(samples, len(pool)), replace=False)]
    rows = []
    for size in SMALL_FACE_SIZES:
        detected = 0
        sims: list[float] = []
        for e in chosen:
            image = cv2.imread(str(e.path))
            scale = size / 110
            small = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            canvas = np.full((960, 1280, 3), 110, np.uint8)
            y, x = (960 - small.shape[0]) // 2, (1280 - small.shape[1]) // 2
            canvas[y : y + small.shape[0], x : x + small.shape[1]] = small
            face = central_face(engine, canvas)
            if face is None:
                continue
            detected += 1
            sims.append(float(face.embedding @ e.embedding))
        rows.append((size, detected / len(chosen), float(np.median(sims)) if sims else float("nan")))
    return rows


def write_report(n_images: int, sec_per_image: float, ver, retr, small) -> None:
    ver_rows, best_t, best_acc, ver_missing = ver
    retr_rows, n_queries, n_gallery = retr
    lines = [
        "# Царай таних benchmark — YuNet + SFace (LFW)",
        "",
        f"_Автоматаар үүсгэсэн: `uv run python -m benchmark.lfw` · {time.strftime('%Y-%m-%d')}_",
        "",
        "LFW нь ихэвчлэн ойрын, гэрэлтүүлэг сайтай хөрөг. Бодит эвэнтийн зураг (хөлс, малгай, хөдөлгөөн, олон хүн)",
        "илүү хэцүү тул эдгээр тоо **дээд хязгаар** гэж үзнэ. Launch-аас өмнө бодит эвэнтийн зураг дээр дахин хэмжинэ.",
        "",
        f"- Зураг: {n_images}, нүүр олдсон: {n_gallery} · CPU хурд: **{sec_per_image * 1000:.0f} мс/зураг** (250×250)",
        "",
        "## 1. Verification (стандарт 6000 хос)",
        "",
        f"Хамгийн өндөр нарийвчлал **{best_acc:.2%}** (босго {best_t:.3f}) · нүүр олдоогүй хос: {ver_missing}",
        "",
        "| Босго | Ижил хүнийг зөв таньсан | Өөр хүнийг буруу таньсан |",
        "|---|---|---|",
        *[f"| {t:.2f} | {tar:.2%} | {far:.2%} |" for t, tar, far in ver_rows],
        "",
        "## 2. Эвэнтийн хайлтын симуляци",
        "",
        f"{n_queries} селфи × {n_gallery} зургийн галерей (нэг том эвэнттэй ойролцоо).",
        "",
        "| Босго | Recall (өөрийн зургаас олдсон) | Селфи тутамд буруу олдсон зураг |",
        "|---|---|---|",
        *[f"| {t:.2f} | {r:.2%} | {fp:.1f} |" for t, r, fp in retr_rows],
        "",
        "## 3. Жижиг (хол зогссон) нүүр",
        "",
        "| Нүүрний хэмжээ | Илрүүлсэн | Эх зурагтай төсөө (медиан) |",
        "|---|---|---|",
        *[f"| {s}px | {d:.1%} | {m:.3f} |" for s, d, m in small],
        "",
    ]
    (ROOT / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    # Windows console (cp1252) кирилл хэвлэж чадахгүй
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    models = Path("models")
    ensure_models(models)
    engine = YuNetSFaceEngine(models)
    lfw_dir = download()
    print("embedding LFW…")
    items, sec = embed_all(engine, lfw_dir)
    print("verification…")
    ver = verification(items)
    print("retrieval…")
    retr = retrieval(items)
    print("small faces…")
    small = small_faces(engine, items)
    write_report(len(items), sec, ver, retr, small)
    print((ROOT / "RESULTS.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
