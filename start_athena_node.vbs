Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Athena"
WshShell.Run "npm.cmd run node", 0, False
