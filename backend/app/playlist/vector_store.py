from typing import Dict, Tuple, List, Optional
import faiss
import numpy as np
import logging

from app.playlist.models import PlaylistChunk, PlaylistSearchResult, PlaylistIndexStatus

logger = logging.getLogger("app.playlist.vector_store")


def format_seconds(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


class PlaylistVectorStore:
    def __init__(self):
        # Map playlist_id -> (faiss_index, list_of_chunks, embeddings, PlaylistIndexStatus)
        self.indices: Dict[str, Tuple[faiss.IndexFlatIP, List[PlaylistChunk], np.ndarray, PlaylistIndexStatus]] = {}

    def has_index(self, playlist_id: str) -> bool:
        return playlist_id in self.indices

    def get_status(self, playlist_id: str) -> Optional[PlaylistIndexStatus]:
        if playlist_id not in self.indices:
            return None
        return self.indices[playlist_id][3]

    def create_index(
        self,
        playlist_id: str,
        chunks: List[PlaylistChunk],
        embeddings: np.ndarray,
        status: PlaylistIndexStatus,
    ) -> None:
        """Creates FAISS in-memory IndexFlatIP index over all playlist chunks."""
        if not chunks or len(chunks) == 0:
            logger.warning(f"No chunks provided to index for playlist {playlist_id}")
            return

        dimension = embeddings.shape[1]
        norm_embeddings = embeddings.copy()
        faiss.normalize_L2(norm_embeddings)

        index = faiss.IndexFlatIP(dimension)
        index.add(norm_embeddings)

        self.indices[playlist_id] = (index, chunks, embeddings, status)
        logger.info(f"Created playlist FAISS index for {playlist_id} with {len(chunks)} chunks across {status.indexed_videos} videos.")

    def search(
        self,
        playlist_id: str,
        query_embedding: np.ndarray,
        top_k: int = 6,
    ) -> List[PlaylistSearchResult]:
        """
        Cross-video semantic search. Finds top_k most relevant chunks across all videos in the course.
        """
        if playlist_id not in self.indices:
            return []

        index, chunks, _, _ = self.indices[playlist_id]

        query_norm = query_embedding.copy()
        if len(query_norm.shape) == 1:
            query_norm = np.expand_dims(query_norm, axis=0)
        faiss.normalize_L2(query_norm)

        search_k = min(top_k, len(chunks))
        scores, indices = index.search(query_norm, search_k)

        results: List[PlaylistSearchResult] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or idx >= len(chunks):
                continue
            chunk = chunks[idx]
            clipped_score = max(0.0, float(score))

            time_str = f"{format_seconds(chunk.start_time)} - {format_seconds(chunk.end_time)}"
            citation = f"[{chunk.video_title} @ {format_seconds(chunk.start_time)}]"

            results.append(
                PlaylistSearchResult(
                    video_id=chunk.video_id,
                    video_title=chunk.video_title,
                    score=clipped_score,
                    text=chunk.text,
                    start=chunk.start_time,
                    end=chunk.end_time,
                    chunk_index=chunk.chunk_index,
                    formatted_citation=citation,
                )
            )

        return results

    def clear(self) -> None:
        self.indices.clear()


playlist_vector_store = PlaylistVectorStore()
