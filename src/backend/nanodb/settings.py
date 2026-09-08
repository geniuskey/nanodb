"""Environment-only NANoDB runtime settings."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb"
    upload_root: Path = Path("var/uploads")
    nanodb_profile: str = "demo"
    database_pool_size: int = Field(default=5, ge=1)
    database_max_overflow: int = Field(default=5, ge=0)
    database_pool_timeout: float = Field(default=10.0, gt=0)
    frontend_dist: Path = Path("dist/frontend")
    log_level: str = "INFO"
