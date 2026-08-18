Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Athena"

' Start the Athena Server (hidden window)
WshShell.Run "cmd /c npm.cmd run server", 0, False

' Wait 5 seconds for server to be ready
WScript.Sleep 5000

' Start the Localtunnel (hidden window)
WshShell.Run "cmd /c npx.cmd localtunnel --port 3000 --subdomain my-athena-brain", 0, False

' Start the Desktop Node (hidden window)
WshShell.Run "cmd /c npm.cmd run node", 0, False
