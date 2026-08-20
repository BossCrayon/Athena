@echo off
echo Starting Athena Local Server...
cd C:\Athena
start "Athena Server" cmd /c "npm run server"

echo Starting Localtunnel...
start "Athena Tunnel" cmd /c "npx localtunnel --port 3000 --subdomain my-athena-brain"

echo Athena is now running and tunneled to: wss://athena-brain.onrender.com

echo Starting Desktop Node...
start "Athena Node" cmd /c "npm run node"

timeout /t 5
