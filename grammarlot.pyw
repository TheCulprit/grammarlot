# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pystray",
#     "pillow",
#     "uvicorn",
#     "fastapi"
# ]
# ///

import os
import sys
import threading
import webbrowser
import pystray
from pystray import MenuItem as item
from PIL import Image, ImageDraw

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

import uvicorn

base_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(base_dir, "backend")

if getattr(sys, 'frozen', False):
    from app.main import app
    from app.config import get_config
else:
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from app.main import app
    from app.config import get_config

# Read the config to get the dynamic port!
CONFIG = get_config()
PORT = int(CONFIG.get("port", 8000))

class ServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.server = None

    def run(self):
        config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_config=None)
        self.server = uvicorn.Server(config)
        self.server.run()

    def stop(self):
        if self.server:
            self.server.should_exit = True

server_thread = None

def create_icon_image():
    bg_color = (12, 12, 12)
    gold = (218, 165, 32)
    image = Image.new('RGB', (64, 64), color=bg_color)
    dc = ImageDraw.Draw(image)
    dc.rectangle([16, 36, 48, 56], fill=gold)
    dc.rectangle([12, 20, 24, 56], fill=gold)
    dc.rectangle([40, 20, 52, 56], fill=gold)
    dc.rectangle([12, 14, 16, 20], fill=gold)
    dc.rectangle([20, 14, 24, 20], fill=gold)
    dc.rectangle([40, 14, 44, 20], fill=gold)
    dc.rectangle([48, 14, 52, 20], fill=gold)
    dc.rectangle([28, 30, 36, 36], fill=gold)
    dc.rectangle([26, 44, 38, 56], fill=bg_color)
    dc.ellipse([26, 40, 38, 48], fill=bg_color)
    return image

def open_browser(icon, item):
    webbrowser.open(f"http://127.0.0.1:{PORT}/")

def quit_app(icon, item):
    global server_thread
    if server_thread:
        server_thread.stop()
    icon.stop()

def main():
    global server_thread
    server_thread = ServerThread()
    server_thread.start()
    
    icon = pystray.Icon("Grammarlot")
    icon.menu = pystray.Menu(
        item('Open Grammarlot IDE', open_browser, default=True),
        item('Quit Server', quit_app)
    )
    icon.icon = create_icon_image()
    icon.title = f"Grammarlot Server (Port {PORT})"
    
    open_browser(None, None)
    icon.run()

if __name__ == "__main__":
    main()