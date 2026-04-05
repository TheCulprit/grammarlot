# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pillow",
# ]
# ///

import os
import subprocess
import shutil
from PIL import Image, ImageDraw

def generate_ico():
    print("Generating Window Icon...")
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
    image.save('icon.ico', format='ICO')

def build_app():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)

    # --- 1. BUILD FRONTEND ---
    print("Building React Frontend...")
    frontend_dir = os.path.join(root_dir, "frontend")
    
    # Grab the current environment variables
    env = os.environ.copy()
    
    # If GitHub Actions is running this, and it was triggered by a Release Tag (e.g. "v1.0.1")
    if env.get('GITHUB_REF_TYPE') == 'tag':
        # Inject the tag name into Vite!
        env['VITE_APP_VERSION'] = env.get('GITHUB_REF_NAME', 'Unknown Version')
    else:
        env['VITE_APP_VERSION'] = 'Local Build'

    subprocess.run("yarn install", cwd=frontend_dir, shell=True, check=True)
    # Pass the injected environment variables into the build process
    subprocess.run("yarn build", cwd=frontend_dir, shell=True, check=True, env=env)

    # --- 2. GENERATE ICON ---
    generate_ico()
    
    # --- 3. RUN PYINSTALLER ---
    hidden_imports = [
        "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto", 
        "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
    ]
    
    hidden_str = " ".join([f"--hidden-import={h}" for h in hidden_imports])
    sep = ";" if os.name == "nt" else ":"
    
    print("\nRunning PyInstaller...")
    cmd = f'uv run --directory backend pyinstaller --noconfirm --onefile --windowed --icon=../icon.ico --paths . --add-data "../frontend/dist{sep}frontend/dist" {hidden_str} --name Grammarlot ../grammarlot.pyw'
    
    subprocess.run(cmd, shell=True, check=True)

    # --- 4. MOVE EXECUTABLE & CLEANUP ---
    print("\nMoving executable to root and cleaning up...")
    os.makedirs("dist", exist_ok=True)
    exe_ext = ".exe" if os.name == "nt" else ""
    
    src_exe = os.path.join("backend", "dist", f"Grammarlot{exe_ext}")
    dst_exe = os.path.join("dist", f"Grammarlot{exe_ext}")
    
    if os.path.exists(src_exe):
        # Mac creates a .app folder, Windows/Linux create a file. Handle both!
        if os.path.isdir(src_exe):
            if os.path.exists(dst_exe): shutil.rmtree(dst_exe)
            shutil.copytree(src_exe, dst_exe)
        else:
            shutil.copy2(src_exe, dst_exe)
        print(f"\n✅ Build Complete! Executable is ready at: {dst_exe}")
    else:
        print("\n❌ Error: Could not find the compiled executable.")

    for temp_dir in [os.path.join("backend", "build"), os.path.join("backend", "dist")]:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            
    spec_file = os.path.join("backend", "Grammarlot.spec")
    if os.path.exists(spec_file):
        os.remove(spec_file)
        
    if os.path.exists("icon.ico"):
        os.remove("icon.ico")

if __name__ == "__main__":
    build_app()