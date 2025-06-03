const express = require('express');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// Store connected viewers and their positions
const viewers = new Map();

// Performance monitoring
const stats = {
    connectionsTotal: 0,
    disconnectionsTotal: 0,
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    startTime: Date.now(),
    peakConnections: 0
};

function logStats() {
    const uptime = Math.round((Date.now() - stats.startTime) / 1000);
    const currentConnections = viewers.size;
    const memUsage = process.memoryUsage();
    
    console.log('\n=== SERVER STATS ===');
    console.log(`Uptime: ${uptime}s`);
    console.log(`Current Connections: ${currentConnections}`);
    console.log(`Peak Connections: ${stats.peakConnections}`);
    console.log(`Total Connections: ${stats.connectionsTotal}`);
    console.log(`Total Disconnections: ${stats.disconnectionsTotal}`);
    console.log(`Messages Received: ${stats.messagesReceived}`);
    console.log(`Messages Sent: ${stats.messagesSent}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`Messages/sec: ${Math.round(stats.messagesReceived / uptime)}`);
    console.log('==================\n');
}

// Log stats every 10 seconds
setInterval(logStats, 10000);

// Serve static files
app.use(express.static('public'));

// Root route - serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Stats endpoint for monitoring
app.get('/stats', (req, res) => {
    const uptime = Math.round((Date.now() - stats.startTime) / 1000);
    const memUsage = process.memoryUsage();
    
    res.json({
        uptime: uptime,
        currentConnections: viewers.size,
        peakConnections: stats.peakConnections,
        totalConnections: stats.connectionsTotal,
        totalDisconnections: stats.disconnectionsTotal,
        messagesReceived: stats.messagesReceived,
        messagesSent: stats.messagesSent,
        errors: stats.errors,
        memoryUsage: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
        },
        messagesPerSecond: Math.round(stats.messagesReceived / uptime)
    });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).send('<h1>404 - Page Not Found</h1>');
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  const viewerId = generateViewerId();
  stats.connectionsTotal++;
  console.log(`Viewer ${viewerId} connected (Total: ${viewers.size + 1})`);
  
  // Initialize viewer data
  viewers.set(viewerId, {
    id: viewerId,
    position: [0, 1, 2], // Default starting position
    name: generateRandomName(),
    color: generateRandomColor(),
    lastUpdate: Date.now(),
    ws: ws
  });
  
  // Update peak connections
  if (viewers.size > stats.peakConnections) {
    stats.peakConnections = viewers.size;
  }
  
  // Send initial data to new viewer
  ws.send(JSON.stringify({
    type: 'init',
    viewerId: viewerId,
    viewers: Array.from(viewers.values()).map(v => ({
      id: v.id,
      position: v.position,
      name: v.name,
      color: v.color
    }))
  }));
  stats.messagesSent++;
  
  // Broadcast new viewer to all other viewers
  broadcastToOthers(viewerId, {
    type: 'viewer_joined',
    viewer: {
      id: viewerId,
      position: viewers.get(viewerId).position,
      name: viewers.get(viewerId).name,
      color: viewers.get(viewerId).color
    }
  });
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      stats.messagesReceived++;
      const data = JSON.parse(message);
      
      if (data.type === 'position_update') {
        // Update viewer position
        const viewer = viewers.get(viewerId);
        if (viewer) {
          viewer.position = data.position;
          viewer.lastUpdate = Date.now();
          
          // Broadcast position update to all other viewers
          broadcastToOthers(viewerId, {
            type: 'position_update',
            viewerId: viewerId,
            position: data.position
          });
        }
      } else if (data.type === 'chat_message') {
        // Handle chat messages
        const viewer = viewers.get(viewerId);
        if (viewer && data.message && data.message.trim()) {
          const chatMessage = {
            type: 'chat_message',
            viewerId: viewerId,
            name: viewer.name,
            color: viewer.color,
            message: data.message.trim(),
            timestamp: Date.now()
          };
          
          // Broadcast chat message to all viewers (including sender)
          broadcastToAll(chatMessage);
        }
      }
    } catch (error) {
      stats.errors++;
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    stats.disconnectionsTotal++;
    console.log(`Viewer ${viewerId} disconnected (Remaining: ${viewers.size - 1})`);
    viewers.delete(viewerId);
    
    // Broadcast viewer left to all remaining viewers
    broadcastToAll({
      type: 'viewer_left',
      viewerId: viewerId
    });
  });
  
  // Handle errors
  ws.on('error', (error) => {
    stats.errors++;
    console.error(`WebSocket error for viewer ${viewerId}:`, error);
  });
});

// Utility functions
function generateViewerId() {
  return Math.random().toString(36).substr(2, 9);
}

function generateRandomName() {
  const names = [
    "umru", "ryjelsum", "qui.et", "lost_in_the_loop", "npnc", "theresa_sweetheart", 
    "edude92", "tristan", "Crenchwater", "erowidfan", "ButitsAlex", "visitor", 
    "explorer", "wanderer", "observer", "guest"
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function generateRandomColor() {
  return [
    Math.random() * 0.5 + 0.5, // Brighter colors (0.5 - 1.0)
    Math.random() * 0.5 + 0.5,
    Math.random() * 0.5 + 0.5
  ];
}

function broadcastToOthers(excludeViewerId, message) {
  viewers.forEach((viewer, id) => {
    if (id !== excludeViewerId && viewer.ws.readyState === WebSocket.OPEN) {
      viewer.ws.send(JSON.stringify(message));
    }
  });
}

function broadcastToAll(message) {
  viewers.forEach((viewer) => {
    if (viewer.ws.readyState === WebSocket.OPEN) {
      viewer.ws.send(JSON.stringify(message));
    }
  });
}

// Clean up inactive viewers (optional)
setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 1 minute timeout
  
  viewers.forEach((viewer, id) => {
    if (now - viewer.lastUpdate > timeout) {
      console.log(`Removing inactive viewer ${id}`);
      viewer.ws.terminate();
      viewers.delete(id);
      broadcastToAll({
        type: 'viewer_left',
        viewerId: id
      });
    }
  });
}, 30000); // Check every 30 seconds

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 Access your app at: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time viewer tracking`);
}); 