const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// Add JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    // Check if this is an API request or HTML request
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    } else {
      // Redirect HTML requests to login page
      return res.redirect('/login.html');
    }
  }
}

// Hash the admin password on startup
let hashedAdminPassword;
(async () => {
  hashedAdminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'defaultpassword', 10);
})();

// Configuration Management
class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, 'config.json');
    this.config = null;
    this.loadConfig();
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      console.log('Configuration loaded from file');
    } catch (error) {
      console.log('No config file found, creating default configuration');
      this.config = this.getDefaultConfig();
      await this.saveConfig();
    }
  }

  getDefaultConfig() {
    return {
      video: {
        m3u8Url: "https://euw13.playlist.ttvnw.net/v1/playlist/Cr0EolXzPmxgENJh-XhvsQqJdTbzIGm3mfNhPxYPHaF6UB78fxYQHeczDf1iThVq4JuVnBf5kwGfODX-tzhqW2WHmLmbfODl5L7jICP_E818A0pBiu22hW_5tfOaljlN93Mm2K7vv9X-_A_ZOhHZ-FQeExY9whK9rgIwQn4UzOh8vuoEJ_NtPXtIMCobfgQRagzSDyrIdgyiQ6jKgycfYIKCmcML5gv2IIRn16jaVptV8Dn33tcn_GLNxsvaWIKL7_Dxx7NWIlAmeYP98iJmLvwviSCcLPgN_E75jBhcnKaqjlSqXo_4d6O2EuUw0bqjiGarii71FRj9KikwPX8n83obDr4aTssXWMABCu7eOwiFrpccWqD5LRxNepW1AcO5IY4xMvW-PujLH-YkwvRq8GJBWeIo8ZGCozE0JcCzTnh6I1ErZo0_sxjqoCeg5ZkgG6YmfVotVv-hvujc3LYLLW5yuoxipwIALoeEbLzZbkQO6C2dP6lRspTe_9hvZZzp-Q22M_-mAyy9fRoi5disliXgXgpxEqd7utwjESHrbu2MFtpF70mVcGaABCrcxfwngDky5c0GWJL3Qy3U2gdOQeZ4H5KpTJlttig8a4F9IgBNYvw6bVBYu0c6FWPhfOzlL4GepMePL2ol9pnnmdGTg9Y68VLI3wYz2WEU6O59BaqD_-a7i7F67Eae2Se5SBgWHplnJoNeHbmdIqYdPmeksEmEVFtIYUy4-yg9enEjSYMF-xzg-vEQGFbZ---3Zv-AGgzrnG-A-ZrNkw5XUmMgASoJZXUtd2VzdC0yMLcM.m3u8",
        chromaKey: {
          enabled: true,
          color: [0.0, 1.0, 0.0], // Green by default instead of black
          threshold: 0.3,
          featherEdge: 0.1
        },
        brightness: 1.0,
        contrast: 1.0,
        saturation: 1.0
      },
      scene: {
        lighting: {
          position: [3.0, 3.5, 3.0],
          color: [1.0, 1.0, 1.0, 1.0],
          brightness: 3.0
        }
      },
      lastUpdated: Date.now(),
      version: 1
    };
  }

  async saveConfig() {
    try {
      this.config.lastUpdated = Date.now();
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('Configuration saved to file');
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  async updateConfig(newConfig, source = 'unknown') {
    // Merge new config with existing config
    this.config = {
      ...this.config,
      ...newConfig,
      lastUpdated: Date.now()
    };
    
    await this.saveConfig();
    
    console.log(`Configuration updated by ${source}`);
    
    // Broadcast to all connected clients
    broadcastToAll({
      type: 'config_update',
      config: this.config,
      updatedBy: source,
      timestamp: Date.now()
    });
  }

  getConfig() {
    return this.config;
  }
}

// Initialize configuration manager
const configManager = new ConfigManager();

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

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check credentials
    const validUsername = username === process.env.ADMIN_USERNAME;
    const validPassword = await bcrypt.compare(password, hashedAdminPassword);
    
    if (validUsername && validPassword) {
      req.session.authenticated = true;
      req.session.username = username;
      res.json({ 
        success: true, 
        message: 'Authentication successful',
        username: username
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ 
      authenticated: true, 
      username: req.session.username 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// API Routes
app.get('/api/config', (req, res) => {
  res.json(configManager.getConfig());
});

// Protected admin endpoint
app.post('/api/config', requireAuth, async (req, res) => {
  try {
    await configManager.updateConfig(req.body, req.session.username || 'admin');
    res.json({ 
      success: true, 
      config: configManager.getConfig(),
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Admin panel route (protected)
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// Login page route
app.get('/login.html', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// Root route - serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Stats endpoint for monitoring (protected)
app.get('/stats', requireAuth, (req, res) => {
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