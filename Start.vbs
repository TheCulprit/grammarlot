Set WshShell = CreateObject("WScript.Shell")
' The "0" tells Windows to completely hide the window.
' The "False" tells the script not to wait for the program to finish before closing itself.
WshShell.Run "uv run grammarlot.pyw", 0, False