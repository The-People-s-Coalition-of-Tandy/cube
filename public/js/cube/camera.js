// Camera controls
let cameraPos = [0.0, 1.1177, 0.858585]; // Use first keyframe position as starting position
let cameraRot = [0.0, 0.0]; // Will be calculated from first keyframe target
let keys = {};
let mouseLocked = false;
let lastMouseX = 0;
let lastMouseY = 0;
const MOVE_SPEED = 0.05;
const MOUSE_SENSITIVITY = 0.002;

// Mobile/touch support
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Mobile performance optimizations
const MOBILE_PERFORMANCE_MODE = isMobile;
const MOBILE_RESOLUTION_SCALE = 0.6; // Render at 60% resolution on mobile
const MOBILE_MAX_ORBS = 0; // No orbs on mobile for better performance
const DESKTOP_MAX_ORBS = 6; // Keep full orbs on desktop

let cameraMode = isMobile ? 0 : 1; // Start with polar on mobile, free-fly on desktop
const CAMERA_MODES = ['polar', 'free-fly', 'look-at'];
const STAGE_TARGET = [0.0, 1.12, 0.0]; // Stage position (PLANE_CENTER)

// Film mode for smooth camera movement (for recording)
let filmMode = false;
let cameraVelocity = { x: 0, y: 0, z: 0 };
const FILM_ACCELERATION = 0.015; // Increased from 0.003 for faster response
const FILM_DECELERATION = 0.75; // Changed from 0.85 for smoother deceleration
const FILM_MAX_SPEED = 0.05;

// Camera presets for filming - positions that face the performer
const CAMERA_PRESETS = {
    '1': { pos: [0.0, 1.5, 3.0], name: 'Front Center' },           // Front view, slightly elevated
    '2': { pos: [-0.443, 1.135, 0.887], name: 'close left' },         // Front right angle
    '3': { pos: [-0.748, 3.015, 1.067], name: 'up right' },          // Front left angle
    '4': { pos: [-5.464, 3.717, 5.874], name: 'far away left' },           // Right side view
    '5': { pos: [7.168, -0.029, 6.732], name: 'low far right' },           // Left side view
    '6': { pos: [2.0, 1.3, -2.5], name: 'Back Right' },           // Back right angle
    '7': { pos: [24.107, 10.527, 30.030], name: 'super far' },           // Back left angle
    '8': { pos: [0.450, 0.998, -0.539], name: 'closeup' },          // Back view
    '9': { pos: [0.0, 2.5, 1.5], name: 'High Angle' },            // High angle shot
    '0': { pos: [0.427, 10.267, 0.417], name: 'above' }              // Low angle shot
};

function jumpToPreset(presetKey) {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) return;
    
    console.log(`Jumping to camera preset ${presetKey}: ${preset.name}`);
    
    // Instantly set camera position
    cameraPos[0] = preset.pos[0];
    cameraPos[1] = preset.pos[1];
    cameraPos[2] = preset.pos[2];
    
    // Calculate rotation to look at the performer (stage center)
    calculateLookAtRotationToTarget(STAGE_TARGET);
    
    // Switch to free-fly mode for manual control after preset
    cameraMode = 1;
    usePolarCamera = false;
    updateCameraModeIndicator();
    
    // Show preset info briefly
    // showPresetInfo(preset.name);
}

function showPresetInfo(presetName) {
    // Create or update preset info display
    let presetInfo = document.getElementById('presetInfo');
    if (!presetInfo) {
        presetInfo = document.createElement('div');
        presetInfo.id = 'presetInfo';
        presetInfo.style.cssText = `
            position: fixed;
            top: 60px;
            left: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(presetInfo);
    }
    
    presetInfo.textContent = `📹 ${presetName}`;
    presetInfo.style.opacity = '1';
    
    // Hide after 2 seconds
    setTimeout(() => {
        presetInfo.style.opacity = '0';
    }, 2000);
}

function togglePresetGuide() {
    const guide = document.getElementById('presetGuide');
    if (!guide) return;
    
    const isVisible = guide.style.opacity === '1';
    guide.style.opacity = isVisible ? '0' : '1';
    
    if (!isVisible) {
        // Auto-hide after 5 seconds
        setTimeout(() => {
            guide.style.opacity = '0';
        }, 5000);
    }
}

// Intro camera sequence
let introActive = false;
let introStartTime = 0;
let introDuration = 7000; // Increased to 7 seconds for the updated sequence
let savedCameraPos = [0.0, 0.0, 0.0];
let savedCameraRot = [0.0, 0.0];
let savedCameraMode = 1;
let introHasRun = false; // Flag to prevent intro from running multiple times

const introKeyframes = [
    { time: 0, pos: [0.0, 1.1177, 0.858585], target: [0.0, 1.12, 0.0] },
    { time: 2.0, pos: [0.0, 1.1177, 0.858585], target: [0.0, 1.12, 0.0] }, // Hold position for 2 seconds
    { time: 5.0, pos: [
  25.682387074225637,
  11.432907063439641,
  0.31418526387081597
] }, 
    { time: 7.0, pos: [
  0.20940000578790552,
  1.5115137805417105,
  -3.0745885709316747
], target: [0.0, 1.12, 0.0] },
    // { time: 10, pos: [0.03506399145371511, 1.9420566568593576, -3.7719858626962317], target: [0.0, 1.12, 0.0] }


];

let usePolarCamera = (cameraMode === 0); // Use polar camera on mobile, free-fly on desktop
let touchStartX = 0;
let touchStartY = 0;
let polarRotation = 2.9824999999999946; // For polar camera mode
let polarPitch = 0.514; // For polar camera mode
let polarDistance = 5.0; // Distance for polar camera mode (for pinch-to-zoom)

// Pinch gesture tracking
let initialPinchDistance = 0;
let initialPolarDistance = 5.0;
let isPinching = false;

[

]
function startIntroSequence() {
    // Check if intro has already run
    if (introHasRun) {
        console.log('Intro sequence already completed, skipping...');
        return;
    }
    
    console.log('Starting intro camera sequence...');
    
    // Mark intro as having run
    introHasRun = true;
    
    // Save current camera state
    savedCameraPos = [...cameraPos];
    savedCameraRot = [...cameraRot];
    savedCameraMode = cameraMode;
    
    // Set intro state
    introActive = true;
    introStartTime = Date.now();
    
    // Set initial position from first keyframe
    const firstKeyframe = introKeyframes[0];
    cameraPos = [...firstKeyframe.pos];
    if (firstKeyframe.target) {
        calculateLookAtRotationToTarget(firstKeyframe.target);
    }
    
    console.log('Intro sequence started, duration:', introDuration / 1000, 'seconds');
}

function updateIntroCamera() {
    if (!introActive) return;
    
    const elapsed = Date.now() - introStartTime;
    const progress = elapsed / introDuration;
    
    // Check if intro is complete
    if (progress >= 1.0) {
        endIntroSequence();
        return;
    }
    
    // Find current keyframe segment
    const currentTime = elapsed / 1000; // Convert to seconds
    let currentKeyframe = null;
    let nextKeyframe = null;
    
    for (let i = 0; i < introKeyframes.length - 1; i++) {
        if (currentTime >= introKeyframes[i].time && currentTime < introKeyframes[i + 1].time) {
            currentKeyframe = introKeyframes[i];
            nextKeyframe = introKeyframes[i + 1];
            break;
        }
    }
    
    // If we're past the last keyframe, use the last one
    if (!currentKeyframe) {
        currentKeyframe = introKeyframes[introKeyframes.length - 1];
        cameraPos = [...currentKeyframe.pos];
        if (currentKeyframe.target) {
            calculateLookAtRotationToTarget(currentKeyframe.target);
        }
        return;
    }
    
    // Interpolate between keyframes
    if (nextKeyframe) {
        const segmentProgress = (currentTime - currentKeyframe.time) / (nextKeyframe.time - currentKeyframe.time);
        const easedProgress = easeInOutCubic(segmentProgress);
        
        // Interpolate position
        cameraPos[0] = lerp(currentKeyframe.pos[0], nextKeyframe.pos[0], easedProgress);
        cameraPos[1] = lerp(currentKeyframe.pos[1], nextKeyframe.pos[1], easedProgress);
        cameraPos[2] = lerp(currentKeyframe.pos[2], nextKeyframe.pos[2], easedProgress);
        
        // Handle target (look-at)
        const useTarget = nextKeyframe.target || currentKeyframe.target;
        if (useTarget) {
            calculateLookAtRotationToTarget(useTarget);
        }
    }
}

function endIntroSequence() {
    console.log('Intro sequence complete, returning to normal camera control');
    introActive = false;
    
    // Restore camera mode (but keep final position)
    cameraMode = savedCameraMode;
    usePolarCamera = (cameraMode === 0);
    updateCameraModeIndicator();
    
    // Add a 1-second delay before showing Blueby
    console.log('Waiting 1 second before showing Blueby...');
    setTimeout(() => {
        // Now show Blueby after intro is complete
        // check if local storage has a username
        if (!localStorage.getItem('cubeUsername')) {
            showBlueby();
        } else {
            console.log('Username already exists, connecting to WebSocket...');
            console.log(localStorage.getItem('cubeUsername'));
            console.log(localStorage.getItem('cubeOrbColor'));

            // Enable controls now that user has joined
        hasJoinedCube = true;
        
        // Enable chat input since user is joining (bypassing tutorial)
        const chatInputContainer = document.getElementById('chatInputContainer');
        chatInputContainer.classList.add('tutorial-complete');
            connectWebSocketWithUserData(localStorage.getItem('cubeUsername'), localStorage.getItem('cubeOrbColor'));
        }
    }, 1000);
}

// Fallback to ensure chat is always available after a reasonable time
// This handles edge cases where tutorial might not complete properly
setTimeout(() => {
    const chatInputContainer = document.getElementById('chatInputContainer');
    if (!chatInputContainer.classList.contains('tutorial-complete')) {
        console.log('Fallback: Enabling chat input after timeout');
        chatInputContainer.classList.add('tutorial-complete');
    }
}, 30000); // 30 seconds fallback

function calculateLookAtRotationToTarget(target) {
    // Calculate vector from camera to target
    const dx = target[0] - cameraPos[0];
    const dy = target[1] - cameraPos[1];
    const dz = target[2] - cameraPos[2];
    
    // Calculate yaw (horizontal rotation)
    const yaw = Math.atan2(dx, -dz);
    
    // Calculate pitch (vertical rotation)
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const pitch = Math.atan2(-dy, horizontalDistance);
    
    // Update camera rotation
    cameraRot[0] = pitch;
    cameraRot[1] = yaw;
}

// Utility functions for smooth interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateCameraModeIndicator() {
    const indicator = document.getElementById('cameraMode');
    if (isMobile) {
        let mobileText = '📱 Mobile Camera';
        if (MOBILE_PERFORMANCE_MODE) {
            mobileText += ` 🚀 Performance Mode (${Math.floor(MOBILE_RESOLUTION_SCALE * 100)}% res, no orbs)`;
        }
        indicator.textContent = mobileText;
        return;
    }
    
    let modeText = '';
    switch(cameraMode) {
        case 0: // polar
            modeText = '🔄 Polar Camera (C to cycle)';
            break;
        case 1: // free-fly
            modeText = '🎮 Free-fly Camera (C to cycle)';
            break;
        case 2: // look-at
            modeText = '🎯 Look-at Stage (C to cycle)';
            break;
    }
    
    // Add film mode indicator if active
    if (filmMode) {
        modeText += ' 🎬 FILM MODE';
    }
    
    // Add gamepad status
    if (gamepadConnected) {
        modeText += ' 🎮 GAMEPAD';
    }
    
    indicator.textContent = modeText;
}
function updateCamera() {
    // Don't process camera updates until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // Process gamepad input first
    processGamepadInput();
    
    // Handle different camera modes
    if (cameraMode === 0) return; // Polar mode - no manual movement
    
    // Calculate movement vectors based on current camera mode
    let forward, right;
    
    if (cameraMode === 2) { // Look-at mode
        // Calculate rotation to look at stage
        calculateLookAtRotation();
    }
    
    // Use current rotation for movement calculations
    const yaw = cameraRot[1];
    const pitch = cameraRot[0];
    
    // Calculate forward direction (where we're looking) - fixed coordinate system
    forward = [
        Math.sin(yaw) * Math.cos(pitch),  // X component
        -Math.sin(pitch),                 // Y component (negative because up is positive Y)
        -Math.cos(yaw) * Math.cos(pitch)  // Z component (negative because forward is negative Z)
    ];
    
    // Calculate right direction (90 degrees from forward in horizontal plane)
    right = [
        Math.cos(yaw),   // X component
        0,               // Y component (no vertical component for strafe)
        Math.sin(yaw)    // Z component
    ];
    
    // Calculate up direction (for vertical movement)
    const up = [0, 1, 0];
    
    if (filmMode) {
        // Film mode: smooth acceleration/deceleration
        let targetVelocity = { x: 0, y: 0, z: 0 };
        
        // Calculate target velocity based on key inputs
        if (keys['KeyW'] || keys['GamepadW']) {
            const intensity = keys['GamepadLeftY'] ? Math.abs(keys['GamepadLeftY']) : 1.0;
            targetVelocity.x += forward[0] * FILM_MAX_SPEED * intensity;
            targetVelocity.y += forward[1] * FILM_MAX_SPEED * intensity;
            targetVelocity.z += forward[2] * FILM_MAX_SPEED * intensity;
        }
        if (keys['KeyS'] || keys['GamepadS']) {
            const intensity = keys['GamepadLeftY'] ? Math.abs(keys['GamepadLeftY']) : 1.0;
            targetVelocity.x -= forward[0] * FILM_MAX_SPEED * intensity;
            targetVelocity.y -= forward[1] * FILM_MAX_SPEED * intensity;
            targetVelocity.z -= forward[2] * FILM_MAX_SPEED * intensity;
        }
        if (keys['KeyA'] || keys['GamepadA']) {
            const intensity = keys['GamepadLeftX'] ? Math.abs(keys['GamepadLeftX']) : 1.0;
            targetVelocity.x -= right[0] * FILM_MAX_SPEED * intensity;
            targetVelocity.y -= right[1] * FILM_MAX_SPEED * intensity;
            targetVelocity.z -= right[2] * FILM_MAX_SPEED * intensity;
        }
        if (keys['KeyD'] || keys['GamepadD']) {
            const intensity = keys['GamepadLeftX'] ? Math.abs(keys['GamepadLeftX']) : 1.0;
            targetVelocity.x += right[0] * FILM_MAX_SPEED * intensity;
            targetVelocity.y += right[1] * FILM_MAX_SPEED * intensity;
            targetVelocity.z += right[2] * FILM_MAX_SPEED * intensity;
        }
        if (keys['Space'] || keys['GamepadSpace']) {
            const intensity = keys['GamepadRightTrigger'] || 1.0;
            targetVelocity.y += FILM_MAX_SPEED * intensity;
        }
        if (keys['ShiftLeft'] || keys['ShiftRight'] || keys['GamepadShift']) {
            const intensity = keys['GamepadLeftTrigger'] || 1.0;
            targetVelocity.y -= FILM_MAX_SPEED * intensity;
        }
        
        // Smoothly interpolate current velocity toward target velocity
        const velocityKeys = ['x', 'y', 'z'];
        for (let i = 0; i < 3; i++) {
            const key = velocityKeys[i];
            const velocityDiff = targetVelocity[key] - cameraVelocity[key];
            
            // Use a single interpolation factor for smooth movement
            cameraVelocity[key] += velocityDiff * FILM_ACCELERATION;
            
            // Stop very small velocities to prevent jitter
            if (Math.abs(cameraVelocity[key]) < 0.0001) {
                cameraVelocity[key] = 0;
            }
        }
        
        // Apply velocity to camera position
        cameraPos[0] += cameraVelocity.x;
        cameraPos[1] += cameraVelocity.y;
        cameraPos[2] += cameraVelocity.z;
        
    } else {
        // Normal mode: direct movement
        if (keys['KeyW'] || keys['GamepadW']) {
            const intensity = keys['GamepadLeftY'] ? Math.abs(keys['GamepadLeftY']) : 1.0;
            cameraPos[0] += forward[0] * MOVE_SPEED * intensity;
            cameraPos[1] += forward[1] * MOVE_SPEED * intensity;
            cameraPos[2] += forward[2] * MOVE_SPEED * intensity;
        }
        if (keys['KeyS'] || keys['GamepadS']) {
            const intensity = keys['GamepadLeftY'] ? Math.abs(keys['GamepadLeftY']) : 1.0;
            cameraPos[0] -= forward[0] * MOVE_SPEED * intensity;
            cameraPos[1] -= forward[1] * MOVE_SPEED * intensity;
            cameraPos[2] -= forward[2] * MOVE_SPEED * intensity;
        }
        if (keys['KeyA'] || keys['GamepadA']) {
            const intensity = keys['GamepadLeftX'] ? Math.abs(keys['GamepadLeftX']) : 1.0;
            cameraPos[0] -= right[0] * MOVE_SPEED * intensity;  // Strafe left
            cameraPos[1] -= right[1] * MOVE_SPEED * intensity;
            cameraPos[2] -= right[2] * MOVE_SPEED * intensity;
        }
        if (keys['KeyD'] || keys['GamepadD']) {
            const intensity = keys['GamepadLeftX'] ? Math.abs(keys['GamepadLeftX']) : 1.0;
            cameraPos[0] += right[0] * MOVE_SPEED * intensity;  // Strafe right
            cameraPos[1] += right[1] * MOVE_SPEED * intensity;
            cameraPos[2] += right[2] * MOVE_SPEED * intensity;
        }
        if (keys['Space'] || keys['GamepadSpace']) {
            const intensity = keys['GamepadRightTrigger'] || 1.0;
            cameraPos[1] += MOVE_SPEED * intensity;  // Move up
        }
        if (keys['ShiftLeft'] || keys['ShiftRight'] || keys['GamepadShift']) {
            const intensity = keys['GamepadLeftTrigger'] || 1.0;
            cameraPos[1] -= MOVE_SPEED * intensity;  // Move down
        }
    }

    // camera position log
    // console.log(cameraPos);
}

function calculateLookAtRotation() {
    // Calculate vector from camera to stage
    const dx = STAGE_TARGET[0] - cameraPos[0];
    const dy = STAGE_TARGET[1] - cameraPos[1];
    const dz = STAGE_TARGET[2] - cameraPos[2];
    
    // Calculate yaw (horizontal rotation)
    const yaw = Math.atan2(dx, -dz);
    
    // Calculate pitch (vertical rotation)
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
    const pitch = Math.atan2(-dy, horizontalDistance);
    
    // Update camera rotation
    cameraRot[0] = pitch;
    cameraRot[1] = yaw;
}
