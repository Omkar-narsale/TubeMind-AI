from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from app.schemas.common import APIResponse
from app.llm.models import ChatRequest, ChatResponse
from app.llm.service import LLMChatService
from app.transcript.exceptions import TranscriptError
import json

router = APIRouter()


def get_llm_chat_service() -> LLMChatService:
    return LLMChatService()


@router.post("")
async def chat_endpoint(
    payload: ChatRequest,
    service: LLMChatService = Depends(get_llm_chat_service)
):
    """
    Core AI Chat Layer endpoint. Answers questions using retrieved transcript chunks.
    Supports streaming using Server-Sent Events (SSE).
    """
    try:
        if payload.stream:
            async def sse_event_generator():
                try:
                    async for event_type, content in service.stream_chat(
                        video_id=payload.video_id,
                        query=payload.query,
                        history=payload.history,
                        temperature=payload.temperature,
                        max_tokens=payload.max_tokens,
                    ):
                        data_payload = json.dumps({"event": event_type, "data": content})
                        yield f"data: {data_payload}\n\n"
                except ValueError as ve:
                    err_payload = json.dumps({"event": "error", "data": str(ve)})
                    yield f"data: {err_payload}\n\n"
                except RuntimeError as re:
                    err_payload = json.dumps({"event": "error", "data": str(re)})
                    yield f"data: {err_payload}\n\n"
                except Exception as e:
                    err_payload = json.dumps({"event": "error", "data": str(e)})
                    yield f"data: {err_payload}\n\n"

            return StreamingResponse(sse_event_generator(), media_type="text/event-stream")
        else:
            answer, context, metadata = await service.chat(
                video_id=payload.video_id,
                query=payload.query,
                history=payload.history,
                temperature=payload.temperature,
                max_tokens=payload.max_tokens,
            )
            data = ChatResponse(success=True, answer=answer, context=context, metadata=metadata)
            return APIResponse(
                success=True,
                message="Chat response generated successfully",
                data=data,
            )

    except TranscriptError as te:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(te)
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except TimeoutError as toe:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(toe)
        )
    except RuntimeError as re:
        status_code = status.HTTP_502_BAD_GATEWAY
        if "rate limit" in str(re).lower():
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
        raise HTTPException(
            status_code=status_code,
            detail=str(re)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred in chat pipeline: {str(e)}"
        )
