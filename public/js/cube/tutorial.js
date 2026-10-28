let bluebyTimeout = null; // Track the auto-hide timeout
let tutorialTimeouts = []; // Track all tutorial-related timeouts
let tutorialSelectedColor = null;
let tutorialUsername = '';
let tutorialStage = 0; // Track the tutorial stage

// Define the stages of the tutorial
const TUTORIAL_STAGE_GREETING = 0;
const TUTORIAL_STAGE_ASK_NAME = 1;
const TUTORIAL_STAGE_CONFIRM_NAME = 2;
const TUTORIAL_STAGE_ASK_COLOR = 3;
const TUTORIAL_STAGE_CONFIRM_COLOR = 4;
const TUTORIAL_STAGE_CONTROLS = 5;
const TUTORIAL_STAGE_COMPLETE = 6;

// New tutorial flow with interactive prompts
const tutorialMessages = [
    "Hi! I'm <b>Blueby</b>, your guide to <i>The Tandy Cube</i>...",
    "What's your name?", // Will show input field
    "Nice to meet you, NAME! That's a great name.", // Will be personalized
    "What color would you like your orb to be?", // Will show color picker
    "COLOR is a great choice! You'll stand out in the cube.", // Will be personalized
    "Let me tell you how to move around:", // Start of controls explanation - CLEAR CHAT HERE
    "You can use the <strong>WASD</strong> keys to move around the space.",
    "Use the mouse to look around.",
    "Use <strong>spacebar</strong> to fly up, and <strong>shift</strong> to fly down.",
    "Press <strong>C</strong> to cycle camera modes.",
    "Press <strong>/</strong> to open chat. Enjoy the show!"
];

const welcomeBackMessages = [
    "NAME, is that you? Welcome back to the cube!",
]

let currentMessageIndex = 0;
let isTyping = false;

function hideBlueby() {
    const mascot = document.getElementById('mascot');
    const chatBubble = document.getElementById('chatBubble');
    const overlay = document.getElementById('bluebyOverlay');
    
    // Clear any ongoing timeouts
    if (bluebyTimeout) {
        clearTimeout(bluebyTimeout);
        bluebyTimeout = null;
    }
    
    // Clear all tutorial timeouts
    tutorialTimeouts.forEach(timeout => clearTimeout(timeout));
    tutorialTimeouts = [];
    
    // Stop any ongoing tutorial sequence
    isTyping = false;
    hideTypingIndicator();
    
    // Hide mascot, chat bubble, and overlay
    mascot.classList.remove('show');
    chatBubble.classList.remove('show');
    overlay.classList.remove('show');
    
    // Save the entered username and color to the global variables
    if (tutorialUsername && tutorialSelectedColor) {
        username = tutorialUsername;
        selectedColor = tutorialSelectedColor;
        
        // Store user data
        localStorage.setItem('cubeUsername', username);
        localStorage.setItem('cubeOrbColor', selectedColor);
        
        // Enable controls now that user has joined
        hasJoinedCube = true;
        
        // Enable chat input since user is joining (bypassing tutorial)
        const chatInputContainer = document.getElementById('chatInputContainer');
        chatInputContainer.classList.add('tutorial-complete');
        
        // Connect to WebSocket with user data
        connectWebSocketWithUserData(username, selectedColor);
        
        // IMPORTANT: Start video immediately since user has interacted
        if (!videoStarted) {
            console.log('Starting video immediately on user interaction...');
            // Unmute the video since user has interacted
            video.muted = false;
            
            // Try to start video playback immediately
            const immediatePlay = () => {
                video.play().then(() => {
                    console.log('Video started playing immediately');
                    videoStarted = true;
                }).catch(error => {
                    console.warn('Video playback failed, will retry:', error);
                    startVideo();
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
    }
    
    // Remove elements after fade out animation
    setTimeout(() => {
        mascot.style.display = 'none';
        chatBubble.style.display = 'none';
        overlay.style.display = 'none';
        
        // Reset tutorial state
        currentMessageIndex = 0;
        isTyping = false;
        tutorialStage = 0;
        
        const tutorialContainer = document.getElementById('tutorialMessages');
        tutorialContainer.innerHTML = '';
        const gotItButton = document.getElementById('gotItButton');
        gotItButton.style.display = 'none';
        
        // Hide the input section and color picker
        const inputSection = document.getElementById('tutorialInputSection');
        inputSection.style.display = 'none';
        inputSection.classList.remove('show');
        document.getElementById('tutorialColorPicker').style.display = 'none';
        
        // Show the chat input now that tutorial is complete
        const chatInputContainer = document.getElementById('chatInputContainer');
        chatInputContainer.classList.add('tutorial-complete');
    }, 500);
}

function showTypingIndicator() {
    const tutorialContainer = document.getElementById('tutorialMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator show';
    typingDiv.innerHTML = '<span class="username">blu3by01:</span> <span class="typing-dots">typing</span>';
    tutorialContainer.appendChild(typingDiv);
    
    // Scroll to bottom if needed
    tutorialContainer.scrollTop = tutorialContainer.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function showUserMessage(message) {
    const tutorialContainer = document.getElementById('tutorialMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'tutorial-user-message';
    messageDiv.innerHTML = `<span class="username">You:</span> ${message}`;
    
    tutorialContainer.appendChild(messageDiv);
    
    // Trigger animation
    setTimeout(() => {
        messageDiv.classList.add('show');
    }, 50);
    
    // Scroll to bottom
    tutorialContainer.scrollTop = tutorialContainer.scrollHeight;
}

function showNextMessage() {
    if (currentMessageIndex >= tutorialMessages.length || isTyping) {
        return;
    }
    
    // Clear chat before showing controls explanation, but add delay after color confirmation
    if (tutorialStage === TUTORIAL_STAGE_CONTROLS && currentMessageIndex === 5) {
        const tutorialContainer = document.getElementById('tutorialMessages');
        
        // Add a longer delay so users can read the color choice response
        setTimeout(() => {
            tutorialContainer.innerHTML = '';
            // Add a small delay to make the clear more noticeable, then continue
            setTimeout(() => {
                // Make sure we're still in the controls stage and continue
                tutorialStage = TUTORIAL_STAGE_CONTROLS;
                continueWithMessage();
            }, 300);
        }, 1200); // Reduced from 2000ms to 1200ms for better pacing
        return;
    }
    
    continueWithMessage();
}

function continueWithMessage() {
    isTyping = true;
    showTypingIndicator();
    
    // Show typing for a shorter time (500-1000ms)
    const typingDuration = 500 + Math.random() * 500;
    
    const typingTimeout = setTimeout(() => {
        hideTypingIndicator();
        
        const tutorialContainer = document.getElementById('tutorialMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'tutorial-message';
        
        // Personalize messages based on user input
        let messageText = tutorialMessages[currentMessageIndex];
        if (tutorialStage === TUTORIAL_STAGE_CONFIRM_NAME && tutorialUsername) {
            messageText = messageText.replace('NAME', tutorialUsername);
        } else if (tutorialStage === TUTORIAL_STAGE_CONFIRM_COLOR && tutorialSelectedColor) {
            // Get a color name based on the hex value
            const colorNames = {
                '#FF5252': 'Red',
                '#FF9800': 'Orange',
                '#FFEB3B': 'Yellow',
                '#4CAF50': 'Green',
                '#2196F3': 'Blue',
                '#9C27B0': 'Purple',
                '#E91E63': 'Pink',
                '#607D8B': 'Gray'
            };
            
            const colorName = colorNames[tutorialSelectedColor] || 'That color';
            messageText = messageText.replace('COLOR', colorName);
        }
        
        messageDiv.innerHTML = `<span class="username">blu3by01:</span> ${messageText}`;
        
        tutorialContainer.appendChild(messageDiv);
        
        // Trigger animation
        const animationTimeout = setTimeout(() => {
            messageDiv.classList.add('show');
            // Play notification sound when Blueby's message appears
            playNotificationSound();
        }, 50);
        tutorialTimeouts.push(animationTimeout);
        
        // Scroll to bottom if needed
        tutorialContainer.scrollTop = tutorialContainer.scrollHeight;
        
        currentMessageIndex++;
        isTyping = false;
        
        // Show input field or color picker based on tutorial stage
        if (tutorialStage === TUTORIAL_STAGE_ASK_NAME) {
            // Show the input field after asking for name
            const inputSection = document.getElementById('tutorialInputSection');
            inputSection.style.display = 'flex';
            // Trigger sliding animation
            setTimeout(() => {
                inputSection.classList.add('show');
            }, 50);
            document.getElementById('tutorialInput').focus();
        } else if (tutorialStage === TUTORIAL_STAGE_ASK_COLOR) {
            // Show the color picker after asking for color
            document.getElementById('tutorialColorPicker').style.display = 'block';
        } else if (tutorialStage === TUTORIAL_STAGE_COMPLETE) {
            // Show the "Got it!" button on the final message
            const gotItButton = document.getElementById('gotItButton');
            gotItButton.style.display = 'block';
        } else {
            // Schedule next message for other stages - shorter delay (800ms)
            const nextMessageTimeout = setTimeout(() => {
                // Update tutorial stage before showing next message
                // Only advance stage if we're not in the middle of controls explanation
                if (tutorialStage !== TUTORIAL_STAGE_CONTROLS || currentMessageIndex >= tutorialMessages.length - 1) {
                    tutorialStage++;
                }
                showNextMessage();
            }, 800); // Reduced from 1500ms to 800ms
            tutorialTimeouts.push(nextMessageTimeout);
        }
    }, typingDuration);
    tutorialTimeouts.push(typingTimeout);
}

function showBlueby() {
    // Don't show mascot on mobile devices since camera controls don't apply
    if (isMobile) {
        // Enable controls now that user has joined
        hasJoinedCube = true;
        
        // Enable chat input immediately for mobile users since tutorial won't run
        const chatInputContainer = document.getElementById('chatInputContainer');
        chatInputContainer.classList.add('tutorial-complete');
        return;
    }
    
    const mascot = document.getElementById('mascot');
    const chatBubble = document.getElementById('chatBubble');
    const overlay = document.getElementById('bluebyOverlay');
    const gotItButton = document.getElementById('gotItButton');
    
    // Clear any existing tutorial timeouts
    tutorialTimeouts.forEach(timeout => clearTimeout(timeout));
    tutorialTimeouts = [];
    
    // Reset tutorial state
    currentMessageIndex = 0;
    isTyping = false;
    tutorialStage = TUTORIAL_STAGE_GREETING;
    tutorialUsername = '';
    tutorialSelectedColor = null;
    
    const tutorialContainer = document.getElementById('tutorialMessages');
    tutorialContainer.innerHTML = '';
    
    // Hide input section and color picker initially
    document.getElementById('tutorialInputSection').style.display = 'none';
    document.getElementById('tutorialInputSection').classList.remove('show');
    document.getElementById('tutorialColorPicker').style.display = 'none';
    
    // Show overlay first, then mascot and chat bubble
    overlay.style.display = 'block';
    mascot.style.display = 'block';
    chatBubble.style.display = 'block';
    
    // Hide the "Got it!" button initially
    gotItButton.style.display = 'none';
    
    // Set up input event handlers
    const tutorialInput = document.getElementById('tutorialInput');
    const tutorialSubmit = document.getElementById('tutorialSubmit');
    
    tutorialInput.value = ''; // Clear any previous input
    
    // Handle tutorial input submission
    function handleTutorialInput() {
        const inputValue = tutorialInput.value.trim();
        if (inputValue.length >= 2) {
            // Hide input section with sliding animation
            const inputSection = document.getElementById('tutorialInputSection');
            inputSection.classList.remove('show');
            setTimeout(() => {
                inputSection.style.display = 'none';
            }, 400); // Wait for animation to complete
            
            // Show user's message in the chat
            showUserMessage(inputValue);
            
            // Store the username
            tutorialUsername = inputValue;
            
            // Advance to next stage
            tutorialStage = TUTORIAL_STAGE_CONFIRM_NAME;
            
            // Schedule next message after a brief delay
            const nextMessageTimeout = setTimeout(() => {
                showNextMessage();
            }, 800);
            tutorialTimeouts.push(nextMessageTimeout);
        } else {
            // Show error styling
            tutorialInput.style.borderColor = '#FF5252';
            setTimeout(() => {
                tutorialInput.style.borderColor = '#ccc';
            }, 800);
        }
    }
    
    // Set up input event listeners
    tutorialSubmit.onclick = handleTutorialInput;
    tutorialInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            handleTutorialInput();
        }
    };
    
    // Set up color picker event listeners
    const colorOptions = document.querySelectorAll('.tutorial-color-option');
    colorOptions.forEach(option => {
        option.onclick = function() {
            // Remove previous selection
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selection to clicked option
            this.classList.add('selected');
            
            // Store the selected color
            tutorialSelectedColor = this.getAttribute('data-color');
            
            // Hide the color picker
            document.getElementById('tutorialColorPicker').style.display = 'none';
            
            // Show a visual representation of the color choice
            showUserMessage(`<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background-color:${tutorialSelectedColor};margin-right:5px;vertical-align:middle;"></span> I like this color!`);
            
            // Advance to next stage
            tutorialStage = TUTORIAL_STAGE_CONFIRM_COLOR;
            
            // Schedule next message after a brief delay
            const nextMessageTimeout = setTimeout(() => {
                showNextMessage();
            }, 800);
            tutorialTimeouts.push(nextMessageTimeout);
        };
    });
    
    // Add click event listener to the "Got it!" button
    gotItButton.removeEventListener('click', hideBlueby);
    gotItButton.addEventListener('click', hideBlueby);
    
    // Trigger animations
    const showTimeout = setTimeout(() => {
        overlay.classList.add('show');
        mascot.classList.add('show');
        chatBubble.classList.add('show');
        
        // Start the tutorial sequence after the chat bubble appears
        const startTimeout = setTimeout(() => {
            showNextMessage();
        }, 1000);
        tutorialTimeouts.push(startTimeout);
    }, 50);
    tutorialTimeouts.push(showTimeout);
}
