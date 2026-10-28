const fs = require('fs').promises;
const path = require('path');
const { requireAuth } = require('./auth');
const { viewers } = require('./viewers');
const { stats } = require('./stats');

// Repo root, so file paths match what server.js used before it was split up
const ROOT = path.join(__dirname, '..');

function registerRoutes(app, configManager) {
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
    res.sendFile(ROOT + '/public/admin.html');
  });

  // Calendar admin route (protected)
  app.get('/calendar', requireAuth, (req, res) => {
    res.sendFile(ROOT + '/public/calendar.html');
  });

  // Events API routes
  app.get('/api/events', async (req, res) => {
    try {
      const eventsPath = path.join(ROOT, 'public', 'events.json');
      const data = await fs.readFile(eventsPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      console.error('Error loading events:', error);
      // Return default structure if file doesn't exist
      res.json({
        events: []
      });
    }
  });

  app.post('/api/events', requireAuth, async (req, res) => {
    try {
      const eventsData = req.body;
    
      // Sort events by datetime - upcoming events first (closest to now)
      if (eventsData.events && Array.isArray(eventsData.events)) {
        const now = new Date();
        eventsData.events.sort((a, b) => {
          // Try to use datetime field first, fall back to date field
          const dateA = a.datetime ? new Date(a.datetime) : new Date(a.date);
          const dateB = b.datetime ? new Date(b.datetime) : new Date(b.date);
        
          // Handle invalid dates by putting them at the end
          if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
          if (isNaN(dateA.getTime())) return 1;
          if (isNaN(dateB.getTime())) return -1;
        
          // Sort by closest to current time (upcoming events first)
          const diffA = Math.abs(dateA - now);
          const diffB = Math.abs(dateB - now);
        
          // If both are in the future or both are in the past, sort by date
          if ((dateA >= now && dateB >= now) || (dateA < now && dateB < now)) {
            return dateA - dateB;
          }
        
          // Prioritize future events over past events
          if (dateA >= now && dateB < now) return -1;
          if (dateA < now && dateB >= now) return 1;
        
          return diffA - diffB;
        });
      }
    
      const eventsPath = path.join(ROOT, 'public', 'events.json');
      await fs.writeFile(eventsPath, JSON.stringify(eventsData, null, 2));
      console.log('Events updated by', req.session.username || 'admin');
      res.json({ success: true, message: 'Events updated successfully' });
    } catch (error) {
      console.error('Error saving events:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Live Event Override API routes
  app.get('/api/live-event', async (req, res) => {
    try {
      const liveEventPath = path.join(ROOT, 'public', 'live-event.json');
      const data = await fs.readFile(liveEventPath, 'utf8');
      const liveEvent = JSON.parse(data);
    
      // Check if the live event is still valid (not too old)
      if (liveEvent.timestamp) {
        const eventTime = new Date(liveEvent.timestamp);
        const now = new Date();
        const hoursSinceSet = (now - eventTime) / (1000 * 60 * 60);
      
        // Auto-expire live events after 6 hours
        if (hoursSinceSet > 6) {
          // Delete the expired live event
          await fs.unlink(liveEventPath);
          return res.json(null);
        }
      }
    
      res.json(liveEvent);
    } catch (error) {
      // No live event file exists or error reading it
      res.json(null);
    }
  });

  app.post('/api/live-event', requireAuth, async (req, res) => {
    try {
      const liveEvent = {
        ...req.body,
        timestamp: new Date().toISOString(),
        setBy: req.session.username || 'admin'
      };
    
      const liveEventPath = path.join(ROOT, 'public', 'live-event.json');
      await fs.writeFile(liveEventPath, JSON.stringify(liveEvent, null, 2));
      console.log('Live event set by', req.session.username || 'admin', ':', liveEvent.name);
      res.json({ success: true, message: 'Live event set successfully' });
    } catch (error) {
      console.error('Error setting live event:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/live-event', requireAuth, async (req, res) => {
    try {
      const liveEventPath = path.join(ROOT, 'public', 'live-event.json');
      await fs.unlink(liveEventPath);
      console.log('Live event cleared by', req.session.username || 'admin');
      res.json({ success: true, message: 'Live event cleared successfully' });
    } catch (error) {
      // File doesn't exist, which is fine
      res.json({ success: true, message: 'Live event cleared successfully' });
    }
  });

  // Login page route
  app.get('/login.html', (req, res) => {
    res.sendFile(ROOT + '/public/login.html');
  });

  // Root route - serve the HTML page
  app.get('/', (req, res) => {
    res.sendFile(ROOT + '/public/index.html');
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
}

module.exports = { registerRoutes };
