// Configuration state
let currentConfig = null;
let ws = null;

// Debounce timer for config writes
let configWriteTimeout = null;

// Global variable to track if we're currently sending a real-time update
let isUpdating = false;

// Gamepad support variables
let gamepadConnected = false;
let gamepadIndex = -1;
let gamepadUpdateInterval = null;
let lastGamepadState = null;

// Lighting system state
let lightingSystem = {
    lights: [
        { position: [3.0, 3.5, 3.0], color: [1.0, 1.0, 1.0], intensity: 3.0, effect: 1, enabled: true },
        { position: [3.0, 3.5, 3.0], color: [1.0, 1.0, 1.0], intensity: 3.0, effect: 0, enabled: false },
        { position: [3.0, 3.5, 3.0], color: [1.0, 1.0, 1.0], intensity: 3.0, effect: 0, enabled: false },
        { position: [3.0, 3.5, 3.0], color: [1.0, 1.0, 1.0], intensity: 3.0, effect: 0, enabled: false }
    ],
    activeLightIndex: 0
};

// Background system state
let backgroundSystem = {
    currentMode: 'black', // Default to black
    
    init() {
        // Set up event listeners for background buttons
        document.getElementById('tunnelBtn').addEventListener('click', () => {
            this.setMode('tunnel');
        });
        
        document.getElementById('skyboxBtn').addEventListener('click', () => {
            this.setMode('skybox');
        });
        
        document.getElementById('blackBtn').addEventListener('click', () => {
            this.setMode('black');
        });
        
        // Update UI to reflect current mode
        this.updateUI();
    },
    
    setMode(mode) {
        this.currentMode = mode;
        this.updateUI();
        this.sendUpdate();
    },
    
    updateUI() {
        // Update button states
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (this.currentMode === 'tunnel') {
            document.getElementById('tunnelBtn').classList.add('active');
            document.getElementById('backgroundStatus').textContent = 'Status: 🌀 Tunnel Shader Active';
        } else if (this.currentMode === 'skybox') {
            document.getElementById('skyboxBtn').classList.add('active');
            document.getElementById('backgroundStatus').textContent = 'Status: 🌌 Cubemap Skybox Active';
        } else {
            document.getElementById('blackBtn').classList.add('active');
            document.getElementById('backgroundStatus').textContent = 'Status: ⚫ Black Background Active';
        }
    },
    
    sendUpdate() {
        // Send to server with correct format expected by main application
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'background_update',
                background: {
                    mode: this.currentMode
                }
            }));
            console.log('Background update sent:', { mode: this.currentMode });
        }
    }
};

// Initialize everything when page loads
function initializeAdmin() {
    console.log('🚀 Initializing admin panel...');
    
    // Initialize all systems
    initializeWebSocket();
    initializeControls();
    backgroundSystem.init(); // Initialize background system
    
    // Load initial configuration
    loadConfiguration();
    
    console.log('✅ Admin panel initialized');
}

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    initializeWebSocket();
    loadCurrentConfig();
    setupEventListeners();
    initializeGamepad();
    initializeLightingControls();
    backgroundSystem.init(); // Initialize background system here instead of separate function
    logActivity('Admin panel loaded');
});

// Check authentication status
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (!data.authenticated) {
            // Not authenticated, redirect to login
            window.location.href = '/login.html';
            return;
        }
        
        // Update UI with current user
        document.getElementById('currentUser').textContent = data.username || 'admin';
        logActivity(`Authenticated as ${data.username || 'admin'}`);
    } catch (error) {
        console.error('Authentication check failed:', error);
        window.location.href = '/login.html';
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            logActivity('Logged out successfully');
            window.location.href = '/login.html';
        } else {
            showNotification('Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout error', 'error');
    }
}

// WebSocket connection for real-time updates
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        updateConnectionStatus(true);
        logActivity('WebSocket connected');
    };
    
    ws.onclose = function() {
        updateConnectionStatus(false);
        logActivity('WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(initializeWebSocket, 3000);
    };
    
    ws.onerror = function(error) {
        logActivity('WebSocket error: ' + error);
        updateConnectionStatus(false);
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'configUpdate') {
                logActivity('Configuration updated remotely');
                loadCurrentConfig();
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };
}

// Load current configuration from server
async function loadCurrentConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        currentConfig = data;
        updateUIFromConfig(data);
        updateLastUpdateTime();
        
        // Ensure lighting UI is updated after config is loaded
        if (data.scene && data.scene.lighting) {
            updateLightingUI();
        }
        
        logActivity('Configuration loaded');
    } catch (error) {
        showNotification('Failed to load configuration', 'error');
        logActivity('Error loading configuration: ' + error.message);
    }
}

// Update UI elements from configuration
function updateUIFromConfig(config) {
    if (!config.video) return;
    
    // Video settings
    document.getElementById('streamUrl').value = config.video.m3u8Url || '';
    document.getElementById('brightness').value = config.video.brightness || 1;
    document.getElementById('contrast').value = config.video.contrast || 1;
    document.getElementById('saturation').value = config.video.saturation || 1;
    
    // Update range value displays
    document.getElementById('brightnessValue').value = (config.video.brightness || 1).toFixed(1);
    document.getElementById('contrastValue').value = (config.video.contrast || 1).toFixed(1);
    document.getElementById('saturationValue').value = (config.video.saturation || 1).toFixed(1);
    
    // Chroma key settings
    if (config.video.chromaKey) {
        document.getElementById('chromaEnabled').checked = config.video.chromaKey.enabled || false;
        document.getElementById('chromaR').value = config.video.chromaKey.color[0] || 0;
        document.getElementById('chromaG').value = config.video.chromaKey.color[1] || 1;
        document.getElementById('chromaB').value = config.video.chromaKey.color[2] || 0;
        document.getElementById('chromaThreshold').value = config.video.chromaKey.threshold || 0.3;
        document.getElementById('thresholdValue').value = (config.video.chromaKey.threshold || 0.3).toFixed(2);
    }

    // Video plane settings
    if (config.videoPlane) {
        document.getElementById('videoPlaneSize').value = config.videoPlane.size || 0.5;
        document.getElementById('videoPlaneSizeValue').value = (config.videoPlane.size || 0.5).toFixed(2);
        
        if (config.videoPlane.position) {
            document.getElementById('videoPlanePositionX').value = config.videoPlane.position[0] || 0;
            document.getElementById('videoPlanePositionY').value = config.videoPlane.position[1] || 1.12;
            document.getElementById('videoPlanePositionZ').value = config.videoPlane.position[2] || 0;
            
            document.getElementById('videoPlanePositionXValue').value = (config.videoPlane.position[0] || 0).toFixed(2);
            document.getElementById('videoPlanePositionYValue').value = (config.videoPlane.position[1] || 1.12).toFixed(2);
            document.getElementById('videoPlanePositionZValue').value = (config.videoPlane.position[2] || 0).toFixed(2);
        }
    }
    
    // Lighting settings
    if (config.scene && config.scene.lighting) {
        const lighting = config.scene.lighting;
        if (lighting.lights) {
            lightingSystem.lights = lighting.lights;
        }
        if (lighting.activeLightIndex !== undefined) {
            lightingSystem.activeLightIndex = lighting.activeLightIndex;
        }
        updateLightingUI();
    }
    
    // Update version
    document.getElementById('configVersion').textContent = config.version || 1;
}

// Setup event listeners
function setupEventListeners() {
    // Range sliders with their specific configurations
    const rangeConfigs = [
        { id: 'brightness', decimals: 1 },
        { id: 'contrast', decimals: 1 },
        { id: 'saturation', decimals: 1 },
        { id: 'chromaThreshold', valueId: 'thresholdValue', decimals: 2, realTime: true },
        { id: 'videoPlaneSize', decimals: 2, realTime: true },
        { id: 'videoPlanePositionX', decimals: 2, realTime: true },
        { id: 'videoPlanePositionY', decimals: 2, realTime: true },
        { id: 'videoPlanePositionZ', decimals: 2, realTime: true }
    ];
    
    rangeConfigs.forEach(config => {
        const slider = document.getElementById(config.id);
        const valueDisplayId = config.valueId || (config.id + 'Value');
        const valueDisplay = document.getElementById(valueDisplayId);
        
        if (slider && valueDisplay) {
            // Convert value display to input if it's not already
            if (valueDisplay.tagName !== 'INPUT') {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'range-value-input';
                input.id = valueDisplayId;
                input.value = parseFloat(slider.value).toFixed(config.decimals);
                valueDisplay.parentNode.replaceChild(input, valueDisplay);
                
                // Add event listener for direct input
                input.addEventListener('blur', function() {
                    const newValue = parseFloat(this.value);
                    const min = parseFloat(slider.min);
                    const max = parseFloat(slider.max);
                    
                    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
                        slider.value = newValue;
                        this.value = newValue.toFixed(config.decimals);
                        
                        if (config.realTime) {
                            if (config.id.startsWith('videoPlane')) {
                                updateVideoPlaneRealTime();
                            } else if (config.id === 'chromaThreshold') {
                                updateChromaKeyRealTime();
                            }
                        }
                    } else {
                        // Reset to slider value if invalid
                        this.value = parseFloat(slider.value).toFixed(config.decimals);
                    }
                });
                
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        this.blur();
                    }
                });
            }
            
            // Function to handle slider updates
            const updateSlider = function() {
                // Update value display immediately
                const valueInput = document.getElementById(valueDisplayId);
                if (valueInput) {
                    valueInput.value = parseFloat(slider.value).toFixed(config.decimals);
                }
                
                // Handle real-time updates
                if (config.realTime) {
                    if (config.id.startsWith('videoPlane')) {
                        updateVideoPlaneRealTime();
                    } else if (config.id === 'chromaThreshold') {
                        updateChromaKeyRealTime();
                    }
                }
            };
            
            // Add multiple event listeners to ensure continuous updates
            slider.addEventListener('input', updateSlider);
            slider.addEventListener('change', updateSlider);
            
            // For real-time controls, add mouse and touch events
            if (config.realTime) {
                slider.addEventListener('mousemove', function(e) {
                    // Only update if mouse is pressed (dragging)
                    if (e.buttons === 1) {
                        updateSlider();
                    }
                });
                
                slider.addEventListener('touchmove', updateSlider);
                
                // Also listen for pointer events (modern browsers)
                slider.addEventListener('pointermove', function(e) {
                    if (e.buttons === 1) {
                        updateSlider();
                    }
                });
            }
        }
    });

    // Add real-time listeners for chroma key controls
    const chromaControls = ['chromaEnabled', 'chromaR', 'chromaG', 'chromaB'];
    chromaControls.forEach(controlId => {
        const control = document.getElementById(controlId);
        if (control) {
            if (control.type === 'checkbox') {
                control.addEventListener('change', updateChromaKeyRealTime);
            } else {
                control.addEventListener('input', updateChromaKeyRealTime);
                control.addEventListener('change', updateChromaKeyRealTime);
            }
        }
    });
}

// Real-time video plane updates with debounced file writes
function updateVideoPlaneRealTime() {
    // Prevent overlapping updates
    if (isUpdating) {
        return;
    }
    isUpdating = true;
    
    console.log("updateVideoPlaneRealTime function triggered:", document.getElementById('videoPlaneSize').value, document.getElementById('videoPlanePositionX').value, document.getElementById('videoPlanePositionY').value, document.getElementById('videoPlanePositionZ').value);
    
    // Create the configuration update
    const realtimeConfig = {
        videoPlane: {
            size: parseFloat(document.getElementById('videoPlaneSize').value),
            position: [
                parseFloat(document.getElementById('videoPlanePositionX').value),
                parseFloat(document.getElementById('videoPlanePositionY').value),
                parseFloat(document.getElementById('videoPlanePositionZ').value)
            ]
        }
    };
    
    console.log('📦 Real-time config object:', realtimeConfig);
    
    // Send immediate update via WebSocket (if connected) - NEVER block this
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            type: 'realtime_config_update',
            config: realtimeConfig
        };
        console.log('📡 Sending WebSocket message:', message);
        console.log('🔌 WebSocket state:', ws.readyState, '(1 = OPEN)');
        
        // Use setTimeout to ensure this never blocks
        setTimeout(() => {
            try {
                ws.send(JSON.stringify(message));
                console.log('✅ Message sent successfully');
            } catch (error) {
                console.error('❌ Failed to send WebSocket message:', error);
            }
            // Reset the updating flag after WebSocket send
            isUpdating = false;
        }, 0);
    } else {
        console.log('❌ WebSocket not connected, readyState:', ws ? ws.readyState : 'null');
        console.log('🔌 WebSocket states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED');
        isUpdating = false;
    }
    
    // Debounce file writes (save to JSON after 200ms of no changes - reduced from 500ms)
    clearTimeout(configWriteTimeout);
    configWriteTimeout = setTimeout(async () => {
        try {
            console.log('💾 Saving config to file after debounce...');
            
            // Use fetch with a shorter timeout to prevent blocking
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
            
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(realtimeConfig),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const result = await response.json();
            if (result.success) {
                // Don't log for real-time updates - too spammy
                console.log('✅ Config saved to file successfully');
            } else {
                console.log('❌ Failed to save config to file:', result);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('⏰ Config save request timed out - continuing with real-time updates');
            } else {
                logActivity('Error saving video plane config: ' + error.message);
                console.error('❌ Error saving config to file:', error);
            }
        }
    }, 200); // Reduced from 500ms to 200ms
}

// Real-time chroma key updates with debounced file writes
function updateChromaKeyRealTime() {
    // Prevent overlapping updates
    if (isUpdating) {
        return;
    }
    isUpdating = true;
    
    console.log("updateChromaKeyRealTime function triggered");
    
    // Create the configuration update
    const realtimeConfig = {
        video: {
            chromaKey: {
                enabled: document.getElementById('chromaEnabled').checked,
                color: [
                    parseFloat(document.getElementById('chromaR').value),
                    parseFloat(document.getElementById('chromaG').value),
                    parseFloat(document.getElementById('chromaB').value)
                ],
                threshold: parseFloat(document.getElementById('chromaThreshold').value)
            }
        }
    };
    
    console.log('🎨 Real-time chroma config object:', realtimeConfig);
    
    // Send immediate update via WebSocket (if connected) - NEVER block this
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            type: 'realtime_config_update',
            config: realtimeConfig
        };
        console.log('📡 Sending chroma WebSocket message:', message);
        
        // Use setTimeout to ensure this never blocks
        setTimeout(() => {
            try {
                ws.send(JSON.stringify(message));
                console.log('✅ Chroma message sent successfully');
            } catch (error) {
                console.error('❌ Failed to send chroma WebSocket message:', error);
            }
            // Reset the updating flag after WebSocket send
            isUpdating = false;
        }, 0);
    } else {
        console.log('❌ WebSocket not connected for chroma update, readyState:', ws ? ws.readyState : 'null');
        isUpdating = false;
    }
    
    // Debounce file writes (save to JSON after 200ms of no changes)
    clearTimeout(configWriteTimeout);
    configWriteTimeout = setTimeout(async () => {
        try {
            console.log('💾 Saving chroma config to file after debounce...');
            
            // Use fetch with a shorter timeout to prevent blocking
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
            
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(realtimeConfig),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const result = await response.json();
            if (result.success) {
                console.log('✅ Chroma config saved to file successfully');
            } else {
                console.log('❌ Failed to save chroma config to file:', result);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('⏰ Chroma config save request timed out - continuing with real-time updates');
            } else {
                logActivity('Error saving chroma key config: ' + error.message);
                console.error('❌ Error saving chroma config to file:', error);
            }
        }
    }, 200);
}

// Apply all current settings
async function applyAllSettings() {
    const config = {
        video: {
            m3u8Url: document.getElementById('streamUrl').value,
            brightness: parseFloat(document.getElementById('brightness').value),
            contrast: parseFloat(document.getElementById('contrast').value),
            saturation: parseFloat(document.getElementById('saturation').value),
            chromaKey: {
                enabled: document.getElementById('chromaEnabled').checked,
                color: [
                    parseFloat(document.getElementById('chromaR').value),
                    parseFloat(document.getElementById('chromaG').value),
                    parseFloat(document.getElementById('chromaB').value)
                ],
                threshold: parseFloat(document.getElementById('chromaThreshold').value)
            }
        },
        videoPlane: {
            size: parseFloat(document.getElementById('videoPlaneSize').value),
            position: [
                parseFloat(document.getElementById('videoPlanePositionX').value),
                parseFloat(document.getElementById('videoPlanePositionY').value),
                parseFloat(document.getElementById('videoPlanePositionZ').value)
            ]
        }
    };
    
    await updateConfiguration(config);
}

// Update video stream only
async function updateVideoStream() {
    const config = {
        video: {
            m3u8Url: document.getElementById('streamUrl').value
        }
    };
    
    await updateConfiguration(config);
}

// Send configuration update to server
async function updateConfiguration(config) {
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Configuration updated successfully', 'success');
            logActivity('Manual configuration update applied');
            currentConfig = result.config;
            updateLastUpdateTime();
        } else {
            showNotification('Failed to update configuration', 'error');
            logActivity('Configuration update failed');
        }
    } catch (error) {
        showNotification('Error updating configuration', 'error');
        logActivity('Error updating configuration: ' + error.message);
    }
}

// Preset functions
function setPresetUrl(type) {
    const urls = {
        live: 'https://live.pcotandy.org/hls/stream.m3u8',
        mp4: './assets/kat.mp4',
        test: './assets/tandyspin.mp4'
    };
    
    document.getElementById('streamUrl').value = urls[type] || '';
    logActivity(`Preset URL set: ${type}`);
}

function setChromaPreset(type) {
    const presets = {
        green: { enabled: true, color: [0, 1, 0], threshold: 0.3 },
        blue: { enabled: true, color: [0, 0, 1], threshold: 0.3 },
        black: { enabled: true, color: [0, 0, 0], threshold: 0.5 },
        off: { enabled: false, color: [0, 1, 0], threshold: 0.3 }
    };
    
    const preset = presets[type];
    if (preset) {
        document.getElementById('chromaEnabled').checked = preset.enabled;
        document.getElementById('chromaR').value = preset.color[0];
        document.getElementById('chromaG').value = preset.color[1];
        document.getElementById('chromaB').value = preset.color[2];
        document.getElementById('chromaThreshold').value = preset.threshold;
        document.getElementById('thresholdValue').value = preset.threshold.toFixed(2);
        logActivity(`Chroma preset applied: ${type}`);
    }
}

// Emergency functions
async function emergencyFallback() {
    const config = {
        video: {
            m3u8Url: './assets/tandyspin.mp4'
        }
    };
    
    await updateConfiguration(config);
    logActivity('Emergency fallback activated');
}

async function toggleChromaKey() {
    const enabled = !document.getElementById('chromaEnabled').checked;
    document.getElementById('chromaEnabled').checked = enabled;
    
    const config = {
        video: {
            chromaKey: {
                enabled: enabled
            }
        }
    };
    
    await updateConfiguration(config);
    logActivity(`Chroma key ${enabled ? 'enabled' : 'disabled'}`);
}

async function resetToDefaults() {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
        const config = {
            video: {
                m3u8Url: './assets/tandyspin.mp4',
                brightness: 1,
                contrast: 1,
                saturation: 1,
                chromaKey: {
                    enabled: true,
                    color: [0, 1, 0],
                    threshold: 0.3
                }
            }
        };
        
        await updateConfiguration(config);
        logActivity('Settings reset to defaults');
    }
}

// Utility functions
function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');
    
    if (connected) {
        statusDot.style.background = '#4CAF50';
        statusText.textContent = 'Connected';
    } else {
        statusDot.style.background = '#f44336';
        statusText.textContent = 'Disconnected';
    }
}

function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function logActivity(message) {
    const logContainer = document.getElementById('activityLog');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

// Reset video plane to default values
async function resetVideoPlaneDefaults() {
    // Update UI
    document.getElementById('videoPlaneSize').value = 0.5;
    document.getElementById('videoPlanePositionX').value = 0;
    document.getElementById('videoPlanePositionY').value = 1.12;
    document.getElementById('videoPlanePositionZ').value = 0;
    
    // Update value displays
    document.getElementById('videoPlaneSizeValue').value = '0.50';
    document.getElementById('videoPlanePositionXValue').value = '0.00';
    document.getElementById('videoPlanePositionYValue').value = '1.12';
    document.getElementById('videoPlanePositionZValue').value = '0.00';
    
    // Apply to server
    const config = {
        videoPlane: {
            size: 0.5,
            position: [0, 1.12, 0]
        }
    };
    
    await updateConfiguration(config);
    logActivity('Video plane defaults reset');
}

// Handle video plane input changes (called on every slider movement)
function handleVideoPlaneInput(slider, valueId, decimals) {
    console.log("oninput event triggered");
    // Update value display immediately
    const valueDisplay = document.getElementById(valueId);
    if (valueDisplay) {
        valueDisplay.value = parseFloat(slider.value).toFixed(decimals);
    }
    
    // Trigger real-time update
    updateVideoPlaneRealTime();
}

// Decrease video plane size
function decreaseVideoPlaneSize() {
    const currentSize = parseFloat(document.getElementById('videoPlaneSize').value);
    const newSize = Math.max(0, currentSize - 0.01);
    document.getElementById('videoPlaneSize').value = newSize;
    document.getElementById('videoPlaneSizeValue').value = newSize.toFixed(2);
    updateVideoPlaneRealTime();
}

// Increase video plane size
function increaseVideoPlaneSize() {
    const currentSize = parseFloat(document.getElementById('videoPlaneSize').value);
    const newSize = Math.min(30, currentSize + 0.01);
    document.getElementById('videoPlaneSize').value = newSize;
    document.getElementById('videoPlaneSizeValue').value = newSize.toFixed(2);
    updateVideoPlaneRealTime();
}

// Decrease video plane X position
function decreaseVideoPlaneX() {
    const currentX = parseFloat(document.getElementById('videoPlanePositionX').value);
    const newX = Math.max(-3, currentX - 0.01);
    document.getElementById('videoPlanePositionX').value = newX;
    document.getElementById('videoPlanePositionXValue').value = newX.toFixed(2);
    updateVideoPlaneRealTime();
}

// Increase video plane X position
function increaseVideoPlaneX() {
    const currentX = parseFloat(document.getElementById('videoPlanePositionX').value);
    const newX = Math.min(3, currentX + 0.01);
    document.getElementById('videoPlanePositionX').value = newX;
    document.getElementById('videoPlanePositionXValue').value = newX.toFixed(2);
    updateVideoPlaneRealTime();
}

// Decrease video plane Y position
function decreaseVideoPlaneY() {
    const currentY = parseFloat(document.getElementById('videoPlanePositionY').value);
    const newY = Math.max(-3, currentY - 0.01);
    document.getElementById('videoPlanePositionY').value = newY;
    document.getElementById('videoPlanePositionYValue').value = newY.toFixed(2);
    updateVideoPlaneRealTime();
}

// Increase video plane Y position
function increaseVideoPlaneY() {
    const currentY = parseFloat(document.getElementById('videoPlanePositionY').value);
    const newY = Math.min(3, currentY + 0.01);
    document.getElementById('videoPlanePositionY').value = newY;
    document.getElementById('videoPlanePositionYValue').value = newY.toFixed(2);
    updateVideoPlaneRealTime();
}

// Decrease video plane Z position
function decreaseVideoPlaneZ() {
    const currentZ = parseFloat(document.getElementById('videoPlanePositionZ').value);
    const newZ = Math.max(-3, currentZ - 0.01);
    document.getElementById('videoPlanePositionZ').value = newZ;
    document.getElementById('videoPlanePositionZValue').value = newZ.toFixed(2);
    updateVideoPlaneRealTime();
}

// Increase video plane Z position
function increaseVideoPlaneZ() {
    const currentZ = parseFloat(document.getElementById('videoPlanePositionZ').value);
    const newZ = Math.min(3, currentZ + 0.01);
    document.getElementById('videoPlanePositionZ').value = newZ;
    document.getElementById('videoPlanePositionZValue').value = newZ.toFixed(2);
    updateVideoPlaneRealTime();
}

// Decrease brightness
function decreaseBrightness() {
    const currentBrightness = parseFloat(document.getElementById('brightness').value);
    const newBrightness = Math.max(0, currentBrightness - 0.1);
    document.getElementById('brightness').value = newBrightness;
    document.getElementById('brightnessValue').value = newBrightness.toFixed(1);
}

// Increase brightness
function increaseBrightness() {
    const currentBrightness = parseFloat(document.getElementById('brightness').value);
    const newBrightness = Math.min(2, currentBrightness + 0.1);
    document.getElementById('brightness').value = newBrightness;
    document.getElementById('brightnessValue').value = newBrightness.toFixed(1);
}

// Decrease contrast
function decreaseContrast() {
    const currentContrast = parseFloat(document.getElementById('contrast').value);
    const newContrast = Math.max(0, currentContrast - 0.1);
    document.getElementById('contrast').value = newContrast;
    document.getElementById('contrastValue').value = newContrast.toFixed(1);
}

// Increase contrast
function increaseContrast() {
    const currentContrast = parseFloat(document.getElementById('contrast').value);
    const newContrast = Math.min(2, currentContrast + 0.1);
    document.getElementById('contrast').value = newContrast;
    document.getElementById('contrastValue').value = newContrast.toFixed(1);
}

// Decrease saturation
function decreaseSaturation() {
    const currentSaturation = parseFloat(document.getElementById('saturation').value);
    const newSaturation = Math.max(0, currentSaturation - 0.1);
    document.getElementById('saturation').value = newSaturation;
    document.getElementById('saturationValue').value = newSaturation.toFixed(1);
}

// Increase saturation
function increaseSaturation() {
    const currentSaturation = parseFloat(document.getElementById('saturation').value);
    const newSaturation = Math.min(2, currentSaturation + 0.1);
    document.getElementById('saturation').value = newSaturation;
    document.getElementById('saturationValue').value = newSaturation.toFixed(1);
}

// Decrease chroma threshold
function decreaseThreshold() {
    const currentThreshold = parseFloat(document.getElementById('chromaThreshold').value);
    const newThreshold = Math.max(0, currentThreshold - 0.05);
    document.getElementById('chromaThreshold').value = newThreshold;
    document.getElementById('thresholdValue').value = newThreshold.toFixed(2);
    updateChromaKeyRealTime();
}

// Increase chroma threshold
function increaseThreshold() {
    const currentThreshold = parseFloat(document.getElementById('chromaThreshold').value);
    const newThreshold = Math.min(1, currentThreshold + 0.05);
    document.getElementById('chromaThreshold').value = newThreshold;
    document.getElementById('thresholdValue').value = newThreshold.toFixed(2);
    updateChromaKeyRealTime();
}

// Gamepad initialization and handling
function initializeGamepad() {
    // Check for gamepad support
    if (!navigator.getGamepads) {
        console.log('Gamepad API not supported');
        return;
    }

    // Listen for gamepad connection events
    window.addEventListener('gamepadconnected', function(e) {
        console.log('🎮 Gamepad connected:', e.gamepad.id);
        gamepadConnected = true;
        gamepadIndex = e.gamepad.index;
        updateGamepadStatus(true, e.gamepad.id);
        logActivity(`Gamepad connected: ${e.gamepad.id}`);
        startGamepadPolling();
        showNotification('Gamepad connected!', 'success');
    });

    window.addEventListener('gamepaddisconnected', function(e) {
        console.log('🎮 Gamepad disconnected:', e.gamepad.id);
        gamepadConnected = false;
        gamepadIndex = -1;
        updateGamepadStatus(false);
        logActivity('Gamepad disconnected');
        stopGamepadPolling();
        showNotification('Gamepad disconnected', 'error');
    });

    // Check for already connected gamepads
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            console.log('🎮 Found existing gamepad:', gamepads[i].id);
            gamepadConnected = true;
            gamepadIndex = i;
            updateGamepadStatus(true, gamepads[i].id);
            logActivity(`Gamepad found: ${gamepads[i].id}`);
            startGamepadPolling();
            showNotification('Gamepad ready!', 'success');
            break;
        }
    }
}

function updateGamepadStatus(connected, gamepadName = '') {
    const statusDot = document.getElementById('gamepadStatus');
    const statusText = document.getElementById('gamepadText');
    
    if (connected) {
        statusDot.style.background = '#4CAF50';
        statusText.textContent = gamepadName.length > 20 ? 'Gamepad Connected' : gamepadName;
    } else {
        statusDot.style.background = '#666';
        statusText.textContent = 'No Gamepad';
    }
}

function startGamepadPolling() {
    if (gamepadUpdateInterval) {
        clearInterval(gamepadUpdateInterval);
    }
    
    gamepadUpdateInterval = setInterval(updateGamepadInput, 16); // ~60fps
}

function stopGamepadPolling() {
    if (gamepadUpdateInterval) {
        clearInterval(gamepadUpdateInterval);
        gamepadUpdateInterval = null;
    }
}

function updateGamepadInput() {
    if (!gamepadConnected || gamepadIndex === -1) {
        return;
    }

    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamepadIndex];
    
    if (!gamepad) {
        return;
    }

    // Deadzone for analog sticks
    const deadzone = 0.15;
    
    // Get current values
    const currentSize = parseFloat(document.getElementById('videoPlaneSize').value);
    const currentX = parseFloat(document.getElementById('videoPlanePositionX').value);
    const currentY = parseFloat(document.getElementById('videoPlanePositionY').value);
    const currentZ = parseFloat(document.getElementById('videoPlanePositionZ').value);

    let hasChanged = false;

    // Left stick: X/Y position
    const leftStickX = Math.abs(gamepad.axes[0]) > deadzone ? gamepad.axes[0] : 0;
    const leftStickY = Math.abs(gamepad.axes[1]) > deadzone ? gamepad.axes[1] : 0;

    // Right stick: Z position and size
    const rightStickX = Math.abs(gamepad.axes[2]) > deadzone ? gamepad.axes[2] : 0;
    const rightStickY = Math.abs(gamepad.axes[3]) > deadzone ? gamepad.axes[3] : 0;

    // Triggers for fine size control
    const leftTrigger = gamepad.buttons[6] ? gamepad.buttons[6].value : 0;
    const rightTrigger = gamepad.buttons[7] ? gamepad.buttons[7].value : 0;

    // Movement speed (adjust these for sensitivity)
    const positionSpeed = 0.02; // Position movement per frame
    const sizeSpeed = 0.03; // Size change per frame
    const triggerSizeSpeed = 0.01; // Fine size control with triggers

    // Update X position (left stick horizontal)
    if (leftStickX !== 0) {
        const newX = Math.max(-3, Math.min(3, currentX + (leftStickX * positionSpeed)));
        if (Math.abs(newX - currentX) > 0.001) {
            document.getElementById('videoPlanePositionX').value = newX;
            document.getElementById('videoPlanePositionXValue').value = newX.toFixed(2);
            hasChanged = true;
        }
    }

    // Update Y position (left stick vertical, inverted)
    if (leftStickY !== 0) {
        const newY = Math.max(-3, Math.min(3, currentY - (leftStickY * positionSpeed)));
        if (Math.abs(newY - currentY) > 0.001) {
            document.getElementById('videoPlanePositionY').value = newY;
            document.getElementById('videoPlanePositionYValue').value = newY.toFixed(2);
            hasChanged = true;
        }
    }

    // Update Z position (right stick horizontal)
    if (rightStickX !== 0) {
        const newZ = Math.max(-3, Math.min(3, currentZ + (rightStickX * positionSpeed)));
        if (Math.abs(newZ - currentZ) > 0.001) {
            document.getElementById('videoPlanePositionZ').value = newZ;
            document.getElementById('videoPlanePositionZValue').value = newZ.toFixed(2);
            hasChanged = true;
        }
    }

    // Update size (right stick vertical or triggers)
    let sizeChange = 0;
    
    // Right stick for coarse size control
    if (rightStickY !== 0) {
        sizeChange = -rightStickY * sizeSpeed; // Inverted: up = bigger
    }
    
    // Triggers for fine size control (override stick if pressed)
    if (rightTrigger > 0.1) {
        sizeChange = rightTrigger * triggerSizeSpeed; // Right trigger = bigger
    } else if (leftTrigger > 0.1) {
        sizeChange = -leftTrigger * triggerSizeSpeed; // Left trigger = smaller
    }

    if (Math.abs(sizeChange) > 0.001) {
        const newSize = Math.max(0, Math.min(30, currentSize + sizeChange));
        if (Math.abs(newSize - currentSize) > 0.001) {
            document.getElementById('videoPlaneSize').value = newSize;
            document.getElementById('videoPlaneSizeValue').value = newSize.toFixed(2);
            hasChanged = true;
        }
    }

    // Send real-time update if anything changed
    if (hasChanged) {
        updateVideoPlaneRealTime();
    }
}

function initializeLightingControls() {
    // Light selection buttons
    document.querySelectorAll('.light-btn').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.light-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            lightingSystem.activeLightIndex = index;
            updateLightingUI();
            broadcastLightingUpdate();
            logActivity(`Selected light ${index + 1}`);
        });
    });

    // Color preset buttons
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const color = btn.dataset.color;
            const rgb = hexToRgb(color);
            const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
            activeLight.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
            
            updateLightingUI();
            broadcastLightingUpdate();
            logActivity(`Set light ${lightingSystem.activeLightIndex + 1} color to ${color}`);
        });
    });

    // Effect buttons
    document.querySelectorAll('.effect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const effect = btn.dataset.effect;
            const effectMap = { 'static': 0, 'spin': 1, 'strobe': 2, 'rainbow': 3 };
            const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
            activeLight.effect = effectMap[effect];
            
            broadcastLightingUpdate();
            logActivity(`Set light ${lightingSystem.activeLightIndex + 1} effect to ${effect}`);
        });
    });

    // Intensity slider
    document.getElementById('lightIntensity').addEventListener('input', (e) => {
        const intensityPercent = parseFloat(e.target.value);
        const intensity = intensityPercent / 100 * 5.0;
        document.getElementById('lightIntensityValue').value = intensityPercent + '%';
        
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.intensity = intensity;
        
        broadcastLightingUpdate();
    });
    
    // Position sliders
    document.getElementById('lightPositionX').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('lightPositionXValue').value = value.toFixed(1);
        
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.position[0] = value;
        
        broadcastLightingUpdate();
    });
    
    document.getElementById('lightPositionY').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('lightPositionYValue').value = value.toFixed(1);
        
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.position[1] = value;
        
        broadcastLightingUpdate();
    });
    
    document.getElementById('lightPositionZ').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('lightPositionZValue').value = value.toFixed(1);
        
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.position[2] = value;
        
        broadcastLightingUpdate();
    });
    
    // Custom color inputs
    document.getElementById('lightColorR').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.color[0] = Math.max(0, Math.min(1, value));
        
        broadcastLightingUpdate();
    });
    
    document.getElementById('lightColorG').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.color[1] = Math.max(0, Math.min(1, value));
        
        broadcastLightingUpdate();
    });
    
    document.getElementById('lightColorB').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
        activeLight.color[2] = Math.max(0, Math.min(1, value));
        
        broadcastLightingUpdate();
    });

    updateLightingUI();
}

function updateLightingUI() {
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    
    // Update light selection buttons
    document.querySelectorAll('.light-btn').forEach((btn, index) => {
        btn.classList.remove('active');
        if (index === lightingSystem.activeLightIndex) {
            btn.classList.add('active');
        }
    });
    
    // Update custom color inputs
    document.getElementById('lightColorR').value = activeLight.color[0].toFixed(1);
    document.getElementById('lightColorG').value = activeLight.color[1].toFixed(1);
    document.getElementById('lightColorB').value = activeLight.color[2].toFixed(1);
    
    // Update intensity
    const intensityPercent = Math.round((activeLight.intensity / 5.0) * 100);
    document.getElementById('lightIntensity').value = intensityPercent;
    document.getElementById('lightIntensityValue').value = intensityPercent + '%';
    
    // Update position controls
    document.getElementById('lightPositionX').value = activeLight.position[0];
    document.getElementById('lightPositionXValue').value = activeLight.position[0].toFixed(1);
    document.getElementById('lightPositionY').value = activeLight.position[1];
    document.getElementById('lightPositionYValue').value = activeLight.position[1].toFixed(1);
    document.getElementById('lightPositionZ').value = activeLight.position[2];
    document.getElementById('lightPositionZValue').value = activeLight.position[2].toFixed(1);
    
    // Update effect buttons
    document.querySelectorAll('.effect-btn').forEach(btn => btn.classList.remove('active'));
    const effectMap = { 0: 'static', 1: 'spin', 2: 'strobe', 3: 'rainbow' };
    const effectName = effectMap[activeLight.effect];
    const activeEffectBtn = document.querySelector(`.effect-btn[data-effect="${effectName}"]`);
    if (activeEffectBtn) {
        activeEffectBtn.classList.add('active');
    }
    
    // Update color preset buttons (find closest match)
    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('active'));
    const lightColor = activeLight.color;
    const lightHex = rgbToHex(Math.round(lightColor[0] * 255), Math.round(lightColor[1] * 255), Math.round(lightColor[2] * 255));
    const matchingColorBtn = document.querySelector(`.color-btn[data-color="${lightHex}"]`);
    if (matchingColorBtn) {
        matchingColorBtn.classList.add('active');
    }
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function broadcastLightingUpdate() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const lightingData = {
            type: 'lighting_update',
            lighting: {
                lights: lightingSystem.lights,
                activeLightIndex: lightingSystem.activeLightIndex
            },
            timestamp: Date.now()
        };
        
        ws.send(JSON.stringify(lightingData));
        console.log('💡 Broadcasting lighting update:', lightingData.lighting);
    }
}

function applyLightingSettings() {
    broadcastLightingUpdate();
    showNotification('Lighting settings applied!', 'success');
    logActivity('Applied lighting settings');
}

function resetLightingDefaults() {
    lightingSystem.lights.forEach(light => {
        light.position = [3.0, 3.5, 3.0];
        light.color = [1.0, 1.0, 1.0];
        light.intensity = 3.0;
        light.effect = 0;
        light.enabled = true;
    });
    lightingSystem.activeLightIndex = 0;
    
    updateLightingUI();
    broadcastLightingUpdate();
    showNotification('Lighting reset to defaults', 'success');
    logActivity('Reset lighting to defaults');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Lighting control helper functions
function decreaseLightIntensity() {
    const current = parseInt(document.getElementById('lightIntensity').value);
    const newValue = Math.max(0, current - 5);
    document.getElementById('lightIntensity').value = newValue;
    document.getElementById('lightIntensityValue').value = newValue + '%';
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.intensity = (newValue / 100) * 5.0;
    broadcastLightingUpdate();
}

function increaseLightIntensity() {
    const current = parseInt(document.getElementById('lightIntensity').value);
    const newValue = Math.min(100, current + 5);
    document.getElementById('lightIntensity').value = newValue;
    document.getElementById('lightIntensityValue').value = newValue + '%';
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.intensity = (newValue / 100) * 5.0;
    broadcastLightingUpdate();
}

function decreaseLightX() {
    const current = parseFloat(document.getElementById('lightPositionX').value);
    const newValue = Math.max(-5, current - 0.1);
    document.getElementById('lightPositionX').value = newValue;
    document.getElementById('lightPositionXValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[0] = newValue;
    broadcastLightingUpdate();
}

function increaseLightX() {
    const current = parseFloat(document.getElementById('lightPositionX').value);
    const newValue = Math.min(5, current + 0.1);
    document.getElementById('lightPositionX').value = newValue;
    document.getElementById('lightPositionXValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[0] = newValue;
    broadcastLightingUpdate();
}

function decreaseLightY() {
    const current = parseFloat(document.getElementById('lightPositionY').value);
    const newValue = Math.max(-5, current - 0.1);
    document.getElementById('lightPositionY').value = newValue;
    document.getElementById('lightPositionYValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[1] = newValue;
    broadcastLightingUpdate();
}

function increaseLightY() {
    const current = parseFloat(document.getElementById('lightPositionY').value);
    const newValue = Math.min(5, current + 0.1);
    document.getElementById('lightPositionY').value = newValue;
    document.getElementById('lightPositionYValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[1] = newValue;
    broadcastLightingUpdate();
}

function decreaseLightZ() {
    const current = parseFloat(document.getElementById('lightPositionZ').value);
    const newValue = Math.max(-5, current - 0.1);
    document.getElementById('lightPositionZ').value = newValue;
    document.getElementById('lightPositionZValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[2] = newValue;
    broadcastLightingUpdate();
}

function increaseLightZ() {
    const current = parseFloat(document.getElementById('lightPositionZ').value);
    const newValue = Math.min(5, current + 0.1);
    document.getElementById('lightPositionZ').value = newValue;
    document.getElementById('lightPositionZValue').value = newValue.toFixed(1);
    
    const activeLight = lightingSystem.lights[lightingSystem.activeLightIndex];
    activeLight.position[2] = newValue;
    broadcastLightingUpdate();
}

// Background Control Functions
function applyBackgroundPreset(preset) {
    switch (preset) {
        case 'psychedelic':
            backgroundSystem.setMode('tunnel');
            break;
        case 'space':
            backgroundSystem.setMode('skybox');
            break;
        case 'minimal':
            backgroundSystem.setMode('black');
            break;
        case 'custom':
            // Let user choose
            break;
    }
    showNotification(`Background preset "${preset}" applied!`, 'success');
    logActivity(`Applied background preset: ${preset}`);
}

async function checkSkyboxTextures() {
    const textures = ['right.jpg', 'left.jpg', 'top.jpg', 'bottom.jpg', 'front.jpg', 'back.jpg'];
    let foundTextures = 0;
    
    // Check each texture file
    for (const texture of textures) {
        try {
            const response = await fetch(`/skybox/${texture}`, { method: 'HEAD' });
            if (response.ok) {
                foundTextures++;
            }
        } catch (error) {
            // File doesn't exist or can't be accessed
        }
    }
    
    console.log(`Found ${foundTextures}/6 skybox textures`);
    return foundTextures;
}
