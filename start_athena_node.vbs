Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Athena"
WshShell.Run "npx.cmd tsx src/node/index.ts", 0, False
