#!/bin/bash
# Start backend
cd /home/aziza/injusticereformnetwork/server
node index.js &

# Start frontend
cd /home/aziza/injusticereformnetwork
npm run dev &

# Wait a second for servers to spin up
sleep 2

# Open in default browser
xdg-open http://localhost:5173
