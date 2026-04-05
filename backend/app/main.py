import time
import random
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sys
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.parsifal import GrammarParser
from app.file_manager import FileManager
from app.config import get_config, save_config

app = FastAPI(title="Grammarlot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class GenerateRequest(BaseModel):
    text: str
    seed: Optional[int] = None
    clean: bool = True

class FileSaveRequest(BaseModel):
    content: str

class MoveRequest(BaseModel):
    old_path: str
    new_path: str

class ConfigRequest(BaseModel):
    root_dir: str
    port: int

# --- Settings Endpoints ---
@app.get("/api/config")
async def get_config_route():
    return get_config()

@app.post("/api/config")
async def save_config_route(req: ConfigRequest):
    save_config({"root_dir": req.root_dir, "port": req.port})
    return {"status": "success"}

# --- Parsifal Endpoints ---
@app.post("/api/generate")
async def generate(req: GenerateRequest):
    try:
        fm = FileManager()
        active_seed = req.seed if req.seed is not None else random.randint(0, 999999999)
        start_time = time.time()
        
        parser = GrammarParser(root_dir=str(fm.workspace_dir), seed=active_seed, clean_output=req.clean)
        result = parser.parse(req.text)
        
        duration = time.time() - start_time
        return {
            "result": result,
            "seed": active_seed,
            "duration_ms": round(duration * 1000, 2),
            "trace": parser.trace_logs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- File Endpoints ---
@app.get("/api/files")
async def get_file_tree():
    fm = FileManager()
    return fm.list_files()

@app.get("/api/files/{path:path}")
async def get_file(path: str):
    fm = FileManager()
    try:
        return {"content": fm.read_file(path)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

@app.post("/api/files/{path:path}")
async def save_file(path: str, req: FileSaveRequest):
    fm = FileManager()
    fm.write_file(path, req.content)
    return {"status": "success"}

@app.delete("/api/files/{path:path}")
async def delete_file(path: str):
    fm = FileManager()
    fm.delete_item(path)
    return {"status": "success"}

@app.post("/api/folders/{path:path}")
async def create_folder(path: str):
    fm = FileManager()
    fm.create_directory(path)
    return {"status": "success"}

@app.post("/api/move")
async def move_item(req: MoveRequest):
    fm = FileManager()
    fm.rename_item(req.old_path, req.new_path)
    return {"status": "success"}

# --- STATIC FRONTEND SERVING ---
# PyInstaller creates a temp folder and stores path in _MEIPASS at runtime.
# We use getattr() to prevent IDE linters from throwing warnings.
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running as a compiled executable
    frontend_dir = os.path.join(getattr(sys, '_MEIPASS'), "frontend", "dist")
else:
    # Running from source code (Dev Mode)
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

# Only mount the frontend if the dist folder actually exists
if os.path.exists(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")
    
    # Catch-all route to serve the React index.html for the root path
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # We check if the requested file exists (like Vite's favicon or other root assets)
        target_path = os.path.join(frontend_dir, full_path)
        if os.path.isfile(target_path):
            return FileResponse(target_path)
            
        # Otherwise, return the main React app
        return FileResponse(os.path.join(frontend_dir, "index.html"))