import logging
from typing import List, Optional, Dict, Any

from app.transcript.service import TranscriptService
from app.rag.chunker import chunk_transcript
from app.rag.embeddings import embedding_model, EmbeddingModel
from app.playlist.models import (
    PlaylistVideoItem,
    PlaylistChunk,
    PlaylistSearchResult,
    PlaylistIndexStatus,
)
from app.playlist.vector_store import playlist_vector_store, PlaylistVectorStore
from app.playlist.extractor import fetch_playlist_metadata

logger = logging.getLogger("app.playlist.service")


class PlaylistRAGService:
    def __init__(
        self,
        transcript_service: Optional[TranscriptService] = None,
        embedding: Optional[EmbeddingModel] = None,
        vector_store: Optional[PlaylistVectorStore] = None,
    ):
        self.transcript_service = transcript_service or TranscriptService()
        self.embedding = embedding or embedding_model
        self.vector_store = vector_store or playlist_vector_store

    def get_playlist_info(self, playlist_id_or_url: str, max_items: int = 25):
        return fetch_playlist_metadata(playlist_id_or_url, max_items=max_items)

    def is_indexed(self, playlist_id: str) -> bool:
        return self.vector_store.has_index(playlist_id)

    def get_index_status(self, playlist_id: str) -> Optional[PlaylistIndexStatus]:
        return self.vector_store.get_status(playlist_id)

    async def index_playlist(
        self,
        playlist_id: str,
        playlist_title: Optional[str] = None,
        videos: Optional[List[PlaylistVideoItem]] = None,
        max_videos: int = 12,
        language: str = "en",
    ) -> PlaylistIndexStatus:
        """
        Retrieves transcripts for multiple videos in the course/playlist,
        chunks them, generates multi-video embeddings, and builds a FAISS cross-video index.
        """
        # If videos list not provided, extract from YouTube
        title = playlist_title or f"Playlist {playlist_id}"
        if not videos:
            try:
                _, title, fetched_videos = self.get_playlist_info(playlist_id, max_items=max_videos)
                videos = fetched_videos
            except Exception as e:
                logger.error(f"Failed to fetch videos for playlist {playlist_id}: {e}")
                videos = []

        selected_videos = (videos or [])[:max_videos]
        total_videos = len(selected_videos)

        all_chunks: List[PlaylistChunk] = []
        video_details: List[Dict[str, Any]] = []
        indexed_count = 0
        failed_count = 0

        logger.info(f"Starting multi-video indexing for playlist {playlist_id} ({total_videos} videos)...")

        for item in selected_videos:
            vid = item.video_id
            vtitle = item.title

            try:
                transcript_data = self.transcript_service.get_transcript(vid, target_language=language)
                segments = transcript_data.get("segments", [])
                
                if not segments:
                    video_details.append({"video_id": vid, "title": vtitle, "status": "no_transcript", "chunks": 0})
                    failed_count += 1
                    continue

                raw_chunks = chunk_transcript(segments)
                if not raw_chunks:
                    video_details.append({"video_id": vid, "title": vtitle, "status": "empty_chunks", "chunks": 0})
                    failed_count += 1
                    continue

                for rc in raw_chunks:
                    all_chunks.append(
                        PlaylistChunk(
                            video_id=vid,
                            video_title=vtitle,
                            text=rc.text,
                            start_time=rc.start_time,
                            end_time=rc.end_time,
                            chunk_index=rc.chunk_index,
                        )
                    )

                indexed_count += 1
                video_details.append({
                    "video_id": vid,
                    "title": vtitle,
                    "status": "indexed",
                    "chunks": len(raw_chunks),
                })
                logger.info(f"Indexed lecture '{vtitle}' ({vid}): {len(raw_chunks)} chunks.")

            except Exception as e:
                logger.warning(f"Could not index video {vid} ('{vtitle}'): {e}")
                failed_count += 1
                video_details.append({"video_id": vid, "title": vtitle, "status": "failed", "error": str(e), "chunks": 0})

        # Generate combined embeddings and build FAISS index
        if all_chunks:
            chunk_texts = [c.text for c in all_chunks]
            logger.info(f"Generating embeddings for {len(chunk_texts)} playlist chunks...")
            embeddings = self.embedding.encode(chunk_texts)

            status = PlaylistIndexStatus(
                playlist_id=playlist_id,
                title=title,
                total_videos=total_videos,
                indexed_videos=indexed_count,
                failed_videos=failed_count,
                total_chunks=len(all_chunks),
                is_ready=True,
                video_details=video_details,
            )
            self.vector_store.create_index(playlist_id, all_chunks, embeddings, status)
            return status

        else:
            status = PlaylistIndexStatus(
                playlist_id=playlist_id,
                title=title,
                total_videos=total_videos,
                indexed_videos=0,
                failed_videos=total_videos,
                total_chunks=0,
                is_ready=False,
                video_details=video_details,
            )
            return status

    def search_playlist(
        self,
        playlist_id: str,
        query: str,
        top_k: int = 6,
    ) -> List[PlaylistSearchResult]:
        """
        Performs semantic cross-video search against the course/playlist index.
        """
        if not self.vector_store.has_index(playlist_id):
            return []

        query_embedding = self.embedding.encode([query])
        return self.vector_store.search(playlist_id, query_embedding, top_k=top_k)


playlist_rag_service = PlaylistRAGService()
