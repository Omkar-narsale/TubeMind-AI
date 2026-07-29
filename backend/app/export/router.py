import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.export.models import ExportRequest, ExportAllRequest
from app.export.pdf_export import generate_pdf
from app.export.docx_export import generate_docx
from app.export.markdown_export import generate_markdown
from app.export.zip_export import generate_zip_package

logger = logging.getLogger("app.export.router")
router = APIRouter(prefix="/export", tags=["export"])


@router.post("/pdf")
async def export_pdf(payload: ExportRequest):
    try:
        pdf_bytes = generate_pdf(
            video_title=payload.video_title or "YouTube Video",
            youtube_url=payload.youtube_url or "",
            feature=payload.feature,
            language=payload.language or "English",
            content=payload.content,
        )
        filename = payload.get_filename("pdf")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.exception("Error generating PDF export")
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")


@router.post("/docx")
async def export_docx(payload: ExportRequest):
    try:
        docx_bytes = generate_docx(
            video_title=payload.video_title or "YouTube Video",
            youtube_url=payload.youtube_url or "",
            feature=payload.feature,
            language=payload.language or "English",
            content=payload.content,
        )
        filename = payload.get_filename("docx")
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.exception("Error generating DOCX export")
        raise HTTPException(status_code=500, detail=f"DOCX export failed: {str(e)}")


@router.post("/markdown")
async def export_markdown(payload: ExportRequest):
    try:
        md_bytes = generate_markdown(
            video_title=payload.video_title or "YouTube Video",
            youtube_url=payload.youtube_url or "",
            feature=payload.feature,
            language=payload.language or "English",
            content=payload.content,
        )
        filename = payload.get_filename("md")
        return Response(
            content=md_bytes,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.exception("Error generating Markdown export")
        raise HTTPException(status_code=500, detail=f"Markdown export failed: {str(e)}")


@router.post("/all")
async def export_all_zip(payload: ExportAllRequest):
    try:
        zip_bytes = generate_zip_package(
            video_title=payload.video_title or "YouTube Video",
            youtube_url=payload.youtube_url or "",
            language=payload.language or "English",
            contents=payload.contents or {},
        )
        filename = payload.get_filename()
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.exception("Error generating ZIP export")
        raise HTTPException(status_code=500, detail=f"ZIP export failed: {str(e)}")
