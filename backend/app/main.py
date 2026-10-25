from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.endpoints import health, youtube, transcript, rag, chat
from app.learning import router as learning_router
from app.export import router as export_router
from app.playlist import router as playlist_router
from app.core.config import settings
from app.schemas.common import ErrorDetail, ErrorResponse
from app.llm.exceptions import GroqAPIException

app = FastAPI(
    title=settings.PROJECT_NAME,
)


@app.exception_handler(GroqAPIException)
async def groq_exception_handler(request: Request, exc: GroqAPIException):
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(
            ErrorResponse(
                success=False,
                error=ErrorDetail(
                    code=exc.code,
                    message=exc.message,
                ),
            )
        ),
    )

# Configure CORS
# To support chrome extension requests from chrome-extension:// origins,
# we need to be careful with wildcard configurations or specific protocols.
# Chrome extensions can have arbitrary hashes, so adding allow_origin_regex
# or specifying wildcards is useful.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# Global Error Handling
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(
            ErrorResponse(
                success=False,
                error=ErrorDetail(
                    code="HTTP_ERROR",
                    message=exc.detail,
                ),
            )
        ),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msg = "Validation failed"
    field = None
    if errors:
        msg = errors[0].get("msg", msg)
        loc = errors[0].get("loc", [])
        if len(loc) > 1:
            field = str(loc[1])

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder(
            ErrorResponse(
                success=False,
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=msg,
                    field=field,
                ),
            )
        ),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=jsonable_encoder(
            ErrorResponse(
                success=False,
                error=ErrorDetail(
                    code="INTERNAL_SERVER_ERROR",
                    message=str(exc) if settings.DEBUG else "An unexpected error occurred",
                ),
            )
        ),
    )


# Include Routers
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(youtube.router, prefix=f"{settings.API_V1_STR}/youtube", tags=["YouTube"])
app.include_router(transcript.router, prefix=f"{settings.API_V1_STR}/transcript", tags=["Transcript"])
app.include_router(rag.router, prefix=f"{settings.API_V1_STR}/rag", tags=["RAG"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat"])
app.include_router(learning_router.router, prefix=f"{settings.API_V1_STR}", tags=["Learning"])
app.include_router(export_router.router, prefix=f"{settings.API_V1_STR}", tags=["Export"])
app.include_router(playlist_router.router, prefix=f"{settings.API_V1_STR}", tags=["Playlist"])

