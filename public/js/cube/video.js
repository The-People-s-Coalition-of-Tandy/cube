// HLS Stream Setup
let hls = null;

function initializeVideo() {
    console.log('🎬 Initializing video system...');
    
    // Check if we should bypass livestream and use MP4 directly
    if (USE_MP4_INSTEAD_OF_LIVESTREAM) {
        console.log('Bypassing livestream, loading MP4 directly...');
        loadMP4Fallback();
        return;
    }
    
    // Get the configured video URL to determine initialization strategy
    let configuredUrl = null;
    if (currentConfig && currentConfig.video && currentConfig.video.m3u8Url) {
        configuredUrl = currentConfig.video.m3u8Url;
        console.log('📋 Found configured video URL:', configuredUrl);
    }
    
    // Determine if the configured URL is HLS or MP4
    const isConfiguredHLS = configuredUrl && (configuredUrl.includes('.m3u8') || configuredUrl.includes('playlist'));
    const isConfiguredMP4 = configuredUrl && configuredUrl.includes('.mp4');
    
    console.log('📊 URL Analysis:');
    console.log('  - Configured URL:', configuredUrl);
    console.log('  - Is HLS:', isConfiguredHLS);
    console.log('  - Is MP4:', isConfiguredMP4);
    
    if (isConfiguredMP4) {
        console.log('🎥 Config contains MP4 URL, loading MP4 directly but keeping HLS ready...');
        // Load MP4 directly but ensure HLS infrastructure is available for future switches
        loadMP4Fallback();
    } else {
        console.log('📡 Initializing HLS system (either HLS URL or fallback to default)...');
        // Try to initialize livestream (either with HLS URL or fallback)
        initializeLivestream();
    }
}

function initializeLivestream(overrideUrl = null) {
    console.log('Attempting to initialize livestream...');
    
    // Get stream URL from parameter, configuration, or fallback
    let streamUrl;
    if (overrideUrl) {
        streamUrl = overrideUrl;
        console.log('Using override stream URL:', streamUrl);
    } else if (currentConfig && currentConfig.video && currentConfig.video.m3u8Url) {
        streamUrl = currentConfig.video.m3u8Url;
        console.log('Using stream URL from config:', streamUrl);
    } else {
        // Fallback to default URL if config not loaded yet
        streamUrl = "https://live.pcotandy.org/hls/stream.m3u8";
        console.log('Using fallback stream URL (config not loaded):', streamUrl);
    }
    
    // Validate URL format
    if (!streamUrl || (!streamUrl.includes('.m3u8') && !streamUrl.includes('playlist'))) {
        console.warn('Invalid or non-HLS URL detected:', streamUrl);
        console.log('Falling back to MP4 due to invalid URL format...');
        loadMP4Fallback();
        return;
    }
    
    console.log('🎬 Starting HLS stream initialization with URL:', streamUrl);
    console.log('⏱️ Timeout set to:', LIVESTREAM_TIMEOUT + 'ms');
    
    // Set up timeout for livestream
    const livestreamTimeout = setTimeout(() => {
        console.warn('⚠️ Livestream timeout reached after', LIVESTREAM_TIMEOUT + 'ms', 'falling back to MP4...');
        livestreamFailed = true;
        cleanupHLS();
        loadMP4Fallback();
    }, LIVESTREAM_TIMEOUT);
    
    // Store timeout reference for cleanup
    window.livestreamTimeout = livestreamTimeout;
    
    if (Hls.isSupported()) {
        console.log('✅ HLS.js is supported, using HLS.js');
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 2,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 3,
            maxFragLookUpTolerance: 0.25,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            liveDurationInfinity: false,
            liveBackBufferLength: 0,
            maxLiveSyncPlaybackRate: 1.5,
            liveSyncDuration: undefined,
            liveMaxLatencyDuration: undefined,
            maxStarvationDelay: 4,
            maxLoadingDelay: 4,
            minAutoBitrate: 0,
            emeEnabled: false,
            widevineLicenseUrl: undefined,
            drmSystems: {},
            requestMediaKeySystemAccessFunc: undefined
        });
        
        console.log('📡 Loading HLS source:', streamUrl);
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            console.log('✅ HLS manifest parsed successfully');
            clearTimeout(livestreamTimeout);
            updateStreamIndicator(true);
            
            // Reapply shader uniforms to ensure chroma key settings persist
            if (gl && program && currentConfig) {
                console.log('🎨 Reapplying shader uniforms after HLS manifest parsed...');
                updateShaderUniforms(currentConfig);
            }
            
            // If video was already started and playing, ensure it continues
            if (videoStarted && !video.paused) {
                console.log('▶️ Ensuring HLS stream continues playing...');
                video.play().catch(error => {
                    console.warn('Failed to continue HLS playback:', error);
                });
            }
        });
        
        hls.on(Hls.Events.ERROR, function (event, data) {
            console.warn('❌ HLS error:', data.type, data.details, data);
            if (data.fatal) {
                clearTimeout(livestreamTimeout);
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log('💥 Fatal network error encountered, falling back to MP4...');
                        console.log('Network error details:', data.details, data.response);
                        livestreamFailed = true;
                        cleanupHLS();
                        loadMP4Fallback();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('🔧 Fatal media error encountered, trying to recover...');
                        hls.recoverMediaError();
                        break;
                    default:
                        console.log('💥 Fatal error, falling back to MP4...');
                        console.log('Error details:', data);
                        livestreamFailed = true;
                        cleanupHLS();
                        loadMP4Fallback();
                        break;
                }
            }
        });
        
        hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
            console.log('🔄 Quality level switched to:', data.level);
        });
        
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('🍎 Native HLS support detected (Safari)');
        console.log('📡 Loading native HLS source:', streamUrl);
        video.src = streamUrl;
        
        video.addEventListener('loadedmetadata', function () {
            console.log('✅ Native HLS stream loaded');
            clearTimeout(livestreamTimeout);
            updateStreamIndicator(true);
            
            // Reapply shader uniforms to ensure chroma key settings persist
            if (gl && program && currentConfig) {
                console.log('🎨 Reapplying shader uniforms after native HLS load...');
                updateShaderUniforms(currentConfig);
            }
            
            // If video was already started and playing, ensure it continues
            if (videoStarted && !video.paused) {
                console.log('▶️ Ensuring native HLS stream continues playing...');
                video.play().catch(error => {
                    console.warn('Failed to continue native HLS playback:', error);
                });
            }
        });
        
        video.addEventListener('error', function(e) {
            console.error('Native HLS error:', e);
            clearTimeout(livestreamTimeout);
            livestreamFailed = true;
            loadMP4Fallback();
        });
        
    } else {
        console.error('This browser does not support HLS streaming, falling back to MP4...');
        clearTimeout(livestreamTimeout);
        livestreamFailed = true;
        loadMP4Fallback();
    }
}

function loadMP4Fallback(overrideUrl = null) {
    console.log('🎥 Loading MP4 video...');
    
    // Determine the MP4 URL to use
    let mp4Url;
    let isConfiguredMP4 = false;
    
    if (overrideUrl) {
        mp4Url = overrideUrl;
        isConfiguredMP4 = overrideUrl.includes('.mp4');
        console.log('📋 Loading override MP4 URL:', mp4Url);
    } else {
        // Determine if this is a configured MP4 or a fallback
        const configuredUrl = currentConfig && currentConfig.video && currentConfig.video.m3u8Url;
        isConfiguredMP4 = configuredUrl && configuredUrl.includes('.mp4');
        
        if (isConfiguredMP4) {
            mp4Url = configuredUrl;
            console.log('📋 Loading configured MP4 URL:', mp4Url);
        } else {
            mp4Url = MP4_FALLBACK_URL;
            console.log('🔄 Loading MP4 fallback due to HLS failure:', mp4Url);
        }
    }
    
    // Set fallback state based on whether this is configured content or actual fallback
    if (isConfiguredMP4) {
        isUsingFallback = false; // This is not a fallback, it's the intended source
    } else {
        isUsingFallback = true; // This is a fallback
    }
    
    // Store current playing state before switching
    const wasPlaying = !video.paused;
    
    // Clean up any existing HLS
    cleanupHLS();
    
    // Set video source
    video.src = mp4Url;
    video.loop = true; // Loop the MP4 for continuous playback
    
    console.log('🎬 Loading MP4 from:', mp4Url);
    
    video.addEventListener('loadedmetadata', function() {
        console.log('✅ MP4 loaded successfully');
        updateStreamIndicator(!isUsingFallback); // Show as live if it's configured content
        
        // Reapply shader uniforms to ensure chroma key settings persist
        if (gl && program && currentConfig) {
            console.log('🎨 Reapplying shader uniforms after MP4 load...');
            updateShaderUniforms(currentConfig);
        }
        
        // If video was playing before switch, resume playback
        if (wasPlaying && videoStarted) {
            console.log('▶️ Resuming playback with MP4...');
            video.play().catch(error => {
                console.warn('Failed to resume MP4 playback:', error);
            });
        }
    });
    
    video.addEventListener('error', function(e) {
        console.error('❌ MP4 failed to load:', e);
        // Show error message to user
        updateStreamIndicator(false, true);
    });
}

function updateStreamIndicator(isLive, hasError = false) {
    // Target the stream info live indicator specifically, not the event display one
    const streamInfo = document.getElementById('streamInfo');
    const liveIndicator = streamInfo ? streamInfo.querySelector('.live-indicator') : null;
    const liveDot = streamInfo ? streamInfo.querySelector('.live-dot') : null;
    const nowPlaying = document.getElementById('nowPlayingText');
    
    if (!liveIndicator) return; // Exit if we can't find the stream info indicator
    
    if (hasError) {
        liveIndicator.innerHTML = '<div class="live-dot" style="background: #ff6600;"></div><span>ERROR</span>';
        if (nowPlaying) nowPlaying.textContent = 'Video content unavailable';
        return;
    }
    
    if (isLive && !isUsingFallback) {
        // Livestream is active - but don't override our event display
        liveIndicator.innerHTML = '<div class="live-dot"></div><span>STREAM</span>';
        // Don't override the now playing text - let our event system handle it
    } else {
        // Using MP4 fallback
        liveIndicator.innerHTML = '<div class="live-dot"></div><span>STREAM</span>';
        // Don't override the now playing text - let our event system handle it
    }
}

// Initialize video system when the page loads
// initializeVideo(); // REMOVED - this was causing the error because currentConfig is null

// Cleanup function for HLS
function cleanupHLS() {
    if (hls) {
        console.log('Cleaning up HLS resources...');
        hls.destroy();
        hls = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupHLS);
window.addEventListener('unload', cleanupHLS);

function fadeInAudio(audioNodes, duration = 800) {
    const { gainNode } = audioNodes;
    console.log('Starting audio fade in...');
    
    // Cancel any existing fade
    if (audioFadeInterval) clearInterval(audioFadeInterval);
    
    const startTime = Date.now();
    const initialVolume = gainNode.gain.value;
    const targetVolume = 1.0;
    console.log('Fade from', initialVolume, 'to', targetVolume);
    
    audioFadeInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-in function for smoother fade
        const easedProgress = progress * progress;
        
        // Set new volume
        gainNode.gain.value = initialVolume + (targetVolume - initialVolume) * easedProgress;
        
        // Log progress occasionally
        if (Math.floor(progress * 10) !== Math.floor((progress - 0.1) * 10)) {
            console.log('Audio fade progress:', Math.floor(progress * 100) + '%', 'Volume:', gainNode.gain.value.toFixed(2));
        }
        
        // If we're done, clear the interval
        if (progress >= 1) {
            clearInterval(audioFadeInterval);
            audioFadeInterval = null;
            console.log('Audio fade complete. Final volume:', gainNode.gain.value);
        }
    }, 16); // Update roughly 60 times per second
}

function startVideo() {
    if (!videoStarted) {
        console.log('Starting video...');
        // Keep video muted until audio context is set up
        video.muted = true;
        console.log('Video kept muted until audio context is ready');
        
        // Set up audio context BEFORE starting video
        const audioNodes = setupAudioContext();
        
        // Resume audio context if suspended (browser policy)
        if (audioContext && audioContext.state === 'suspended') {
            console.log('Resuming suspended audio context...');
            audioContext.resume();
        }
        
        // Function to actually start video playback
        const playVideo = () => {
            video.play().then(() => {
                console.log('Video started playing (muted)');
                videoStarted = true;
                playOverlay.classList.add('hidden');
                // Show canvas when playOverlay is hidden
                document.getElementById('glCanvas').style.display = 'block';
                
                // Unmute video and start audio fade after delay
                setTimeout(() => {
                    console.log('Unmuting video and starting audio fade...');
                    video.muted = false;
                    fadeInAudio(audioNodes);
                }, 100); // Reduced from 1200ms to 400ms for faster audio start
                
            }).catch(error => {
                console.warn('Video playback failed:', error);
                
                // If this is a livestream failure and we haven't tried fallback yet
                if (!isUsingFallback && !livestreamFailed) {
                    console.log('Livestream playback failed, trying MP4 fallback...');
                    livestreamFailed = true;
                    loadMP4Fallback();
                    // Retry playback after a short delay
                    setTimeout(() => {
                        console.log('Retrying video playback with fallback...');
                        playVideo();
                    }, 1000);
                } else {
                    // Retry after a short delay
                    setTimeout(() => {
                        console.log('Retrying video playback...');
                        playVideo();
                    }, 1000);
                }
            });
        };
        
        // Check video readiness based on source type
        if (isUsingFallback) {
            // MP4 fallback
            console.log('Starting MP4 fallback playback...');
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
                playVideo();
            } else {
                console.log('Waiting for MP4 to be ready...');
                video.addEventListener('canplay', playVideo, { once: true });
            }
        } else if (hls && hls.media) {
            // HLS.js is being used
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA
                playVideo();
            } else {
                console.log('Waiting for HLS stream to be ready...');
                video.addEventListener('canplay', playVideo, { once: true });
            }
        } else if (video.src && !isUsingFallback) {
            // Native HLS support (Safari)
            if (video.readyState >= 2) {
                playVideo();
            } else {
                console.log('Waiting for native HLS stream to be ready...');
                video.addEventListener('canplay', playVideo, { once: true });
            }
        } else {
            // Fallback - try to play immediately
            console.log('No specific video type detected, attempting direct playback...');
            playVideo();
        }
    }
}
