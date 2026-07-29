import io
import zipfile
from app.export.models import sanitize_filename
from app.export.pdf_export import generate_pdf
from app.export.docx_export import generate_docx
from app.export.markdown_export import generate_markdown


def generate_zip_package(
    video_title: str,
    youtube_url: str,
    language: str,
    contents: dict,
) -> bytes:
    """
    Generates a single ZIP package containing exported PDF, DOCX, and MD files
    for all available learning features.
    """
    clean_title = sanitize_filename(video_title or "TubeMind")
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for feature_key, text_content in contents.items():
            if not text_content or not text_content.strip():
                continue

            feature_name = feature_key.replace("-", "_").replace(" ", "_").title()
            
            # 1. Add PDF
            try:
                pdf_bytes = generate_pdf(video_title, youtube_url, feature_key, language, text_content)
                zf.writestr(f"{clean_title}_{feature_name}.pdf", pdf_bytes)
            except Exception as e:
                pass

            # 2. Add DOCX
            try:
                docx_bytes = generate_docx(video_title, youtube_url, feature_key, language, text_content)
                zf.writestr(f"{clean_title}_{feature_name}.docx", docx_bytes)
            except Exception as e:
                pass

            # 3. Add Markdown
            try:
                md_bytes = generate_markdown(video_title, youtube_url, feature_key, language, text_content)
                zf.writestr(f"{clean_title}_{feature_name}.md", md_bytes)
            except Exception as e:
                pass

    zip_bytes = zip_buffer.getvalue()
    zip_buffer.close()
    return zip_bytes
