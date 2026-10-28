// Gamepad support
let gamepadIndex = -1;
let gamepadConnected = false;
const GAMEPAD_DEADZONE = 0.15; // Ignore small stick movements
const GAMEPAD_SENSITIVITY = 0.8; // Overall sensitivity multiplier

// Gamepad button mappings (Xbox/PlayStation style)
const GAMEPAD_BUTTONS = {
    A: 0,           // A/X button
    B: 1,           // B/Circle button  
    X: 2,           // X/Square button
    Y: 3,           // Y/Triangle button
    LB: 4,          // Left bumper/L1
    RB: 5,          // Right bumper/R1
    LT: 6,          // Left trigger/L2
    RT: 7,          // Right trigger/R2
    SELECT: 8,      // Select/Share button
    START: 9,       // Start/Options button
    L_STICK: 10,    // Left stick click
    R_STICK: 11,    // Right stick click
    DPAD_UP: 12,    // D-pad up
    DPAD_DOWN: 13,  // D-pad down
    DPAD_LEFT: 14,  // D-pad left
    DPAD_RIGHT: 15  // D-pad right
};

// Gamepad axes mappings
const GAMEPAD_AXES = {
    LEFT_X: 0,      // Left stick horizontal
    LEFT_Y: 1,      // Left stick vertical
    RIGHT_X: 2,     // Right stick horizontal
    RIGHT_Y: 3      // Right stick vertical
};

// Gamepad event listeners
window.addEventListener('gamepadconnected', (e) => {
    console.log('Gamepad connected:', e.gamepad.id);
    gamepadIndex = e.gamepad.index;
    gamepadConnected = true;
    updateCameraModeIndicator();
});

window.addEventListener('gamepaddisconnected', (e) => {
    console.log('Gamepad disconnected');
    gamepadConnected = false;
    gamepadIndex = -1;
    updateCameraModeIndicator();
});

function getGamepadInput() {
    if (!gamepadConnected || gamepadIndex === -1) return null;
    
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamepadIndex];
    
    if (!gamepad) return null;
    
    return {
        axes: gamepad.axes,
        buttons: gamepad.buttons
    };
}

function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
    return Math.abs(value) < deadzone ? 0 : value;
}

// Gamepad button state tracking for debouncing
let lastButtonStates = {};

function processGamepadInput() {
    // Don't process gamepad input until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    const input = getGamepadInput();
    if (!input) return;
    
    // Handle button presses (with debouncing)
    
    // Film mode toggle (Y/Triangle button)
    if (input.buttons[GAMEPAD_BUTTONS.Y]?.pressed && !lastButtonStates.Y && !isMobile) {
        filmMode = !filmMode;
        console.log('Gamepad: Film mode', filmMode ? 'ON' : 'OFF');
        
        if (!filmMode) {
            cameraVelocity = { x: 0, y: 0, z: 0 };
        }
        updateCameraModeIndicator();
    }
    
    // Camera mode cycling (X/Square button)
    if (input.buttons[GAMEPAD_BUTTONS.X]?.pressed && !lastButtonStates.X && !isMobile) {
        cameraMode = (cameraMode + 1) % 3;
        usePolarCamera = (cameraMode === 0);
        console.log('Gamepad: Camera mode:', CAMERA_MODES[cameraMode]);
        updateCameraModeIndicator();
        
        if (cameraMode !== 1 && mouseLocked) {
            document.exitPointerLock();
        }
    }
    
    // Look-at mode toggle (A/X button)
    if (input.buttons[GAMEPAD_BUTTONS.A]?.pressed && !lastButtonStates.A && !isMobile) {
        cameraMode = (cameraMode === 2) ? 1 : 2;
        usePolarCamera = false;
        console.log('Gamepad: Camera mode:', CAMERA_MODES[cameraMode]);
        updateCameraModeIndicator();
    }
    
    // Store button states for next frame
    lastButtonStates.Y = input.buttons[GAMEPAD_BUTTONS.Y]?.pressed;
    lastButtonStates.X = input.buttons[GAMEPAD_BUTTONS.X]?.pressed;
    lastButtonStates.A = input.buttons[GAMEPAD_BUTTONS.A]?.pressed;
    
    // Handle analog movement (only in free-fly and look-at modes)
    if (cameraMode !== 0) {
        // Left stick for movement (WASD equivalent)
        const leftX = applyDeadzone(input.axes[GAMEPAD_AXES.LEFT_X]) * GAMEPAD_SENSITIVITY;
        const leftY = applyDeadzone(input.axes[GAMEPAD_AXES.LEFT_Y]) * GAMEPAD_SENSITIVITY;
        
        // Right stick for camera rotation (only in free-fly mode)
        if (cameraMode === 1) {
            const rightX = applyDeadzone(input.axes[GAMEPAD_AXES.RIGHT_X]) * GAMEPAD_SENSITIVITY;
            const rightY = applyDeadzone(input.axes[GAMEPAD_AXES.RIGHT_Y]) * GAMEPAD_SENSITIVITY;
            
            // Apply camera rotation
            cameraRot[1] += rightX * 0.03; // yaw
            cameraRot[0] += rightY * 0.03; // pitch
            
            // Clamp pitch
            cameraRot[0] = Math.max(-Math.PI/2, Math.min(Math.PI/2, cameraRot[0]));
        }
        
        // Triggers for up/down movement
        const leftTrigger = input.buttons[GAMEPAD_BUTTONS.LT]?.value || 0;
        const rightTrigger = input.buttons[GAMEPAD_BUTTONS.RT]?.value || 0;
        
        // Store gamepad movement in keys object for updateCamera to process
        keys['GamepadW'] = leftY < -GAMEPAD_DEADZONE;
        keys['GamepadS'] = leftY > GAMEPAD_DEADZONE;
        keys['GamepadA'] = leftX < -GAMEPAD_DEADZONE;
        keys['GamepadD'] = leftX > GAMEPAD_DEADZONE;
        keys['GamepadSpace'] = rightTrigger > 0.1;
        keys['GamepadShift'] = leftTrigger > 0.1;
        
        // Store analog values for smooth movement
        keys['GamepadLeftX'] = leftX;
        keys['GamepadLeftY'] = leftY;
        keys['GamepadRightTrigger'] = rightTrigger;
        keys['GamepadLeftTrigger'] = leftTrigger;
    }
}
