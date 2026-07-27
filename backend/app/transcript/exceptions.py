class TranscriptError(Exception):
    """Base exception for transcript-related errors."""
    pass


class VideoUnavailableError(TranscriptError):
    """Raised when the YouTube video does not exist or is private."""
    pass


class TranscriptDisabledError(TranscriptError):
    """Raised when transcripts are disabled for the video."""
    pass


class NoCaptionsError(TranscriptError):
    """Raised when no English or auto-generated captions are available."""
    pass


class RateLimitError(TranscriptError):
    """Raised when YouTube rate-limits requests."""
    pass


class InvalidVideoIdError(TranscriptError):
    """Raised when the video ID is invalid."""
    pass
