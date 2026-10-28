// WebSocket connection for real-time features
let ws = null;
let viewerId = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;
let userUsername = null;
let userColor = null;
let connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected'
let heartbeatInterval = null;
let lastHeartbeat = 0;

function connectWebSocketWithUserData(username, color) {
    userUsername = username;
    userColor = color;
    connectWebSocket();
}

function connectWebSocket() {
    // Prevent multiple simultaneous connections
    if (connectionState === 'connecting' || connectionState === 'connected') {
        console.log('WebSocket already connecting/connected, skipping...');
        return;
    }
    
    connectionState = 'connecting';
    
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
            console.log('WebSocket connected');
            connectionState = 'connected';
            reconnectAttempts = 0;
            addSystemMessage('Connected to live chat');
            
            // Send user data to server if available
            if (userUsername && userColor) {
                ws.send(JSON.stringify({
                    type: 'set_user_data',
                    username: userUsername,
                    color: userColor
                }));
            }
            
            // Start heartbeat to keep connection alive
            startHeartbeat();
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Handle heartbeat response
                if (data.type === 'pong') {
                    lastHeartbeat = Date.now();
                    return;
                }
                
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onclose = function(event) {
            console.log('WebSocket disconnected', event.code, event.reason);
            connectionState = 'disconnected';
            stopHeartbeat();
            addSystemMessage('Disconnected from chat');
            
            // Clear our own orbs from the display (we'll get fresh data on reconnect)
            if (viewerId) {
                removeRealUserOrb(viewerId);
                viewerId = null;
            }
            
            // Attempt to reconnect if it wasn't a clean close
            if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
                setTimeout(connectWebSocket, reconnectDelay);
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                addSystemMessage('Failed to reconnect. Please refresh the page.');
            }
        };

        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            connectionState = 'disconnected';
        };

    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        connectionState = 'disconnected';
    }
}

function startHeartbeat() {
    stopHeartbeat(); // Clear any existing heartbeat
    lastHeartbeat = Date.now();
    
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            
            // Check if we haven't received a pong in too long
            if (Date.now() - lastHeartbeat > 10000) { // 10 seconds timeout
                console.log('Heartbeat timeout, closing connection');
                ws.close();
            }
        }
    }, 5000); // Send ping every 5 seconds
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// Handle browser visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden, maintaining connection...');
    } else {
        console.log('Page visible, checking connection...');
        // Check connection health when page becomes visible
        if (ws && ws.readyState !== WebSocket.OPEN) {
            console.log('Connection lost while hidden, reconnecting...');
            connectWebSocket();
        }
    }
});

// Handle page unload to clean up
window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Page unloading');
    }
});

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'init':
            viewerId = data.viewerId;
            console.log('Assigned viewer ID:', viewerId);
            
            // Clear any existing real user orbs (in case of reconnection)
            clearAllRealUserOrbs();
            
            // Create orbs for existing viewers
            if (data.viewers) {
                data.viewers.forEach(viewer => {
                    if (viewer.id !== viewerId) { // Don't create orb for ourselves
                        createRealUserOrb(viewer.id, viewer.name, viewer.color, viewer.position);
                    }
                });
            }
            break;
            
        case 'chat_message':
            addChatMessage(data.name, data.message, data.timestamp, data.color);
            break;
            
        // case 'viewer_joined':
        //     addSystemMessage(`${data.viewer.name} joined the space`);
        //     break;
        case 'viewer_updated':
            addSystemMessage(`${data.viewer.name} joined the space`);
            // Create orb for the new/updated user (removeRealUserOrb is called inside createRealUserOrb)
            if (data.viewer.id !== viewerId) { // Don't create orb for ourselves
                createRealUserOrb(data.viewer.id, data.viewer.name, data.viewer.color, data.viewer.position);
            }
            break;
            
        case 'position_update':
            // Update existing user orb position
            if (data.viewerId !== viewerId) { // Don't update our own orb
                updateRealUserOrb(data.viewerId, data.position);
            }
            break;
            
        case 'viewer_left':
            // Remove orb for disconnected user
            removeRealUserOrb(data.viewerId);
            break;
            
        case 'config_update':
            console.log('📨 Received configuration update:', data.config);
            console.log('🔍 Update source:', data.updatedBy);
            console.log('⏰ Timestamp:', new Date(data.timestamp).toLocaleTimeString());
            
            // Apply the new configuration
            applyConfiguration(data.config);
            break;
            
        case 'lighting_update':
            console.log('💡 Received lighting update:', data.lighting);
            applyLightingUpdate(data.lighting);
            break;
            
        case 'background_update':
            console.log('🌌 Received background update:', data.background);
            applyBackgroundUpdate(data.background);
            break;
            
        default:
            console.log('Unknown message type:', data.type);
    }
}

function sendChatMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN && message.trim()) {
        ws.send(JSON.stringify({
            type: 'chat_message',
            message: message.trim()
        }));
    }
}

// Chat UI functionality
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
// const chatReminder = document.getElementById('chatReminder');

let chatInputFocused = false;

// Show reminder initially, then hide after a few seconds
// setTimeout(() => {
//     chatReminder.style.display = 'block';
//     setTimeout(() => {
//         if (!chatInputFocused) {
//             chatReminder.style.display = 'none';
//         }
//     }, 4000);
// }, 2000);

function focusChat() {
    chatInput.focus();
    chatInputFocused = true;
    // chatReminder.style.display = 'none';
}

function addChatMessage(username, message, timestamp, color) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const colorStyle = color ? `color: rgb(${Math.floor(color[0]*255)}, ${Math.floor(color[1]*255)}, ${Math.floor(color[2]*255)})` : '';
    
    messageDiv.innerHTML = `
        <span class="chat-username" style="${colorStyle}">${username}:</span>
        <span>${message}</span>
        <span class="chat-timestamp">${time}</span>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Limit chat history to prevent memory issues
    if (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message chat-system';
    messageDiv.textContent = `* ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Limit chat history
    if (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

// Chat event listeners
chatSend.addEventListener('click', () => {
    const message = chatInput.value;
    if (message.trim()) {
        sendChatMessage(message);
        chatInput.value = '';
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const message = chatInput.value;
        if (message.trim()) {
            sendChatMessage(message);
            chatInput.value = '';
        }
    }
});

// Track chat input focus state
chatInput.addEventListener('focus', () => {
    chatInputFocused = true;
    // chatReminder.style.display = 'none';
});

chatInput.addEventListener('blur', () => {
    chatInputFocused = false;
    // Show reminder after a delay if input is still not focused
    setTimeout(() => {
        if (!chatInputFocused) {
            // chatReminder.style.display = 'block';
        }
    }, 2000);
});

// Prevent chat input from interfering with camera controls
chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
});

chatInput.addEventListener('keyup', (e) => {
    e.stopPropagation();
});

// Send position updates to server (if we want to track viewer positions)
let lastSentPosition = [0, 0, 0];
let lastPositionUpdateTime = 0;
const POSITION_UPDATE_INTERVAL = 100; // Send updates every 100ms (10 FPS)
const MIN_MOVEMENT_THRESHOLD = 0.05; // Only send if moved more than this distance

function sendPositionUpdate() {
    if (ws && ws.readyState === WebSocket.OPEN && viewerId) {
        const now = Date.now();
        
        // Throttle updates to avoid spam
        if (now - lastPositionUpdateTime < POSITION_UPDATE_INTERVAL) {
            return;
        }
        
        // Calculate distance moved since last update
        const dx = cameraPos[0] - lastSentPosition[0];
        const dy = cameraPos[1] - lastSentPosition[1];
        const dz = cameraPos[2] - lastSentPosition[2];
        const distanceMoved = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // Only send if we've moved significantly
        if (distanceMoved > MIN_MOVEMENT_THRESHOLD) {
            ws.send(JSON.stringify({
                type: 'position_update',
                position: [...cameraPos] // Copy array to avoid reference issues
            }));
            
            lastSentPosition = [...cameraPos];
            lastPositionUpdateTime = now;
        }
    }
}

// Send position updates more frequently but with smart throttling
setInterval(sendPositionUpdate, 50); // Check every 50ms, but throttle actual sends

function createRealUserOrb(userId, username, color, position) {
    // Remove existing orb for this user if it exists (prevents duplicates)
    removeRealUserOrb(userId);
    
    // Use the new replacement system
    replaceBotWithUser(userId, username, color, position);
}

function updateRealUserOrb(userId, position) {
    const userOrb = realUserOrbs.get(userId);
    if (userOrb) {
        userOrb.updatePosition(position);
    } else {
        console.warn(`Received position update for unknown user: ${userId}`);
    }
}

function removeRealUserOrb(userId) {
    // Use the new replacement system
    replaceUserWithBot(userId);
}

function clearAllRealUserOrbs() {
    // Clear all real user orbs and replace them with bots
    const userIds = Array.from(realUserOrbs.keys());
    userIds.forEach(userId => {
        replaceUserWithBot(userId);
    });
    console.log('Cleared all real user orbs and replaced with bots');
}
