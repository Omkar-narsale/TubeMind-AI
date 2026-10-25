import logging
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.playlist.models import (
    PlaylistInfoRequest,
    PlaylistInfoResponse,
    PlaylistIndexRequest,
    PlaylistIndexStatus,
    PlaylistSearchRequest,
    PlaylistSearchResponse,
    PlaylistChatRequest,
    PlaylistChatResponse,
)
from app.playlist.service import playlist_rag_service
from app.playlist.chat_service import playlist_chat_service

logger = logging.getLogger("app.playlist.router")
router = APIRouter(prefix="/playlist", tags=["Playlist"])


@router.post("/info", response_model=PlaylistInfoResponse)
async def get_playlist_info(payload: PlaylistInfoRequest):
    """
    Fetches playlist title and video entries from YouTube via flat yt-dlp.
    """
    try:
        pid, title, videos = playlist_rag_service.get_playlist_info(payload.playlist_id_or_url)
        return PlaylistInfoResponse(
            playlist_id=pid,
            title=title,
            video_count=len(videos),
            videos=videos,
        )
    except Exception as e:
        logger.exception("Failed to retrieve playlist information")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not fetch playlist: {str(e)}",
        )


@router.post("/index", response_model=PlaylistIndexStatus)
async def index_playlist(payload: PlaylistIndexRequest):
    """
    Indexes multiple video transcripts in a playlist into a consolidated FAISS vector store.
    """
    try:
        status_result = await playlist_rag_service.index_playlist(
            playlist_id=payload.playlist_id,
            playlist_title=payload.playlist_title,
            videos=payload.videos,
            max_videos=payload.max_videos or 12,
            language=payload.language or "en",
        )
        return status_result
    except Exception as e:
        logger.exception("Failed to index playlist")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Playlist indexing failed: {str(e)}",
        )


@router.get("/status/{playlist_id}", response_model=PlaylistIndexStatus)
async def get_playlist_status(playlist_id: str):
    """
    Returns the indexing status and indexed video count for a playlist.
    """
    status_result = playlist_rag_service.get_index_status(playlist_id)
    if not status_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Playlist '{playlist_id}' has not been indexed yet.",
        )
    return status_result


@router.post("/search", response_model=PlaylistSearchResponse)
async def search_playlist(payload: PlaylistSearchRequest):
    """
    Executes semantic search across all indexed lectures in the playlist.
    """
    try:
        results = playlist_rag_service.search_playlist(
            playlist_id=payload.playlist_id,
            query=payload.query,
            top_k=payload.top_k or 6,
        )
        return PlaylistSearchResponse(
            success=True,
            results=results,
        )
    except Exception as e:
        logger.exception("Failed searching playlist")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Playlist search failed: {str(e)}",
        )


@router.post("/chat")
async def chat_playlist(payload: PlaylistChatRequest):
    """
    Answers questions synthesized across an entire YouTube course playlist.
    Supports both streaming SSE and JSON response.
    """
    try:
        if payload.stream:
            return StreamingResponse(
                playlist_chat_service.stream_chat(
                    playlist_id=payload.playlist_id,
                    query=payload.query,
                    history=payload.history,
                    temperature=payload.temperature or 0.7,
                    max_tokens=payload.max_tokens or 1024,
                    language=payload.language or "en",
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )

        response = await playlist_chat_service.chat(
            playlist_id=payload.playlist_id,
            query=payload.query,
            history=payload.history,
            temperature=payload.temperature or 0.7,
            max_tokens=payload.max_tokens or 1024,
            language=payload.language or "en",
        )
        return response
    except Exception as e:
        logger.exception("Playlist chat failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Playlist chat error: {str(e)}",
        )
