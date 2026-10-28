const fs = require('fs').promises;


// Configuration Management
class ConfigManager {
  constructor(configPath, broadcast) {
    this.configPath = configPath;
    this.broadcast = broadcast;
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
      orbs: [
        { position: [0, 0, 2], color: [1, 0, 0], radius: 0.1 },
        { position: [1, 0, 2], color: [0, 1, 0], radius: 0.1 },
        { position: [-1, 0, 2], color: [0, 0, 1], radius: 0.1 },
        { position: [0, 1, 2], color: [1, 1, 0], radius: 0.1 },
        { position: [0, -1, 2], color: [1, 0, 1], radius: 0.1 },
        { position: [0, 0, 3], color: [0, 1, 1], radius: 0.1 }
      ],
      plane: {
        position: [0, 0, 0.5],
        size: [1, 1]
      },
      chromaKey: {
        color: [0, 1, 0],
        threshold: 0.4,
        enabled: true
      },
      lighting: {
        positions: [[3, 3.5, 3], [0, 5, 0], [-3, 2, 3], [0, -2, 5]],
        colors: [[1, 1, 1], [1, 0.8, 0.6], [0.8, 0.8, 1], [1, 0.9, 0.7]],
        intensities: [3, 2.5, 2, 2.8],
        effects: [0, 1, 2, 3],
        activeLightIndex: 0,
        enabled: [true, true, true, true]
      },
      background: {
        useSkybox: false  // Default to black background (no skybox, no tunnel)
      }
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
    this.broadcast({
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

module.exports = ConfigManager;
