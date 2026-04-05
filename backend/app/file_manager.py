import os
import shutil
from pathlib import Path
from app.config import get_config

class FileManager:
    def __init__(self):
        config = get_config()
        self.workspace_dir = Path(config.get("root_dir", "")).resolve()
        
        # We NO LONGER force-create the directory here. 
        # It will only be created when the user actually saves a file.

    def _safe_path(self, relative_path: str) -> Path:
        """Ensures the requested path doesn't escape the configured root directory."""
        if not str(self.workspace_dir).strip():
            raise ValueError("No root directory configured.")
            
        target_path = (self.workspace_dir / relative_path).resolve()
        if not target_path.is_relative_to(self.workspace_dir):
            raise ValueError("Access denied: Path traversal detected.")
        return target_path

    def list_files(self, sub_dir: str = "") -> dict:
        try:
            target_dir = self._safe_path(sub_dir)
        except ValueError:
            return {"name": "Unconfigured", "type": "directory", "path": sub_dir, "children": []}

        # If the folder doesn't exist yet, return an empty tree so the React UI doesn't crash
        if not target_dir.exists() or not target_dir.is_dir():
            return {"name": target_dir.name or "prompts", "type": "directory", "path": sub_dir, "children": []}

        tree = {"name": target_dir.name, "type": "directory", "path": sub_dir, "children": []}
        
        for item in sorted(target_dir.iterdir()):
            if item.name.startswith('.'): continue
            
            rel_path = str(item.relative_to(self.workspace_dir)).replace("\\", "/")
            if item.is_dir():
                tree["children"].append(self.list_files(rel_path))
            elif item.suffix == ".txt":
                tree["children"].append({
                    "name": item.name,
                    "type": "file",
                    "path": rel_path
                })
        return tree

    def read_file(self, relative_path: str) -> str:
        target = self._safe_path(relative_path)
        if target.exists() and target.is_file():
            return target.read_text(encoding="utf-8")
        raise FileNotFoundError(f"File {relative_path} not found.")

    def write_file(self, relative_path: str, content: str):
        target = self._safe_path(relative_path)
        # This will create the root folder and any nested folders right when the file is saved!
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def delete_item(self, relative_path: str):
        target = self._safe_path(relative_path)
        if target.is_file():
            target.unlink()
        elif target.is_dir():
            shutil.rmtree(target)
            
    def create_directory(self, relative_path: str):
        target = self._safe_path(relative_path)
        target.mkdir(parents=True, exist_ok=True)

    def rename_item(self, old_rel_path: str, new_rel_path: str):
        old_target = self._safe_path(old_rel_path)
        new_target = self._safe_path(new_rel_path)
        if not old_target.exists():
            raise FileNotFoundError(f"Source {old_rel_path} not found.")
        new_target.parent.mkdir(parents=True, exist_ok=True)
        old_target.rename(new_target)