const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config();

// Loaded after dotenv so they see the .env values
const { sessionMiddleware, registerAuthRoutes } = require('./server/auth');
const ConfigManager = require('./server/config-manager');
const { broadcastToAll } = require('./server/viewers');
const { startStatsLogging } = require('./server/stats');
const { registerRoutes } = require('./server/routes');
const { setupWebSocket } = require('./server/websocket');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// Add JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(sessionMiddleware);

// Initialize configuration manager
const configManager = new ConfigManager(path.join(__dirname, 'config.json'), broadcastToAll);

startStatsLogging();

// Middleware and route order matters: static files, then auth, then API/pages, then 404
app.use(express.static('public'));
registerAuthRoutes(app);
registerRoutes(app, configManager);

setupWebSocket(wss, configManager);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 Access your app at: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time viewer tracking`);
});
