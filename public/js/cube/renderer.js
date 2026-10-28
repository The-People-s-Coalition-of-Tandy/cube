function loadTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const pixel = new Uint8Array([127, 127, 127, 255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    const image = document.getElementById('displacementMap');
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    
    image.src = 'https://picsum.photos/256/256';
    
    return texture;
}

// Function to load a single skybox face texture
function loadSkyboxTexture(gl, imagePath) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Create a placeholder pixel while the image loads
    const pixel = new Uint8Array([135, 206, 235, 255]); // Sky blue placeholder
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    // Load the actual image
    const image = new Image();
    image.crossOrigin = 'anonymous'; // Handle CORS if needed
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        console.log(`✅ Loaded skybox texture: ${imagePath}`);
    };
    image.onerror = function() {
        console.warn(`❌ Failed to load skybox texture: ${imagePath}`);
    };
    
    image.src = imagePath;
    return texture;
}

// Function to initialize all skybox textures
function initSkyboxTextures() {
    // You can replace these paths with your actual skybox images
    // For now, I'll use placeholder URLs - you'll need to replace these with real skybox images
    const skyboxPaths = {
        posX: './skybox/posx.jpg',   // Right face (+X)
        negX: './skybox/negx.jpg',    // Left face (-X)
        posY: './skybox/posy.jpg',     // Top face (+Y)
        negY: './skybox/negy.jpg',  // Bottom face (-Y)
        posZ: './skybox/posz.jpg',   // Front face (+Z)
        negZ: './skybox/negz.jpg'     // Back face (-Z)
    };

    // Load each skybox face
    skyboxTextures.posX = loadSkyboxTexture(gl, skyboxPaths.posX);
    skyboxTextures.negX = loadSkyboxTexture(gl, skyboxPaths.negX);
    skyboxTextures.posY = loadSkyboxTexture(gl, skyboxPaths.posY);
    skyboxTextures.negY = loadSkyboxTexture(gl, skyboxPaths.negY);
    skyboxTextures.posZ = loadSkyboxTexture(gl, skyboxPaths.posZ);
    skyboxTextures.negZ = loadSkyboxTexture(gl, skyboxPaths.negZ);

    console.log('🌌 Skybox textures initialized');
}

// Add function to load shader files
async function loadShaderFile(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load shader: ${url} (${response.status})`);
        }
        return await response.text();
    } catch (error) {
        console.error('Error loading shader file:', error);
        throw error;
    }
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();
    const positions = new Float32Array([
        -1.0, -1.0,
        1.0, -1.0,
        -1.0, 1.0,
        1.0, 1.0,
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    return positionBuffer;
}

async function initGL() {
    const canvas = document.getElementById('glCanvas');
    gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    
    streamStartTime = Date.now();
    
    if (!gl) {
        alert('WebGL not supported');
        return;
    }

    // Log detailed GPU information for debugging
    console.log('🖥️ WebGL Context Info:');
    console.log('  Renderer:', gl.getParameter(gl.RENDERER));
    console.log('  Vendor:', gl.getParameter(gl.VENDOR));
    console.log('  Version:', gl.getParameter(gl.VERSION));
    console.log('  Shading Language Version:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
    
    // Check for high precision float support
    const fragmentPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    console.log('  Fragment Shader HIGH_FLOAT precision:', {
        precision: fragmentPrecision.precision,
        rangeMin: fragmentPrecision.rangeMin,
        rangeMax: fragmentPrecision.rangeMax
    });
    
    // Check for extensions that might affect rendering
    const extensions = gl.getSupportedExtensions();
    console.log('  Supported Extensions:', extensions.length, 'total');
    
    // Check for specific extensions that might help with precision
    const precisionExtensions = extensions.filter(ext => 
        ext.includes('precision') || ext.includes('float') || ext.includes('texture')
    );
    if (precisionExtensions.length > 0) {
        console.log('  Precision-related extensions:', precisionExtensions);
    }

    try {
        // Load shaders from external files
        const vertexShaderSource = await loadShaderFile('vert.glsl');
        let fragmentShaderSource = await loadShaderFile('frag.glsl');
        
        // Preprocess fragment shader for mobile performance mode
        if (MOBILE_PERFORMANCE_MODE) {
            fragmentShaderSource = '#define MOBILE_PERFORMANCE_MODE\n' + fragmentShaderSource;
            console.log('🚀 Mobile performance mode: Shader optimizations enabled');
        }

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        program = gl.createProgram();
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
        }

        gl.useProgram(program);

        // Cache uniform locations for performance
        cacheUniformLocations();

        // Set up position attribute
        const positionBuffer = initBuffers(gl);
        const positionLocation = gl.getAttribLocation(program, 'aVertexPosition');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Initialize displacement texture
        const texture = loadTexture(gl);
        const texLocation = gl.getUniformLocation(program, 'iChannel0');
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(texLocation, 0);

        // video texture
        const videoUniformLocation = gl.getUniformLocation(program, 'iChannel1');
        gl.uniform1i(videoUniformLocation, 1); // Tell GLSL: "use texture unit 1"

        // Initialize video texture
        videoTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Initialize skybox textures
        initSkyboxTextures();

        startTime = Date.now();
        
        // Start orb management
        manageOrbs();
        
        // Initialize camera mode indicator
        updateCameraModeIndicator();
        
        // Initialize camera rotation based on first keyframe target
        const firstKeyframe = introKeyframes[0];
        if (firstKeyframe.target) {
            calculateLookAtRotationToTarget(firstKeyframe.target);
        }
        
        // Show canvas after WebGL initialization is complete
        canvas.style.display = 'block';
        
        requestAnimationFrame(render);
    } catch (error) {
        console.error('Error during initialization:', error);
        alert('Shader error: ' + error.message);
    }
}
function resizeCanvas() {
    const canvas = gl.canvas;
    let displayWidth = window.innerWidth;
    let displayHeight = window.innerHeight;
    
    // Apply mobile resolution scaling for better performance
    if (MOBILE_PERFORMANCE_MODE) {
        displayWidth = Math.floor(displayWidth * MOBILE_RESOLUTION_SCALE);
        displayHeight = Math.floor(displayHeight * MOBILE_RESOLUTION_SCALE);
        console.log(`Mobile resolution scaling: ${window.innerWidth}x${window.innerHeight} → ${displayWidth}x${displayHeight}`);
    }

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        // Update CSS size to maintain full screen appearance on mobile
        if (MOBILE_PERFORMANCE_MODE) {
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
        }
    }
}

function updateOrbUniforms() {
    const positions = new Float32Array(MAX_ORBS * 3); // Now 100 * 3 = 300
    const colors = new Float32Array(MAX_ORBS * 3); // Now 100 * 3 = 300
    const radii = new Float32Array(MAX_ORBS); // New array for dynamic radii

    orbs.forEach((orb, index) => {
        positions[index * 3] = orb.position[0];
        positions[index * 3 + 1] = orb.position[1];
        positions[index * 3 + 2] = orb.position[2];

        colors[index * 3] = orb.color[0];
        colors[index * 3 + 1] = orb.color[1];
        colors[index * 3 + 2] = orb.color[2];
        
        // Calculate dynamic radius once in JavaScript
        const distanceToCenter = Math.sqrt(
            orb.position[0] * orb.position[0] + 
            orb.position[1] * orb.position[1] + 
            orb.position[2] * orb.position[2]
        );
        const powerScale = Math.pow(Math.max(0.0, distanceToCenter * 0.3), 3.0);
        radii[index] = Math.min(0.03 + powerScale * 0.15, MAX_ORB_SIZE); // Use configurable max size
    });

    gl.uniform3fv(uniformLocations.uOrbPositions, positions);
    gl.uniform3fv(uniformLocations.uOrbColors, colors);
    gl.uniform1fv(uniformLocations.uOrbRadii, radii);
    gl.uniform1i(uniformLocations.uOrbCount, orbs.length);
}

function updateTextUniforms() {
    const positions = new Float32Array(MAX_ORBS * 3); // Now 6 * 3 = 18

    orbs.forEach((orb, index) => {
        positions[index * 3] = orb.textPosition[0];
        positions[index * 3 + 1] = orb.textPosition[1];
        positions[index * 3 + 2] = orb.textPosition[2];
    });

    gl.uniform3fv(uniformLocations.uTextPositions, positions);
    gl.uniform1i(uniformLocations.uTextCount, orbs.length);
    
    // Note: We'll bind individual textures during rendering instead of here
}

function render() {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    try {
        resizeCanvas();
        updateCamera();
        updateIntroCamera(); // Update intro camera sequence if active

        // Skip orb processing entirely on mobile for better performance
        if (!MOBILE_PERFORMANCE_MODE) {
            // Update orb movements (desktop only)
            orbs.forEach(orb => {
                if (orb.isRealUser) {
                    orb.smoothInterpolate(); // Smooth interpolation for real users
                } else {
                    orb.updateMovement(); // AI movement for fake orbs
                }
            });
        }

        // Update stream time
        const elapsed = Date.now() - streamStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.querySelector('.stream-time').textContent = timeString;

        // Set up common uniforms
        const time = (Date.now() - startTime) / 1000;
        gl.uniform1f(uniformLocations.iTime, time);
        gl.uniform2f(uniformLocations.iResolution, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(uniformLocations.iMouse, mouseX, 0);
        gl.uniform3f(uniformLocations.uCameraPos, cameraPos[0], cameraPos[1], cameraPos[2]);
        gl.uniform2f(uniformLocations.uCameraRot, cameraRot[0], cameraRot[1]);
        gl.uniform1i(uniformLocations.uUsePolarCamera, usePolarCamera ? 1 : 0);
        gl.uniform2f(uniformLocations.uPolarRotation, polarPitch, polarRotation);
        gl.uniform1f(uniformLocations.uPolarDistance, polarDistance);

        // Update lighting uniforms
        updateLightingUniforms();

        // Skip orb and text uniforms on mobile for better performance
        if (!MOBILE_PERFORMANCE_MODE) {
            updateOrbUniforms();
            updateTextUniforms();
        } else {
            // Set empty orb data for mobile
            gl.uniform1i(uniformLocations.uOrbCount, 0);
            gl.uniform1i(uniformLocations.uTextCount, 0);
        }

        // Bind video texture
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                video
            );
        }

        // Bind skybox textures and set skybox uniforms
        gl.uniform1i(uniformLocations.uUseSkybox, useSkybox ? 1 : 0);
        gl.uniform1i(uniformLocations.uBackgroundMode, backgroundMode);
        
        if (useSkybox && skyboxTextures.posX) {
            // Bind skybox textures to texture units 3-8
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.posX);
            gl.uniform1i(uniformLocations.uSkyboxPosX, 3);
            
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.negX);
            gl.uniform1i(uniformLocations.uSkyboxNegX, 4);
            
            gl.activeTexture(gl.TEXTURE5);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.posY);
            gl.uniform1i(uniformLocations.uSkyboxPosY, 5);
            
            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.negY);
            gl.uniform1i(uniformLocations.uSkyboxNegY, 6);
            
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.posZ);
            gl.uniform1i(uniformLocations.uSkyboxPosZ, 7);
            
            gl.activeTexture(gl.TEXTURE8);
            gl.bindTexture(gl.TEXTURE_2D, skyboxTextures.negZ);
            gl.uniform1i(uniformLocations.uSkyboxNegZ, 8);
        }

        // Render scene with mobile-optimized text handling
        if (MOBILE_PERFORMANCE_MODE) {
            // Simple render without text processing for mobile
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
            // Full render with text for desktop
            renderSceneWithText();
        }
        
        // Performance monitoring
        frameCount++;
        const now = Date.now();
        if (now - lastPerformanceLog > 5000) { // Log every 5 seconds
            const fps = frameCount / ((now - lastPerformanceLog) / 1000);
            const performanceMode = MOBILE_PERFORMANCE_MODE ? 'MOBILE' : 'DESKTOP';
            console.log(`Performance [${performanceMode}]: ${fps.toFixed(1)} FPS, ${orbs.length} orbs, ${textureCreationCount} textures created, Canvas pool: ${canvasPool.length}`);
            frameCount = 0;
            lastPerformanceLog = now;
        }
        
        requestAnimationFrame(render);
    } catch (error) {
        console.error('Render error:', error);
    }
}

function renderSceneWithText() {
    // Update text uniforms with all orb positions
    updateTextUniforms();
    
    // Create or update text atlas if needed
    if (textAtlasNeedsUpdate && orbs.length > 0) {
        createTextAtlas();
    }
    
    // Bind the text atlas if available
    if (textAtlas) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, textAtlas);
        gl.uniform1i(uniformLocations.uTextTexture, 2);
    }
    
    // Render the complete scene in one pass (including text)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

window.onload = async () => {
    // Initialize WebGL first
    await initGL();
    
    // Then load configuration and apply it to the initialized WebGL context
    loadConfiguration().then(() => {
        console.log('✅ Configuration loaded after WebGL initialization, applying settings...');
        // Apply configuration now that WebGL is ready
        if (currentConfig) {
            applyConfiguration(currentConfig);
        }
        // Initialize video with the loaded configuration
        initializeVideo();
    }).catch(error => {
        console.error('Failed to load configuration, using defaults:', error);
        // Apply default config and initialize video
        currentConfig = getDefaultClientConfig();
        applyConfiguration(currentConfig);
        initializeVideo();
    });
};
window.onmousemove = (e) => {
    if (!mouseLocked) {
        mouseX = e.clientX;
    }
};

function cacheUniformLocations() {
    uniformLocations = {
        iTime: gl.getUniformLocation(program, 'iTime'),
        iResolution: gl.getUniformLocation(program, 'iResolution'),
        iMouse: gl.getUniformLocation(program, 'iMouse'),
        uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
        uCameraRot: gl.getUniformLocation(program, 'uCameraRot'),
        uUsePolarCamera: gl.getUniformLocation(program, 'uUsePolarCamera'),
        uPolarRotation: gl.getUniformLocation(program, 'uPolarRotation'),
        uPolarDistance: gl.getUniformLocation(program, 'uPolarDistance'),
        uOrbPositions: gl.getUniformLocation(program, 'uOrbPositions'),
        uOrbColors: gl.getUniformLocation(program, 'uOrbColors'),
        uOrbCount: gl.getUniformLocation(program, 'uOrbCount'),
        uOrbRadii: gl.getUniformLocation(program, 'uOrbRadii'),
        uTextPositions: gl.getUniformLocation(program, 'uTextPositions'),
        uTextCount: gl.getUniformLocation(program, 'uTextCount'),
        uTextTexture: gl.getUniformLocation(program, 'uTextTexture'),
        uPlaneSize: gl.getUniformLocation(program, 'uPlaneSize'),
        uPlanePosition: gl.getUniformLocation(program, 'uPlanePosition'),
        // Chroma key uniforms
        uChromaKeyColor: gl.getUniformLocation(program, 'uChromaKeyColor'),
        uChromaThreshold: gl.getUniformLocation(program, 'uChromaThreshold'),
        uChromaEnabled: gl.getUniformLocation(program, 'uChromaEnabled'),
        // Lighting system uniforms
        uLightPositions: gl.getUniformLocation(program, 'uLightPositions'),
        uLightColors: gl.getUniformLocation(program, 'uLightColors'),
        uLightIntensities: gl.getUniformLocation(program, 'uLightIntensities'),
        uLightEffects: gl.getUniformLocation(program, 'uLightEffects'),
        uActiveLightIndex: gl.getUniformLocation(program, 'uActiveLightIndex'),
        uLightsEnabled: gl.getUniformLocation(program, 'uLightsEnabled'),
        // Skybox uniforms
        uUseSkybox: gl.getUniformLocation(program, 'uUseSkybox'),
        uSkyboxPosX: gl.getUniformLocation(program, 'uSkyboxPosX'),
        uSkyboxNegX: gl.getUniformLocation(program, 'uSkyboxNegX'),
        uSkyboxPosY: gl.getUniformLocation(program, 'uSkyboxPosY'),
        uSkyboxNegY: gl.getUniformLocation(program, 'uSkyboxNegY'),
        uSkyboxPosZ: gl.getUniformLocation(program, 'uSkyboxPosZ'),
        uSkyboxNegZ: gl.getUniformLocation(program, 'uSkyboxNegZ'),
        // Background mode uniform
        uBackgroundMode: gl.getUniformLocation(program, 'uBackgroundMode')
    };
    console.log('✅ Cached uniform locations for performance (including chroma key)');
}

// Text atlas management
let textAtlas = null;
let textAtlasNeedsUpdate = true;
let orbTextData = []; // Store UV coordinates for each orb's text

function createTextAtlas() {
    if (orbs.length === 0) return;
    
    // Calculate atlas dimensions
    const maxTextWidth = 200;
    const textHeight = 40;
    const atlasWidth = maxTextWidth;
    const atlasHeight = textHeight * Math.max(orbs.length, 1);
    
    // Create atlas canvas
    const canvas = getCanvasFromPool();
    canvas.width = atlasWidth;
    canvas.height = atlasHeight;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set font properties
    ctx.font = '24px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Remove shadow for cleaner chroma keying - pure black/white separation
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Clear orb text data
    orbTextData = [];
    
    // Draw each orb's text and store UV coordinates
    orbs.forEach((orb, index) => {
        const y = index * textHeight + textHeight / 2;
        
        // Draw black background for the entire text area (for chroma keying)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, index * textHeight, atlasWidth, textHeight);
        
        // Draw the white text
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(orb.name, atlasWidth / 2, y);
        
        // Store UV coordinates for this orb's text
        orbTextData[index] = {
            uMin: 0.0,
            uMax: 1.0,
            vMin: index / orbs.length,
            vMax: (index + 1) / orbs.length
        };
    });
    
    // Create or update WebGL texture
    if (!textAtlas) {
        textAtlas = gl.createTexture();
    }
    
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Return canvas to pool
    returnCanvasToPool(canvas);
    
    textAtlasNeedsUpdate = false;
    console.log(`Created text atlas: ${atlasWidth}x${atlasHeight} for ${orbs.length} orbs`);
}
