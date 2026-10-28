const date = document.getElementById('date');
date.innerHTML = new Date().toLocaleDateString();

const playOverlay = document.getElementById('playOverlay');
const enterButton = document.getElementById('enterButton');


// Define the enter button click handler
const handleEnterButtonClick = () => {
    // Show the canvas immediately to prevent flashing
    document.getElementById('glCanvas').style.display = 'block';
    
    // Initialize video system immediately on user interaction (required for Chrome)
    if (!videoStarted) {
        console.log('Initializing video on user interaction for Chrome compatibility...');
        initializeVideo();
        
        // Start video playback immediately after initialization
        setTimeout(() => {
            if (!videoStarted) {
                console.log('Starting video playback after initialization...');
                startVideo();
            }
        }, 100); // Small delay to allow initialization to complete
    }
    
    // Initialize and prepare audio
    const audioNodes = setupAudioContext();
    
    // Resume audio context if suspended (browser policy)
    if (audioContext && audioContext.state === 'suspended') {
        console.log('Resuming suspended audio context...');
        audioContext.resume();
    }
    
    // Ensure video is muted at first
    if (video) {
        video.muted = true;
        console.log('Video muted for audio preparation');
    }
    
    // Reset gain to 0 before starting fade
    if (audioNodes && audioNodes.gainNode) {
        audioNodes.gainNode.gain.value = 0;
        console.log('Reset gain to 0 before fade');
    }
    
    // We don't want to show BlueBy immediately anymore
    // The intro sequence will call showBlueby() when it's done
    
    // Hide the welcome screen
    document.getElementById('welcomeScreen').classList.add('hidden');
    
    // Start the intro sequence
    startIntroSequence();
    
    // Start fading in audio after a short delay
    setTimeout(() => {
        console.log('Starting audio fade in from welcome screen...');
        if (video) video.muted = false;
        fadeInAudio(audioNodes);
    }, 400);
    
    // No need to show character selection - that happens through Blueby now
};

// Add the click event handler to the enter button
enterButton.addEventListener('click', handleEnterButtonClick);

// Start the experience after loading is complete
function startExperience() {
    // Display the welcome screen/enter button
    playOverlay.style.display = 'flex';
    
    // Make sure the character selection screen is hidden initially
    document.getElementById('characterSelection').style.display = 'none';
    
    // Replace the existing click handler if needed
    enterButton.removeEventListener('click', handleEnterButtonClick);
    enterButton.addEventListener('click', handleEnterButtonClick);
}

// Initial call to set up the page
startExperience();

// Character selection functionality
let selectedColor = null;
let username = '';
let hasJoinedCube = false; // Track whether user has completed character selection

const usernameInput = document.getElementById('usernameInput');
const joinButton = document.getElementById('joinButton');
const characterMessage = document.getElementById('characterMessage');
const orbOptions = document.querySelectorAll('.orb-option');
const characterForm = document.getElementById('characterForm');

// Username input validation
usernameInput.addEventListener('input', (e) => {
    username = e.target.value.trim();
    validateCharacterSelection();
});

// Orb color selection
orbOptions.forEach(option => {
    option.addEventListener('click', () => {
        // Remove previous selection
        orbOptions.forEach(opt => opt.classList.remove('selected'));
        
        // Add selection to clicked option
        option.classList.add('selected');
        selectedColor = option.dataset.color;
        
        validateCharacterSelection();
    });
});

function validateCharacterSelection() {
    // If user already completed the tutorial, we don't need to show this screen
    if (hasJoinedCube) {
        return;
    }
    
    const isValid = username.length >= 2 && selectedColor !== null;
    joinButton.disabled = !isValid;
    
    if (username.length === 0 && selectedColor === null) {
        characterMessage.textContent = 'Enter a username (2+ characters) and select an orb color to join';
        characterMessage.style.color = '#000080'; // Classic dark blue
    } else if (username.length > 0 && username.length < 2) {
        characterMessage.textContent = 'Username must be at least 2 characters';
        characterMessage.style.color = '#800000'; // Classic dark red
    } else if (username.length >= 2 && !selectedColor) {
        characterMessage.textContent = 'Please select an orb color above';
        characterMessage.style.color = '#000080'; // Classic dark blue
    } else if (username.length === 0 && selectedColor) {
        characterMessage.textContent = 'Please enter a username (2+ characters)';
        characterMessage.style.color = '#000080'; // Classic dark blue
    } else if (isValid) {
        characterMessage.textContent = `Ready to join as ${username}!`;
        characterMessage.style.color = '#008000'; // Classic dark green
    } else {
        characterMessage.textContent = 'Enter a username and select a color to continue';
        characterMessage.style.color = '#000080'; // Classic dark blue
    }
}

// Initialize with helpful message
characterMessage.textContent = 'Enter a username (2+ characters) and select an orb color to join';
characterMessage.style.color = '#000080'; // Classic dark blue

// Ensure button starts disabled and validation runs
validateCharacterSelection();

// Join button functionality
joinButton.addEventListener('click', () => {
    if (username.length >= 2 && selectedColor) {
        // Store user data (you can expand this to send to server)
        localStorage.setItem('cubeUsername', username);
        localStorage.setItem('cubeOrbColor', selectedColor);
        
        // Enable controls now that user has joined
        hasJoinedCube = true;
        
        // Connect to WebSocket with user data
        connectWebSocketWithUserData(username, selectedColor);
        
        // IMPORTANT: Start video immediately on user interaction for iOS compatibility
        // This ensures the video.play() call happens within the user gesture event
        if (!videoStarted) {
            console.log('Starting video immediately on user interaction (iOS compatibility)...');
            // Unmute the video since user has interacted
            video.muted = false;
            
            // Try to start video playback immediately
            const immediatePlay = () => {
                video.play().then(() => {
                    console.log('Video started playing immediately');
                    videoStarted = true;
                }).catch(error => {
                    console.warn('Immediate video playback failed, will retry after animations:', error);
                    // If immediate play fails, we'll try again in startVideo()
                });
            };
            
            // Check if video is ready to play
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
                immediatePlay();
            } else {
                // If not ready, try to load it and play when ready
                console.log('Video not ready, attempting to load...');
                video.addEventListener('canplay', immediatePlay, { once: true });
                
                // Also try to trigger loading if video source isn't set
                if (!video.src && !isUsingFallback) {
                    console.log('No video source detected, initializing video...');
                    initializeVideo();
                }
            }
        }
        
        // Start the blink animation on the character form
        characterForm.classList.add('animate');
        
        // After the blink animation completes (0.5s), start the parting animation
        setTimeout(() => {
            document.getElementById('characterSelection').classList.add('hidden');
            
            // Start the video after the parting animation starts (fallback if immediate play failed)
            setTimeout(() => {
                if (!videoStarted) {
                    console.log('Video not started yet, calling startVideo() as fallback...');
                    startVideo();
                } else {
                    console.log('Video already started, just handling UI transitions...');
                    playOverlay.classList.add('hidden');
                    // Canvas is already shown from earlier fix
                    
                    // Resume audio context if suspended (don't recreate it)
                    if (audioContext && audioContext.state === 'suspended') {
                        console.log('Resuming suspended audio context...');
                        audioContext.resume();
                    }
                    
                    // Use existing audio nodes if they exist, otherwise set them up
                    if (!audioNodes) {
                        console.log('Audio nodes not found, setting up audio context...');
                        audioNodes = setupAudioContext();
                    }
                    
                    // Ensure video is muted before starting fade
                    if (!video.muted) {
                        console.log('Video was unmuted, muting it before fade...');
                        video.muted = true;
                    }
                    
                    // Reset gain to 0 before starting fade
                    if (audioNodes && audioNodes.gainNode) {
                        audioNodes.gainNode.gain.value = 0;
                        console.log('Reset gain to 0 before fade');
                    }
                    
                    setTimeout(() => {
                        console.log('Unmuting video and starting audio fade with existing nodes...');
                        video.muted = false;
                        fadeInAudio(audioNodes);
                    }, 400); // Reduced from 1200ms to 400ms for faster audio start
                }
                
                // Show mascot after screen separation animation completes
                setTimeout(() => {
                    showMascot();
                }, 1500); // Remaining time for parting animation to complete
                
            }, 1200); // Half of the 2.4s transition
            
        }, 500); // Duration of blink animation
        
        console.log(`User ${username} joined with color ${selectedColor}`);
    }
});

// Allow Enter key to submit character selection
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !joinButton.disabled) {
        joinButton.click();
    }
});

function showMascot() {
    // We no longer need this function since we're showing Blueby at the end of the intro sequence
    // But we'll keep it for backward compatibility
    console.log('showMascot called, but we now show Blueby at end of intro instead');
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    // Skip tutorial with '[' key (for debugging)
    if (e.key === '[') {
        console.log('Skipping Blueby tutorial (debug mode)');
        hideBlueby();
        e.preventDefault();
        return;
    }
    
    // Don't process any controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // Handle "/" key to open chat (only if chat input is not focused)
    if (e.key === '/' && !chatInputFocused) {
        focusChat();
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    
    // If chat input is focused, don't process camera controls
    if (chatInputFocused) {
        return;
    }
    
    keys[e.code] = true;
    
    // Cycle camera modes with 'C' key (only on desktop)
    if (e.code === 'KeyC' && !isMobile) {
        cameraMode = (cameraMode + 1) % 3;
        
        // Update legacy usePolarCamera for compatibility
        usePolarCamera = (cameraMode === 0);
        
        console.log('Camera mode:', CAMERA_MODES[cameraMode]);
        updateCameraModeIndicator();
        
        // Release pointer lock when switching away from free-fly
        if (cameraMode !== 1 && mouseLocked) {
            document.exitPointerLock();
        }
    }
    
    // Toggle look-at mode with 'L' key (alternative binding)
    if (e.code === 'KeyL' && !isMobile) {
        cameraMode = (cameraMode === 2) ? 1 : 2; // Toggle between free-fly and look-at
        usePolarCamera = false;
        console.log('Camera mode:', CAMERA_MODES[cameraMode]);
        updateCameraModeIndicator();
    }
    
    // Toggle film mode with 'F' key (only on desktop)
    if (e.code === 'KeyF' && !isMobile) {
        filmMode = !filmMode;
        console.log('Film mode:', filmMode ? 'ON' : 'OFF');
        
        // Reset velocity when toggling film mode
        if (!filmMode) {
            cameraVelocity = { x: 0, y: 0, z: 0 };
        }
        
        updateCameraModeIndicator();
    }
    
    // Toggle preset guide with 'P' key (only on desktop)
    if (e.code === 'KeyP' && !isMobile) {
        togglePresetGuide();
    }
    
    // Log current camera position with 'G' key (only on desktop)
    if (e.code === 'KeyG' && !isMobile) {
        console.log('📹 Current Camera Position:');
        console.log(`Position: [${cameraPos[0].toFixed(3)}, ${cameraPos[1].toFixed(3)}, ${cameraPos[2].toFixed(3)}]`);
        console.log(`Rotation: [${cameraRot[0].toFixed(3)}, ${cameraRot[1].toFixed(3)}]`);
        console.log('Copy this for preset:', `{ pos: [${cameraPos[0].toFixed(3)}, ${cameraPos[1].toFixed(3)}, ${cameraPos[2].toFixed(3)}], name: 'Custom Angle' }`);
        
        // Show visual feedback
        showPresetInfo('Position Logged to Console');
    }
    
    // Camera presets with number keys (1-9, 0) - only on desktop
    if (!isMobile) {
        const numberKeys = {
            'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5',
            'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0'
        };
        
        if (numberKeys[e.code]) {
            jumpToPreset(numberKeys[e.code]);
            e.preventDefault(); // Prevent any default behavior
            return;
        }
    }
    
    // Request pointer lock on first key press for mouse look (only in free-fly mode)
    if (!mouseLocked && cameraMode === 1 && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD')) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('keyup', (e) => {
    // Don't process any controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // If chat input is focused, don't process camera controls
    if (chatInputFocused) {
        return;
    }
    
    keys[e.code] = false;
});

// Mouse controls
document.addEventListener('pointerlockchange', () => {
    // Only allow pointer lock if user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    mouseLocked = document.pointerLockElement === document.body;
});

document.addEventListener('mousemove', (e) => {
    // Don't process mouse controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    if (mouseLocked && cameraMode === 1) { // Only in free-fly mode
        cameraRot[1] += e.movementX * MOUSE_SENSITIVITY; // yaw
        cameraRot[0] += e.movementY * MOUSE_SENSITIVITY; // pitch (not inverted)
        
        // Clamp pitch to prevent flipping
        cameraRot[0] = Math.max(-Math.PI/2, Math.min(Math.PI/2, cameraRot[0]));
    } else {
        mouseX = e.clientX;
        // Update polar rotation for non-locked mouse (used in polar mode)
        // Only update on desktop devices, not mobile
        if (cameraMode === 0 && !isMobile) {
            polarRotation = mouseX * 0.0075 + 0.025;
        }
    }
});

// Touch event handlers for mobile
let inputFieldFocused = false;

// Track input field focus to temporarily allow zoom gestures
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFieldFocused = true;
        console.log('Input focused - allowing zoom gestures');
    }
});

document.addEventListener('focusout', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFieldFocused = false;
        console.log('Input unfocused - capturing zoom gestures for camera');
    }
});

document.addEventListener('touchstart', (e) => {
    // Don't process touch controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    // Prevent all default touch behaviors on iOS
    e.preventDefault();
    e.stopPropagation();
    
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isPinching = false;
    } else if (e.touches.length === 2) {
        // Start pinch gesture
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialPinchDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        initialPolarDistance = polarDistance;
        isPinching = true;
        console.log('Pinch started:', { initialPinchDistance, initialPolarDistance });
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    // Don't process touch controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    // Aggressively prevent all default behaviors
    e.preventDefault();
    e.stopPropagation();
    
    if (e.touches.length === 2 && cameraMode === 0 && isPinching) {
        // Handle pinch-to-zoom
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentPinchDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        // Calculate zoom factor based on pinch distance change
        const pinchRatio = currentPinchDistance / initialPinchDistance;
        polarDistance = initialPolarDistance / pinchRatio;
        
        // Clamp distance to reasonable bounds
        polarDistance = Math.max(1.0, Math.min(15.0, polarDistance));
        
        console.log('Pinch zoom:', { currentPinchDistance, pinchRatio, polarDistance });
    } else if (e.touches.length === 1 && cameraMode === 0 && !isPinching) {
        // Handle single-finger rotation (only when not pinching)
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        // Update polar camera rotation based on touch movement
        polarRotation += deltaX * 0.005; // Horizontal swipe controls rotation around cube
        polarPitch += deltaY * 0.002; // Vertical swipe controls pitch
        
        // Clamp pitch
        polarPitch = Math.max(0.1, Math.min(0.9, polarPitch));
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    // Don't process touch controls until user has joined the cube
    if (!hasJoinedCube) {
        return;
    }
    
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    // Prevent default behaviors
    e.preventDefault();
    e.stopPropagation();
    
    if (e.touches.length < 2) {
        isPinching = false;
    }
    
    // Update touch start position if there's still one finger down
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
}, { passive: false });

document.addEventListener('touchcancel', (e) => {
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    // Handle touch cancellation
    e.preventDefault();
    e.stopPropagation();
    isPinching = false;
}, { passive: false });

// Additional iOS-specific event prevention
document.addEventListener('gesturestart', (e) => {
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

document.addEventListener('gesturechange', (e) => {
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

document.addEventListener('gestureend', (e) => {
    // Allow default zoom behavior when input fields are focused
    if (inputFieldFocused) {
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });
