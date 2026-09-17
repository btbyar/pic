from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", env_file=(".env", "../../.env"), extra="ignore")

    models_dir: str = "models"
    # API -> ML дотоод токен. Хоосон бол зөвхөн dev-д шалгахгүй.
    service_token: str = ""

    # Илрүүлэлтийн өмнө зургийн урт талыг хязгаарлана. Их байх тусам жижиг (хол зогссон) нүүр олдоно,
    # гэхдээ CPU удна. Worker 2560px хүртэл багасгаж илгээдэг.
    face_det_max_side: int = 2560
    face_det_score_threshold: float = 0.6
    face_det_nms_threshold: float = 0.3
    face_det_top_k: int = 5000

    max_upload_bytes: int = 30 * 1024 * 1024


settings = Settings()
