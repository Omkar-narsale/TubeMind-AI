from fastapi import APIRouter, HTTPException, status
from app.schemas.common import APIResponse
from app.schemas.youtube import VideoMetadataRequest, VideoMetadata, VideoChannelInfo, VideoTranscript, TranscriptSegment

router = APIRouter()


@router.post("/metadata", response_model=APIResponse[VideoMetadata])
def get_video_metadata(payload: VideoMetadataRequest):
    """
    Retrieve YouTube video metadata.
    """
    # Simple validation of URL structure (mock behavior for starter file)
    video_id = "mock_id"
    if "v=" in payload.video_url:
        video_id = payload.video_url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in payload.video_url:
        video_id = payload.video_url.split("youtu.be/")[1].split("?")[0]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube video URL format",
        )

    # Mock response matching production-quality structure
    mock_metadata = VideoMetadata(
        video_id=video_id,
        title="TubeMind AI Chrome Extension Architecture Tutorial",
        description="Learn how to build production-grade Chrome extensions with React and FastAPI.",
        published_at="2026-07-26T00:00:00Z",
        channel=VideoChannelInfo(
            id="UC_mock_channel",
            title="Tech Architecture Channels",
            thumbnail_url="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe",
        ),
        duration="PT10M30S",
        view_count=10500,
        like_count=512,
    )

    return APIResponse(
        success=True,
        message="Video metadata retrieved successfully",
        data=mock_metadata,
    )


@router.get("/{video_id}/transcript", response_model=APIResponse[VideoTranscript])
def get_video_transcript(video_id: str):
    """
    Retrieve YouTube transcript segments.
    """
    # Mock transcript segments
    mock_segments = [
        TranscriptSegment(text="Welcome to this tutorial on TubeMind AI.", start=0.0, duration=4.5),
        TranscriptSegment(text="In this video we scaffold the extension popup.", start=4.5, duration=5.0),
        TranscriptSegment(text="Let us dive into the details.", start=9.5, duration=3.0),
    ]

    mock_transcript = VideoTranscript(
        video_id=video_id,
        language_code="en",
        segments=mock_segments,
    )

    return APIResponse(
        success=True,
        message="Video transcript retrieved successfully",
        data=mock_transcript,
    )
