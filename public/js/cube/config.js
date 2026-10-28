// Configuration Management
let currentConfig = null;
let currentVideoUrl = null;

// Load configuration from server
async function loadConfiguration() {
    try {
        console.log('Loading configuration from server...');
        const response = await fetch('/api/config');
        const config = await response.json();
        
        console.log('Configuration loaded:', config);
        currentConfig = config;
        
        // Apply configuration immediately
        applyConfiguration(config);
        
        return config;
    } catch (error) {
        console.error('Failed to load configuration, using defaults:', error);
        // Fall back to hardcoded defaults
        currentConfig = getDefaultClientConfig();
        applyConfiguration(currentConfig);
        return currentConfig;
    }
}

function getDefaultClientConfig() {
    return {
        video: {
            m3u8Url: "https://live.pcotandy.org/hls/stream.m3u8",
            chromaKey: {
                enabled: true,
                color: [0.0, 1.0, 0.0], // Green
                threshold: 0.3,
                featherEdge: 0.1
            }
        }
    };
}

function applyConfiguration(config) {
    console.log('🔧 Applying configuration:', config);
    console.log('📋 Current config before merge:', currentConfig);
    
    // If we have a current config and this is a partial update, merge them
    if (currentConfig && config) {
        // Deep merge the configurations
        const mergedConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep clone current config
        console.log('🔄 Starting merge with cloned config:', mergedConfig);
        
        // Merge video settings if present
        if (config.video) {
            if (!mergedConfig.video) mergedConfig.video = {};
            
            // Handle nested chroma key settings properly
            if (config.video.chromaKey) {
                if (!mergedConfig.video.chromaKey) mergedConfig.video.chromaKey = {};
                console.log('🎨 Merging chroma key - before:', mergedConfig.video.chromaKey);
                Object.assign(mergedConfig.video.chromaKey, config.video.chromaKey);
                console.log('🎨 Merging chroma key - after:', mergedConfig.video.chromaKey);
            }
            
            // Merge other video settings
            Object.keys(config.video).forEach(key => {
                if (key !== 'chromaKey') {
                    mergedConfig.video[key] = config.video[key];
                }
            });
        }
        
        // Merge videoPlane settings if present
        if (config.videoPlane) {
            mergedConfig.videoPlane = config.videoPlane;
        }
        
        // Merge brightness if present
        if (config.brightness !== undefined) {
            mergedConfig.brightness = config.brightness;
        }
        
        // Merge scene settings (including lighting) if present
        if (config.scene) {
            if (!mergedConfig.scene) mergedConfig.scene = {};
            Object.assign(mergedConfig.scene, config.scene);
        }
        
        // Apply lighting settings
        if (config.scene && config.scene.lighting) {
            const lighting = config.scene.lighting;
            if (lighting.lights) {
                lightingSystem.lights = lighting.lights;
            }
            if (lighting.activeLightIndex !== undefined) {
                lightingSystem.activeLightIndex = lighting.activeLightIndex;
            }
            updateLightingUniforms();
            console.log('✅ Applied lighting configuration:', lighting);
        }
        
        // Apply background mode settings
        if (config.scene && config.scene.backgroundMode !== undefined) {
            const mode = config.scene.backgroundMode;
            if (mode === 'black') {
                backgroundMode = 0;
                useSkybox = false;
            } else if (mode === 'tunnel') {
                backgroundMode = 1;
                useSkybox = false;
            } else if (mode === 'skybox') {
                backgroundMode = 2;
                useSkybox = true;
            }
            console.log('✅ Applied background mode configuration:', mode, '(backgroundMode =', backgroundMode + ')');
        }
        
        console.log('✅ Final merged configuration:', mergedConfig);
        config = mergedConfig;
        currentConfig = mergedConfig; // Update current config
    } else if (config) {
        // This is a full config update
        console.log('📝 Full config update (no merge needed)');
        currentConfig = config;
    } else {
        console.warn('⚠️ No config provided to applyConfiguration');
        return;
    }
    
    // Update video source if changed (only if video config is present)
    if (config.video && config.video.m3u8Url !== currentVideoUrl) {
        console.log('Video URL changed, updating source...');
        updateVideoSource(config.video.m3u8Url);
    }
    
    // Update shader uniforms if WebGL is initialized
    if (gl && program) {
        updateShaderUniforms(config);
    }
}

function updateShaderUniforms(config) {
    try {
        console.log('🎨 Updating shader uniforms with config:', config);
        
        // Ensure we have a valid config
        if (!config) {
            console.warn('⚠️ Invalid config provided to updateShaderUniforms');
            return;
        }
        
        // Apply chroma key settings - with better fallback logic
        let chromaKey;
        if (config.video?.chromaKey) {
            chromaKey = config.video.chromaKey;
            console.log('✅ Using chroma key from config:', chromaKey);
        } else {
            // Only use fallback if we truly have no chroma key config
            chromaKey = {
                enabled: false,
                color: [0.0, 1.0, 0.0],
                threshold: 0.3
            };
            console.log('⚠️ Using fallback chroma key (no config found):', chromaKey);
        }

        // Hardware-specific threshold adjustment for better compatibility
        let adjustedThreshold = chromaKey.threshold;
        
        // Detect GPU and adjust threshold for older hardware
        const renderer = gl.getParameter(gl.RENDERER);
        const vendor = gl.getParameter(gl.VENDOR);
        console.log('🖥️ GPU Info:', { renderer, vendor });
        
        // Check for older Intel integrated graphics or pre-M1 hardware
        const isOlderHardware = renderer.includes('Intel') || 
                               renderer.includes('HD Graphics') ||
                               renderer.includes('Iris') ||
                               vendor.includes('Intel');
        
        if (isOlderHardware) {
            // Increase threshold for older hardware to compensate for precision issues
            adjustedThreshold = chromaKey.threshold * 1.2;
            console.log('🔧 Older hardware detected, adjusting chroma threshold:', chromaKey.threshold, '→', adjustedThreshold);
        }
        
        console.log('🔍 Final chroma key settings:', {
            enabled: chromaKey.enabled,
            color: chromaKey.color,
            originalThreshold: chromaKey.threshold,
            adjustedThreshold: adjustedThreshold
        });
        
        // Ensure uniform locations are cached
        if (!uniformLocations.uChromaKeyColor) {
            console.log('🔧 Chroma key uniforms not cached, caching now...');
            uniformLocations.uChromaKeyColor = gl.getUniformLocation(program, 'uChromaKeyColor');
            uniformLocations.uChromaThreshold = gl.getUniformLocation(program, 'uChromaThreshold');
            uniformLocations.uChromaEnabled = gl.getUniformLocation(program, 'uChromaEnabled');
        }
        
        // Apply chroma key uniforms
        if (uniformLocations.uChromaKeyColor) {
            gl.uniform3f(uniformLocations.uChromaKeyColor, ...chromaKey.color);
            console.log('✅ Applied chroma key color:', chromaKey.color);
        }
        
        if (uniformLocations.uChromaThreshold) {
            gl.uniform1f(uniformLocations.uChromaThreshold, adjustedThreshold);
            console.log('✅ Applied chroma key threshold:', adjustedThreshold);
        }
        
        if (uniformLocations.uChromaEnabled) {
            gl.uniform1i(uniformLocations.uChromaEnabled, chromaKey.enabled ? 1 : 0);
            console.log('✅ Applied chroma key enabled:', chromaKey.enabled);
        }

        const videoPlane = config.videoPlane || config.video?.videoPlane || {
            size: 0.5,
            position: [0.0, 1.12, 0.0]
        };

        console.log('🎥 Video plane config found:', videoPlane);
        console.log('📏 Plane size:', videoPlane.size);
        console.log('📍 Plane position:', videoPlane.position);

        if (uniformLocations.uPlaneSize) {
            const sizeX = videoPlane.size * (16.0/9.0);
            const sizeY = videoPlane.size;
            gl.uniform2f(uniformLocations.uPlaneSize, sizeX, sizeY);
            gl.uniform3f(uniformLocations.uPlanePosition, videoPlane.position[0], videoPlane.position[1], videoPlane.position[2]);
            console.log('✅ Applied video plane size:', sizeX, 'x', sizeY);
            console.log('✅ Applied video plane position:', videoPlane.position);
        } else {
            console.warn('⚠️ uPlaneSize uniform location not found');
        }
        
        
        // Apply brightness settings - check both locations for compatibility
        const brightness = config.brightness || config.video?.brightness;
        if (brightness !== undefined) {
            const brightnessLocation = gl.getUniformLocation(program, 'uBrightness');
            if (brightnessLocation) {
                gl.uniform1f(brightnessLocation, brightness);
                console.log('✅ Applied brightness:', brightness);
            }
        }
        
        // Apply lighting settings
        if (config.scene && config.scene.lighting) {
            const lighting = config.scene.lighting;
            if (lighting.lights) {
                lightingSystem.lights = lighting.lights;
            }
            if (lighting.activeLightIndex !== undefined) {
                lightingSystem.activeLightIndex = lighting.activeLightIndex;
            }
            updateLightingUniforms();
            console.log('✅ Applied lighting configuration:', lighting);
        }
        
        // Apply background mode settings
        if (config.scene && config.scene.backgroundMode !== undefined) {
            const mode = config.scene.backgroundMode;
            if (mode === 'black') {
                backgroundMode = 0;
                useSkybox = false;
            } else if (mode === 'tunnel') {
                backgroundMode = 1;
                useSkybox = false;
            } else if (mode === 'skybox') {
                backgroundMode = 2;
                useSkybox = true;
            }
            console.log('✅ Applied background mode configuration:', mode, '(backgroundMode =', backgroundMode + ')');
        }
        
        console.log('🎨 Shader uniforms updated successfully');
    } catch (error) {
        console.error('❌ Failed to update shader uniforms:', error);
    }
}

function updateVideoSource(newUrl) {
    if (newUrl === currentVideoUrl) {
        console.log('🔄 Video source unchanged, skipping update:', newUrl);
        return;
    }
    
    console.log('🎬 Switching video source from', currentVideoUrl, 'to', newUrl);
    
    // Determine if this is an HLS stream or MP4
    const isHLS = newUrl && (newUrl.includes('.m3u8') || newUrl.includes('playlist'));
    const isMP4 = newUrl && newUrl.includes('.mp4');
    
    console.log('📋 URL Analysis:');
    console.log('  - Is HLS stream:', isHLS);
    console.log('  - Is MP4 file:', isMP4);
    console.log('  - URL:', newUrl);
    console.log('  - Previous was fallback:', isUsingFallback);
    
    currentVideoUrl = newUrl;
    
    // Update the global streamUrl variable
    streamUrl = newUrl;
    
    // Store current playing state
    const wasPlaying = !video.paused;
    const currentTime = video.currentTime;
    
    console.log('📊 Current video state:');
    console.log('  - Was playing:', wasPlaying);
    console.log('  - Current time:', currentTime);
    console.log('  - Video started:', videoStarted);
    
    // Reinitialize video with new URL
    if (videoStarted) {
        console.log('🔄 Reinitializing video with new URL...');
        
        // Clean up existing video first
        cleanupHLS();
        
        // Reset video state flags - important for MP4 to HLS transitions
        livestreamFailed = false;
        isUsingFallback = false;
        
        // Clear any existing timeouts
        if (window.livestreamTimeout) {
            clearTimeout(window.livestreamTimeout);
            window.livestreamTimeout = null;
            console.log('🕐 Cleared existing livestream timeout');
        }
        
        // Initialize new video source based on type
        if (isMP4) {
            console.log('🎥 Loading MP4 file directly...');
            loadMP4Fallback(newUrl); // Pass the new URL directly
        } else if (isHLS) {
            console.log('📡 Initializing HLS stream...');
            // Ensure we're not in fallback mode when switching to HLS
            isUsingFallback = false;
            initializeLivestream(newUrl); // Pass the new URL directly
        } else {
            console.warn('⚠️ Unknown video format, attempting HLS initialization...');
            isUsingFallback = false;
            initializeLivestream(newUrl); // Pass the new URL directly
        }
        
        // If video was playing, ensure it continues playing after source change
        if (wasPlaying) {
            console.log('▶️ Video was playing, ensuring autoplay continues...');
            
            // Add event listener to resume playback once new source is loaded
            const resumePlayback = () => {
                console.log('✅ New video source loaded, resuming playback...');
                video.play().catch(error => {
                    console.warn('Failed to resume playback after source change:', error);
                });
                video.removeEventListener('loadedmetadata', resumePlayback);
                video.removeEventListener('canplay', resumePlayback);
            };
            
            video.addEventListener('loadedmetadata', resumePlayback);
            video.addEventListener('canplay', resumePlayback);
        }
    } else {
        console.log('📺 Video not yet started, URL will be used on next initialization');
    }
}

// Video Configuration - Edit these to control video source behavior
const USE_MP4_INSTEAD_OF_LIVESTREAM = false; // Set to true to bypass livestream and use MP4
const MP4_FALLBACK_URL = './assets/tandyspin.mp4'; // Path to your MP4 fallback file
const LIVESTREAM_TIMEOUT = 30000; // 30 seconds timeout for livestream before falling back to MP4 (increased from 10s)

// Log current configuration
console.log('=== VIDEO CONFIGURATION ===');
console.log('Use MP4 instead of livestream:', USE_MP4_INSTEAD_OF_LIVESTREAM);
console.log('MP4 fallback URL:', MP4_FALLBACK_URL);
console.log('Livestream timeout:', LIVESTREAM_TIMEOUT + 'ms');
console.log('===========================');

let gl;
let program;
let mouseX = 0;
let startTime;
let videoTexture;
let streamStartTime;
let videoStarted = false;
let audioFadeInterval;
let audioContext;
let audioNodes; // Store audio nodes globally to prevent recreating them
let isUsingFallback = false; // Track if we're using MP4 fallback
let livestreamFailed = false; // Track if livestream failed

// Performance monitoring
let textureCreationCount = 0;
let lastPerformanceLog = Date.now();
let frameCount = 0;

// Skybox textures and control
let skyboxTextures = {
    posX: null, negX: null,
    posY: null, negY: null,
    posZ: null, negZ: null
};
let useSkybox = false; // Toggle between skybox and procedural sky
let backgroundMode = 0; // 0=black, 1=tunnel, 2=skybox

// Cached uniform locations for performance
let uniformLocations = {};

// Canvas pool to avoid creation overhead
const canvasPool = [];
function getCanvasFromPool() {
    return canvasPool.pop() || document.createElement('canvas');
}
function returnCanvasToPool(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvasPool.length < 10) { // Limit pool size
        canvasPool.push(canvas);
    }
}
