const video = document.getElementById('videoTexture');

// Set up audio context immediately to prevent race conditions
// This ensures Web Audio API takes control before any audio can play

function initializeAudioContext() {
    if (audioContext && audioNodes) {
        console.log('Audio context already initialized');
        return audioNodes;
    }
    
    console.log('Initializing audio context immediately...');
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('Audio context state:', audioContext.state);
    
    // Create media element source from video - this takes control of video audio
    const source = audioContext.createMediaElementSource(video);
    console.log('Created media element source - Web Audio API now controls video audio');
    
    // Create gain node for volume control
    const gainNode = audioContext.createGain();
    
    // Start with volume at 0 to prevent any audio leakage
    gainNode.gain.value = 0;
    console.log('Initial gain value set to 0');
    
    // Create analyzer node for visualizations
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    // Connect nodes: source -> gain -> analyser -> destination
    source.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    console.log('Audio nodes connected');
    
    // Store nodes globally
    audioNodes = { gainNode, analyser, source };
    return audioNodes;
}

// Initialize audio context immediately to take control of video audio
initializeAudioContext();

function setupAudioContext() {
    // Audio context is already initialized, just return the nodes
    if (audioContext && audioNodes) {
        console.log('Audio context already exists, reusing...');
        return audioNodes;
    }
    
    // Fallback - this shouldn't happen since we initialize immediately
    console.log('Audio context not found, initializing...');
    return initializeAudioContext();
}

// Lighting Board System
let lightingSystem = {
    lights: [
        { position: [3.0, 3.5, 3.0], color: [1.0, 1.0, 1.0], intensity: 3.0, effect: 1, enabled: true },
        { position: [-3.0, 3.5, 3.0], color: [1.0, 0.0, 0.0], intensity: 2.5, effect: 0, enabled: false },
        { position: [0.0, 5.0, -3.0], color: [0.0, 1.0, 0.0], intensity: 2.0, effect: 0, enabled: false },
        { position: [3.0, 2.0, -3.0], color: [0.0, 0.0, 1.0], intensity: 2.5, effect: 0, enabled: false }
    ],
    activeLightIndex: 0,
    boardVisible: false
};


function updateLightingUniforms() {
    if (!gl || !program || !uniformLocations) return;
    
    // Prepare arrays for uniforms
    const positions = new Float32Array(12); // 4 lights * 3 components
    const colors = new Float32Array(12);    // 4 lights * 3 components
    const intensities = new Float32Array(4);
    const effects = new Int32Array(4);
    const enabled = new Int32Array(4);
    
    lightingSystem.lights.forEach((light, index) => {
        positions[index * 3] = light.position[0];
        positions[index * 3 + 1] = light.position[1];
        positions[index * 3 + 2] = light.position[2];
        
        colors[index * 3] = light.color[0];
        colors[index * 3 + 1] = light.color[1];
        colors[index * 3 + 2] = light.color[2];
        
        intensities[index] = light.intensity;
        effects[index] = light.effect;
        enabled[index] = light.enabled ? 1 : 0;
    });
    
    // Update uniforms
    gl.uniform3fv(uniformLocations.uLightPositions, positions);
    gl.uniform3fv(uniformLocations.uLightColors, colors);
    gl.uniform1fv(uniformLocations.uLightIntensities, intensities);
    gl.uniform1iv(uniformLocations.uLightEffects, effects);
    gl.uniform1i(uniformLocations.uActiveLightIndex, lightingSystem.activeLightIndex);
    
    // Convert boolean array to int array for WebGL
    const enabledArray = lightingSystem.lights.map(light => light.enabled ? 1 : 0);
    gl.uniform1iv(uniformLocations.uLightsEnabled, new Int32Array(enabledArray));
}

// Handle lighting updates from admin panel via WebSocket
function applyLightingUpdate(lightingData) {
    if (lightingData.lights) {
        lightingSystem.lights = lightingData.lights;
    }
    if (lightingData.activeLightIndex !== undefined) {
        lightingSystem.activeLightIndex = lightingData.activeLightIndex;
    }
    
    // Update shader uniforms
    updateLightingUniforms();
    
    console.log('Lighting updated from admin panel:', lightingData);
}

// Handle background updates from admin panel via WebSocket
function applyBackgroundUpdate(backgroundData) {
    if (backgroundData.mode !== undefined) {
        // Update the background mode
        if (backgroundData.mode === 'black') {
            backgroundMode = 0;
            useSkybox = false;
            console.log('⚫ Background mode set to: BLACK');
        } else if (backgroundData.mode === 'tunnel') {
            backgroundMode = 1;
            useSkybox = false;
            console.log('🌀 Background mode set to: TUNNEL');
        } else if (backgroundData.mode === 'skybox') {
            backgroundMode = 2;
            useSkybox = true;
            console.log('🌌 Background mode set to: SKYBOX');
        }
    }
    
    console.log('Background updated from admin panel:', backgroundData);
}

// Chat notification sound function
function playNotificationSound() {
    try {
        // Create and play the notification sound from audio file
        const audio = new Audio('./assets/notif.wav');
        audio.volume = 0.7; // Set volume to 70% to be more audible
        audio.play().catch(error => {
            console.log('Could not play notification sound:', error);
        });
    } catch (error) {
        console.log('Could not play notification sound:', error);
    }
}
