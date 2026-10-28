// Orb management
const MAX_ORBS = MOBILE_PERFORMANCE_MODE ? MOBILE_MAX_ORBS : DESKTOP_MAX_ORBS; // Mobile gets 0 orbs, desktop gets 100
const MAX_ORB_SIZE = 0.9; // Maximum orb radius - adjust this to change biggest orb size
const VISIBLE_ORB_LIMIT = 4; // Match the shader's MAX_ORBS limit
const SPAWN_INTERVAL = 4000; // 4 seconds between management checks
let orbs = [];
let realUserOrbs = new Map(); // Track real user orbs separately
let botOrbsInitialized = false; // Track if we've created the initial bot orbs

const RANDOM_NAMES = [
    "signon", "philipGlass", "opusImp3tus", "meaningful", "musicattractive", "blueby"
];

let usedNames = new Set(); // Track used names to ensure uniqueness

function getRandomName() {
    // Get available names (not currently used)
    const availableNames = RANDOM_NAMES.filter(name => !usedNames.has(name));
    
    // If all names are used, clear the used names set and start over
    if (availableNames.length === 0) {
        usedNames.clear();
        return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    }
    
    // Return a random available name
    const selectedName = availableNames[Math.floor(Math.random() * availableNames.length)];
    usedNames.add(selectedName);
    return selectedName;
}

function createInitialBotOrbs() {
    if (botOrbsInitialized || MOBILE_PERFORMANCE_MODE) return;
    
    console.log(`Creating initial bot orbs (limit: ${VISIBLE_ORB_LIMIT})...`);
    
    // Create exactly VISIBLE_ORB_LIMIT bot orbs initially
    // Real users will replace these as they join
    for (let i = 0; i < VISIBLE_ORB_LIMIT; i++) {
        const botOrb = new Orb(getRandomName(), false);
        orbs.push(botOrb);
    }
    
    botOrbsInitialized = true;
    console.log(`Created ${VISIBLE_ORB_LIMIT} initial bot orbs`);
}

function replaceBotWithUser(userId, username, color, position) {
    // First, check if this user already has an orb (prevent duplicates)
    if (realUserOrbs.has(userId)) {
        console.log(`User ${username} already has an orb, updating position only`);
        const existingOrb = realUserOrbs.get(userId);
        existingOrb.updatePosition(position);
        return;
    }
    
    // Find the first bot orb in the visible range (first 4 positions) to replace
    let botOrbIndex = -1;
    
    // Look for bot orbs in the first 4 positions first (these are the visible ones)
    for (let i = 0; i < Math.min(orbs.length, VISIBLE_ORB_LIMIT); i++) {
        if (!orbs[i].isRealUser) {
            botOrbIndex = i;
            break;
        }
    }
    
    // If no bot orbs in visible positions, look for any bot orb
    if (botOrbIndex === -1) {
        botOrbIndex = orbs.findIndex(orb => !orb.isRealUser);
    }
    
    // Create the real user orb
    const userOrb = new Orb(username, true, userId, color);
    userOrb.updatePosition(position);
    
    if (botOrbIndex !== -1) {
        // Replace the bot orb
        const botOrb = orbs[botOrbIndex];
        usedNames.delete(botOrb.name); // Free up the bot's name
        orbs[botOrbIndex] = userOrb; // Replace in the same position
        console.log(`Replaced bot orb "${botOrb.name}" at position ${botOrbIndex} with user "${username}"`);
    } else {
        // No bot orbs to replace, but we still need to ensure real users are in visible positions
        // If we have less than 4 orbs total, just add the user
        if (orbs.length < VISIBLE_ORB_LIMIT) {
            orbs.push(userOrb);
            console.log(`Added user "${username}" to position ${orbs.length - 1}`);
        } else {
            // We have 4+ orbs but no bots to replace - this shouldn't happen in normal operation
            // But if it does, replace the last orb to make room
            console.warn(`No bot orbs available to replace, replacing last orb for user "${username}"`);
            const lastOrb = orbs[orbs.length - 1];
            if (!lastOrb.isRealUser) {
                usedNames.delete(lastOrb.name);
            }
            orbs[orbs.length - 1] = userOrb;
        }
    }
    
    // Add to real user tracking
    realUserOrbs.set(userId, userOrb);
    
    // Ensure real users are prioritized in the first 4 positions
    prioritizeRealUsersInVisiblePositions();
    
    console.log(`Created orb for user ${username} (${userId}) at position`, position);
    console.log(`Current orb order: ${orbs.slice(0, 4).map((orb, i) => `${i}: ${orb.name}(${orb.isRealUser ? 'USER' : 'BOT'})`).join(', ')}`);
    textAtlasNeedsUpdate = true;
}

function prioritizeRealUsersInVisiblePositions() {
    
    // Separate real users and bots
    const realUsers = orbs.filter(orb => orb.isRealUser);
    const bots = orbs.filter(orb => !orb.isRealUser);
    
    // Rebuild orbs array with real users first, then bots
    orbs = [...realUsers, ...bots];
    
    // Log the new arrangement for debugging
    if (realUsers.length > 0) {
        console.log(`Prioritized real users: ${orbs.slice(0, VISIBLE_ORB_LIMIT).map((orb, i) => `${i}: ${orb.name}(${orb.isRealUser ? 'USER' : 'BOT'})`).join(', ')}`);
    }
}

function replaceUserWithBot(userId) {
    if (realUserOrbs.has(userId)) {
        const userOrb = realUserOrbs.get(userId);
        const index = orbs.indexOf(userOrb);
        if (index > -1) {
            // Replace the user orb with a new bot orb
            const botOrb = new Orb(getRandomName(), false);
            orbs[index] = botOrb; // Replace in the same position
            console.log(`Replaced user orb "${userOrb.name}" with bot orb "${botOrb.name}" at position ${index}`);
        }
        realUserOrbs.delete(userId);
        
        // Re-prioritize to ensure real users stay in visible positions
        prioritizeRealUsersInVisiblePositions();
        
        textAtlasNeedsUpdate = true;
    }
}

class Orb {
    constructor(name, isRealUser = false, userId = null, userColor = null) {
this.name = name;
this.isRealUser = isRealUser;
this.userId = userId;
this.position = this.getValidPosition();

if (isRealUser && userColor) {
    // Use the user's selected color
    this.color = userColor;
    // Add interpolation properties for real users
    this.targetPosition = [...this.position];
    this.lastUpdateTime = Date.now();
    this.interpolationSpeed = 0.1; // How fast to interpolate (0.1 = 10% per frame)
} else {
    // Generate random color for AI orbs
    this.color = [
        Math.random() * 0.5 + 0.5, // Brighter colors (0.5 - 1.0)
        Math.random() * 0.5 + 0.5,
        Math.random() * 0.5 + 0.5
    ];
}

this.createdAt = Date.now();
this.textPosition = [
    this.position[0],
    this.position[1] + 0.3, // Reverted back to original position
    this.position[2]
];

// Mark atlas for update when new orb is created
textAtlasNeedsUpdate = true;

if (!isRealUser) {
    // Movement properties for AI orbs only
    this.velocity = [0, 0, 0];
    this.targetPosition = [...this.position];
    this.moveSpeed = 0.01 + Math.random() * 0.02; // Random speed between 0.01-0.03
    this.lastMoveTime = Date.now();
    this.moveInterval = 2000 + Math.random() * 4000; // Move every 2-6 seconds
    this.movementPattern = Math.floor(Math.random() * 3); // 0: wandering, 1: orbiting, 2: exploring
    this.orbitCenter = [...this.position];
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.orbitRadius = 0.5 + Math.random() * 1.0;
}
    }

    getValidPosition() {
const angle = Math.random() * Math.PI * 2;
const radius = 2 + Math.random() * 1.5; // 2-3.5 units from center (increased range)
const height = Math.random() * 2.0 - 1.0; // -1.0 to 1.0 vertical range (increased)

return [
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
];
    }

    updatePosition(newPosition) {
// For real user orbs, set target position for smooth interpolation
if (this.isRealUser) {
    this.targetPosition = [...newPosition];
    this.lastUpdateTime = Date.now();
}
    }

    smoothInterpolate() {
// Only interpolate for real user orbs
if (!this.isRealUser) return;

// Calculate distance to target
const dx = this.targetPosition[0] - this.position[0];
const dy = this.targetPosition[1] - this.position[1];
const dz = this.targetPosition[2] - this.position[2];
const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

// Only interpolate if there's a meaningful distance
if (distance > 0.01) {
    // Smooth interpolation towards target
    this.position[0] += dx * this.interpolationSpeed;
    this.position[1] += dy * this.interpolationSpeed;
    this.position[2] += dz * this.interpolationSpeed;
    
    // Update text position
    this.updateTextPosition();
}
    }

    updateTextPosition() {
this.textPosition[0] = this.position[0];

// Calculate dynamic radius to position text above the orb properly
const distanceToCenter = Math.sqrt(
    this.position[0] * this.position[0] + 
    this.position[1] * this.position[1] + 
    this.position[2] * this.position[2]
);
const powerScale = Math.pow(Math.max(0.0, distanceToCenter * 0.3), 3.0);
const dynamicRadius = Math.min(0.03 + powerScale * 0.15, MAX_ORB_SIZE); // Use configurable max size

const baseClearance = 0.08;
const scaledClearance = baseClearance + (dynamicRadius * 0.5);
this.textPosition[1] = this.position[1] + dynamicRadius + scaledClearance;
this.textPosition[2] = this.position[2];
    }

    updateMovement() {
// Only AI orbs should move automatically
if (this.isRealUser) return;

const now = Date.now();

// Check if it's time to choose a new target
if (now - this.lastMoveTime > this.moveInterval) {
    this.chooseNewTarget();
    this.lastMoveTime = now;
    this.moveInterval = 2000 + Math.random() * 4000; // New random interval
}

// Update position based on movement pattern
switch (this.movementPattern) {
    case 0: // Wandering - move toward target position
        this.wanderMovement();
        break;
    case 1: // Orbiting - circular movement around a center point
        this.orbitMovement();
        break;
    case 2: // Exploring - more erratic movement
        this.exploreMovement();
        break;
}

// Update text position to follow orb
this.updateTextPosition();
    }

    chooseNewTarget() {
switch (this.movementPattern) {
    case 0: // Wandering
        this.targetPosition = this.getValidPosition();
        break;
    case 1: // Orbiting
        this.orbitCenter = this.getValidPosition();
        this.orbitRadius = 0.5 + Math.random() * 1.0;
        break;
    case 2: // Exploring
        // Choose a target within a smaller radius for more local exploration
        const angle = Math.random() * Math.PI * 2;
        const distance = 0.5 + Math.random() * 1.5;
        this.targetPosition = [
            this.position[0] + Math.cos(angle) * distance,
            this.position[1] + (Math.random() - 0.5) * 0.8,
            this.position[2] + Math.sin(angle) * distance
        ];
        break;
}
    }

    wanderMovement() {
// Move toward target position
const dx = this.targetPosition[0] - this.position[0];
const dy = this.targetPosition[1] - this.position[1];
const dz = this.targetPosition[2] - this.position[2];
const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

if (distance > 0.1) {
    this.position[0] += (dx / distance) * this.moveSpeed;
    this.position[1] += (dy / distance) * this.moveSpeed;
    this.position[2] += (dz / distance) * this.moveSpeed;
}
    }

    orbitMovement() {
// Circular movement around orbit center
this.orbitAngle += this.moveSpeed * 0.5;
this.position[0] = this.orbitCenter[0] + Math.cos(this.orbitAngle) * this.orbitRadius;
this.position[2] = this.orbitCenter[2] + Math.sin(this.orbitAngle) * this.orbitRadius;
// Slight vertical bobbing
this.position[1] = this.orbitCenter[1] + Math.sin(this.orbitAngle * 2) * 0.2;
    }

    exploreMovement() {
// More erratic movement with some randomness
const dx = this.targetPosition[0] - this.position[0];
const dy = this.targetPosition[1] - this.position[1];
const dz = this.targetPosition[2] - this.position[2];
const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

if (distance > 0.1) {
    // Add some randomness to the movement
    const randomFactor = 0.3;
    this.position[0] += (dx / distance) * this.moveSpeed + (Math.random() - 0.5) * randomFactor * this.moveSpeed;
    this.position[1] += (dy / distance) * this.moveSpeed + (Math.random() - 0.5) * randomFactor * this.moveSpeed;
    this.position[2] += (dz / distance) * this.moveSpeed + (Math.random() - 0.5) * randomFactor * this.moveSpeed;
}
    }

    createTextTexture() {
// Get a canvas from the pool to avoid creation overhead
const canvas = getCanvasFromPool();
const ctx = canvas.getContext('2d');

// Set font properties first to measure text
ctx.font = '24px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Measure text to size canvas appropriately (avoid waste)
const metrics = ctx.measureText(this.name);
const textWidth = Math.ceil(metrics.width);
const textHeight = 32;

// Size canvas to fit text with small padding
canvas.width = Math.max(textWidth + 16, 64); // Minimum 64px width
canvas.height = textHeight + 8;

// Re-set font properties after canvas resize (canvas resize clears context)
ctx.font = '24px Arial';
ctx.fillStyle = 'white';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

// Add text shadow for better visibility
ctx.shadowColor = 'black';
ctx.shadowBlur = 4;
ctx.shadowOffsetX = 2;
ctx.shadowOffsetY = 2;

// Draw the text centered
ctx.fillText(this.name, canvas.width / 2, canvas.height / 2);

// Create WebGL texture from canvas
const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// Return canvas to pool for reuse
returnCanvasToPool(canvas);

// Track performance
textureCreationCount++;
console.log(`Created texture #${textureCreationCount} for "${this.name}" (${canvas.width}x${canvas.height}px)`);

return texture;
    }

    removeLabel() {
// Mark atlas for update when orb is removed
textAtlasNeedsUpdate = true;
// Remove name from used names when orb is destroyed
usedNames.delete(this.name);
    }

    updateLabelPosition() {
// No longer needed since we're using 3D billboards
    }
}



function manageOrbs() {
    // Skip orb management entirely on mobile for better performance
    if (MOBILE_PERFORMANCE_MODE) {
        console.log('Mobile performance mode: Orbs disabled');
        setTimeout(manageOrbs, SPAWN_INTERVAL);
        return;
    }
    
    
    // Create initial bot orbs if not done yet
    if (!botOrbsInitialized) {
        createInitialBotOrbs();
    }
    
    // Count current orbs
    const realUserOrbCount = orbs.filter(orb => orb.isRealUser).length;
    const botOrbCount = orbs.filter(orb => !orb.isRealUser).length;
    const totalOrbs = orbs.length;
    
    // We want to maintain exactly VISIBLE_ORB_LIMIT total orbs
    // Real users get priority, bots fill the remaining slots
    const desiredBotCount = Math.max(0, VISIBLE_ORB_LIMIT - realUserOrbCount);
    
    // Add bot orbs if we need more
    if (botOrbCount < desiredBotCount) {
        const orbsToAdd = desiredBotCount - botOrbCount;
        console.log(`Adding ${orbsToAdd} bot orbs (have ${botOrbCount}, need ${desiredBotCount})`);
        for (let i = 0; i < orbsToAdd; i++) {
            const botOrb = new Orb(getRandomName(), false);
            orbs.push(botOrb);
        }
    }
    
    // Remove excess bot orbs if we have too many
    if (botOrbCount > desiredBotCount) {
        const orbsToRemove = botOrbCount - desiredBotCount;
        console.log(`Removing ${orbsToRemove} excess bot orbs (have ${botOrbCount}, need ${desiredBotCount})`);
        
        // Remove bot orbs from the end first (less visible positions)
        let removedCount = 0;
        for (let i = orbs.length - 1; i >= 0 && removedCount < orbsToRemove; i--) {
            if (!orbs[i].isRealUser) {
                const removedOrb = orbs.splice(i, 1)[0];
                usedNames.delete(removedOrb.name);
                removedCount++;
            }
        }
    }
    
    // Ensure real users are prioritized in visible positions
    prioritizeRealUsersInVisiblePositions();
    
    // Trim to exactly VISIBLE_ORB_LIMIT orbs (safety check)
    if (orbs.length > VISIBLE_ORB_LIMIT) {
        console.warn(`Too many orbs (${orbs.length}), trimming to ${VISIBLE_ORB_LIMIT}`);
        // Remove excess orbs from the end (should be bots due to prioritization)
        const excessOrbs = orbs.splice(VISIBLE_ORB_LIMIT);
        excessOrbs.forEach(orb => {
            if (!orb.isRealUser) {
                usedNames.delete(orb.name);
            }
        });
    }
    
    // Log current state periodically
    if (Math.random() < 0.1) { // 10% chance to log (every ~40 seconds on average)
        const currentBotCount = orbs.filter(orb => !orb.isRealUser).length;
        const currentRealUserCount = orbs.filter(orb => orb.isRealUser).length;
        console.log(`Orb status: ${currentBotCount} bots, ${currentRealUserCount} real users, ${orbs.length} total (limit: ${VISIBLE_ORB_LIMIT})`);
        console.log(`Visible orbs: ${orbs.slice(0, VISIBLE_ORB_LIMIT).map((orb, i) => `${i}: ${orb.name}(${orb.isRealUser ? 'USER' : 'BOT'})`).join(', ')}`);
    }

    setTimeout(manageOrbs, SPAWN_INTERVAL);
}
