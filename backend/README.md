# TubeMind AI Backend

FastAPI backend services for the TubeMind AI Chrome Extension.

## Setup & Running Local Development Server

1. **Create and Activate a Virtual Environment**
   ```bash
   python -m venv venv
   # On Windows (PowerShell)
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux
   source venv/bin/activate
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the API Server**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

4. **API Documentation**
   Once running, you can access the interactive API docs at:
   - Swagger UI: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
   - ReDoc: [http://localhost:8000/api/v1/redoc](http://localhost:8000/api/v1/redoc)
