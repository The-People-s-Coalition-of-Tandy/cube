const WebSocket = require('ws');

// Store connected viewers and their positions
const viewers = new Map();

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

module.exports = { viewers, broadcastToOthers, broadcastToAll };
