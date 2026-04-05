import os
import sys
import json
from pathlib import Path

def get_app_dir() -> Path:
    """Returns the true directory containing the executable or the project root."""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    else:
        return Path(__file__).parent.parent.parent

CONFIG_PATH = get_app_dir() / "grammarlot_config.json"

def get_config() -> dict:
    if not CONFIG_PATH.exists():
        default_dir = get_app_dir() / "prompts"
        
        # Save a default config so the UI has a path, but DO NOT create the folder on disk.
        default_config = {"root_dir": str(default_dir.resolve()), "port": 8000}
        save_config(default_config)
        return default_config
        
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Catch old configs that don't have a port yet
            if "port" not in data:
                data["port"] = 8000
            return data
    except:
        return {"root_dir": "", "port": 8000}

def save_config(config_data: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=4)