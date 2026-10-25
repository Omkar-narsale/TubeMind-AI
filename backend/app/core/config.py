import os
import json
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Resolve absolute path to backend/.env
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, "..", ".."))
env_path = os.path.join(backend_dir, ".env")

load_dotenv(env_path)


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "TubeMind AI API"
    DEBUG: bool = True

    # CORS origins
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "chrome-extension://*"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            if isinstance(v, str):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return v
        raise ValueError(v)

    # Optional third-party integrations
    YOUTUBE_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    # Routing Models
    CHAT_MODEL: str = "openai/gpt-oss-20b"
    SUMMARY_MODEL: str = "openai/gpt-oss-120b"
    NOTES_MODEL: str = "openai/gpt-oss-20b"
    TAKEAWAYS_MODEL: str = "openai/gpt-oss-20b"
    QUIZ_MODEL: str = "openai/gpt-oss-20b"
    FLASHCARD_MODEL: str = "openai/gpt-oss-20b"
    INTERVIEW_MODEL: str = "openai/gpt-oss-20b"

    # Whisper Speech-to-Text Fallback
    ENABLE_WHISPER_FALLBACK: bool = True
    WHISPER_MODEL: str = "whisper-large-v3-turbo"
    WHISPER_MAX_FILE_SIZE_MB: int = 25
    WHISPER_MAX_DURATION_MINUTES: int = 120

    # Second Brain Integration (Notion & Obsidian)
    NOTION_API_KEY: str = ""
    NOTION_DATABASE_ID: str = ""
    NOTION_PAGE_ID: str = ""
    OBSIDIAN_VAULT_NAME: str = ""

    # Optimization settings
    CACHE_TTL_SECONDS: int = 1800
    LLM_RETRY_COUNT: int = 2
    LLM_RETRY_DELAY_SECONDS: float = 1.0
    COMPRESSION_RATIO: float = 0.4
    CHUNK_SIZE: int = 500
    TOP_K: int = 5
    TOTAL_BUDGET_LIMIT: int = 6000
    MAX_CONTEXT_BUDGET: int = 3000
    MAX_PROMPT_TOKENS: int = 5000
    SUMMARY_CONTEXT_LIMIT: int = 3000
    CHAT_CONTEXT_LIMIT: int = 2500
    MAX_HISTORY: int = 6
    MAX_CHUNKS: int = 8
    DEFAULT_OUTPUT_LANGUAGE: str = "en"
    SAFETY_MARGIN: float = 0.75

    model_config = SettingsConfigDict(
        env_file=env_path, env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )


settings = Settings()

# Temporary startup log
print(f"Groq API Key Loaded: {bool(settings.GROQ_API_KEY)}")
print(f"Model: {settings.GROQ_MODEL}")
