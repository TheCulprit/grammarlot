#!/usr/bin/env bash

# Navigate to the folder where this script is located
cd "$(dirname "$0")"

# Run the python background manager detached from the terminal
# The '&' sends it to the background, 'nohup' keeps it alive if the terminal closes
nohup uv run python grammarlot.pyw > /dev/null 2>&1 &

echo "✨ Grammarlot is starting in the background!"
echo "Look for the green icon in your system tray/menu bar."