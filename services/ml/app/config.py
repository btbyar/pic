from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_", env_file=".env", extra="ignore")

    models_dir: str = "models"
    face_model_version: str = "buffalo_l"
    # Internal service token: API -> ML. Хоосон бол dev горимд шалгахгүй.
    service_token: str = ""


settings = Settings()
