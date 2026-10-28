const session = require('express-session');
const bcrypt = require('bcryptjs');

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  } else {
    // Check if this is an API request or HTML request
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    } else {
      // Store the original URL for redirect after login
      req.session.redirectUrl = req.originalUrl;
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

// Authentication routes
function registerAuthRoutes(app) {
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
      
        // Get the redirect URL if it exists
        const redirectUrl = req.session.redirectUrl || '/admin';
        // Clear the redirect URL from session
        delete req.session.redirectUrl;
      
        res.json({ 
          success: true, 
          message: 'Authentication successful',
          username: username,
          redirectUrl: redirectUrl
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
      const redirectUrl = req.session.redirectUrl;
      // Clear redirect URL if it exists
      if (redirectUrl) {
        delete req.session.redirectUrl;
      }
    
      res.json({ 
        authenticated: true, 
        username: req.session.username,
        redirectUrl: redirectUrl || '/admin'
      });
    } else {
      res.json({ authenticated: false });
    }
  });
}

module.exports = { sessionMiddleware, requireAuth, registerAuthRoutes };
