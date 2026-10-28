const { viewers, broadcastToOthers, broadcastToAll } = require('./viewers');
const { stats } = require('./stats');

function setupWebSocket(wss, configManager) {
  // WebSocket connection handling
  wss.on('connection', (ws) => {
    const viewerId = generateViewerId();
    stats.connectionsTotal++;
    console.log(`Viewer ${viewerId} connected (Total: ${viewers.size + 1})`);
  
    // Initialize viewer data
    viewers.set(viewerId, {
      id: viewerId,
      position: [0, 1, 2], // Default starting position
      name: generateRandomName(), // Will be updated when user sends their data
      color: generateRandomColor(), // Will be updated when user sends their data
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
    ws.on('message', async (message) => {
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
        } else if (data.type === 'ping') {
          // Handle heartbeat ping
          if (viewers.has(viewerId)) {
            viewers.get(viewerId).lastUpdate = Date.now();
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } else if (data.type === 'set_user_data') {
          // Handle user data update (username and color from character selection)
          const viewer = viewers.get(viewerId);
          if (viewer && data.username && data.color) {
            viewer.name = data.username;
            // Convert color string to RGB array format
            viewer.color = hexToRgb(data.color);
            viewer.lastUpdate = Date.now();
          
            console.log(`Viewer ${viewerId} set username to "${data.username}" with color ${data.color}`);
          
            // Broadcast updated viewer info to all other viewers
            broadcastToOthers(viewerId, {
              type: 'viewer_updated',
              viewer: {
                id: viewerId,
                position: viewer.position,
                name: viewer.name,
                color: viewer.color
              }
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
        } else if (data.type === 'realtime_config_update') {
          // Handle real-time configuration updates from admin panel
          if (data.config) {
            console.log('Broadcasting real-time config update:', data.config);
          
            // Broadcast config update to all viewers (for immediate visual updates)
            broadcastToAll({
              type: 'config_update',
              config: data.config,
              updatedBy: 'admin_realtime',
              timestamp: Date.now()
            });
          }
        } else if (data.type === 'lighting_update') {
          // Handle lighting updates from admin panel
          if (data.lighting) {
            console.log('💡 Broadcasting lighting update:', data.lighting);
          
            // Save lighting configuration to config file
            try {
              const currentConfig = configManager.getConfig();
              if (!currentConfig.scene) {
                currentConfig.scene = {};
              }
              if (!currentConfig.scene.lighting) {
                currentConfig.scene.lighting = {};
              }
            
              // Update the lighting configuration
              currentConfig.scene.lighting.lights = data.lighting.lights;
              currentConfig.scene.lighting.activeLightIndex = data.lighting.activeLightIndex;
            
              // Save the updated configuration
              await configManager.saveConfig();
              console.log('💡 Lighting configuration saved to config file');
            } catch (error) {
              console.error('Error saving lighting configuration:', error);
            }
          
            // Broadcast lighting update to all viewers (for immediate visual updates)
            broadcastToAll({
              type: 'lighting_update',
              lighting: data.lighting,
              updatedBy: 'admin',
              timestamp: Date.now()
            });
          }
        } else if (data.type === 'background_update') {
          // Handle background/skybox updates from admin panel
          if (data.background) {
            console.log('🌌 Broadcasting background update:', data.background);
          
            // Save background configuration to config file
            try {
              const currentConfig = configManager.getConfig();
              if (!currentConfig.scene) {
                currentConfig.scene = {};
              }
            
              // Update the background configuration
              currentConfig.scene.useSkybox = data.background.useSkybox;
              currentConfig.scene.backgroundMode = data.background.mode;
            
              // Save the updated configuration
              await configManager.saveConfig();
              console.log('🌌 Background configuration saved to config file');
            } catch (error) {
              console.error('Error saving background configuration:', error);
            }
          
            // Broadcast background update to all viewers (for immediate visual updates)
            broadcastToAll({
              type: 'background_update',
              background: data.background,
              updatedBy: 'admin',
              timestamp: Date.now()
            });
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
}

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
  return [Math.random(), Math.random(), Math.random()];
}

function hexToRgb(hex) {
  // Handle the specific colors from character selection
  const colorMap = {
    '#ff4444': [1.0, 0.27, 0.27],     // red
    '#44ff44': [0.27, 1.0, 0.27],     // green
    '#4444ff': [0.27, 0.27, 1.0],     // blue
    '#ffff44': [1.0, 1.0, 0.27],      // yellow
    '#ff44ff': [1.0, 0.27, 1.0],      // magenta
    '#44ffff': [0.27, 1.0, 1.0],      // cyan
    '#ff8844': [1.0, 0.53, 0.27],     // orange
    '#8844ff': [0.53, 0.27, 1.0]      // purple
  };
  
  if (colorMap[hex]) {
    return colorMap[hex];
  }
  
  // Fallback: try to parse as hex color
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [Math.random(), Math.random(), Math.random()]; // Random fallback
}

module.exports = { setupWebSocket };
