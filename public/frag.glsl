precision highp float;
// Hardware compatibility: Ensure consistent precision across different GPUs
#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
#else
    precision mediump float;
#endif

// Additional precision handling for older hardware
#define PRECISION_EPSILON 0.001

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform vec3 uOrbPositions[100];  // Increased from 6 to 100 for stress testing
uniform vec3 uOrbColors[100];     // Increased from 6 to 100 to match uOrbPositions
uniform int uOrbCount;           // Current number of active orbs
uniform float uOrbRadii[100];     // Increased from 6 to 100 to match other orb arrays
uniform sampler2D uTextTexture;  // Single text texture (we'll use texture atlas later)
uniform vec3 uTextPositions[100]; // Increased from 6 to 100 to match orb limit
uniform int uTextCount;          // Number of active text billboards
uniform vec3 uCameraPos;         // Camera position
uniform vec2 uCameraRot;         // Camera rotation (pitch, yaw)
uniform bool uUsePolarCamera;    // Whether to use polar camera mode
uniform vec2 uPolarRotation;     // Polar camera rotation (pitch, yaw)
uniform float uPolarDistance;    // Polar camera distance (for zoom)

// Configurable chroma key uniforms
uniform vec3 uChromaKeyColor;    // RGB color to key out
uniform float uChromaThreshold;  // Sensitivity threshold
uniform bool uChromaEnabled;     // Enable/disable chroma keying
uniform vec2 uPlaneSize;
uniform vec3 uPlanePosition;

// Lighting system uniforms
uniform vec3 uLightPositions[4];   // Positions of 4 lights
uniform vec3 uLightColors[4];      // Colors of 4 lights
uniform float uLightIntensities[4]; // Intensities of 4 lights
uniform int uLightEffects[4];      // Effect types: 0=static, 1=spin, 2=strobe, 3=rainbow
uniform int uActiveLightIndex;     // Currently active light (0-3)
uniform bool uLightsEnabled[4];    // Which lights are enabled

// Skybox uniforms - add these to your JavaScript uniform setup
uniform sampler2D uSkyboxPosX;   // Right face (+X)
uniform sampler2D uSkyboxNegX;   // Left face (-X)
uniform sampler2D uSkyboxPosY;   // Top face (+Y)
uniform sampler2D uSkyboxNegY;   // Bottom face (-Y)
uniform sampler2D uSkyboxPosZ;   // Front face (+Z)
uniform sampler2D uSkyboxNegZ;   // Back face (-Z)
uniform bool uUseSkybox;         // Toggle between skybox and procedural sky
uniform int uBackgroundMode;     // 0=black, 1=tunnel, 2=skybox

varying vec2 vTextureCoord;

#define EPSILON .0001

// Mobile performance optimizations - reduce quality on mobile devices
// These values will be dynamically set based on device capabilities
#ifdef MOBILE_PERFORMANCE_MODE
    #define MAX_VIEW_STEPS 100      // Reduced from 200 for mobile
    #define MAX_SHADOW_STEPS 16     // Reduced from 32 for mobile
    #define OCCLUSION_SAMPLES 2.0   // Reduced from 4.0 for mobile
    #define MAX_ORBS 0              // No orbs on mobile
#else
    #define MAX_VIEW_STEPS 200      // Full quality for desktop
    #define MAX_SHADOW_STEPS 32     // Full quality for desktop
    #define OCCLUSION_SAMPLES 4.0   // Full quality for desktop
    #define MAX_ORBS 4            // Full orbs for desktop
#endif

#define OCCLUSION_FACTOR .5
#define MAX_DEPTH 50.0
#define BUMP_FACTOR .03
#define TEX_SCALE_FACTOR .4
#define ORB_RADIUS 0.1
#define TEXT_BILLBOARD_SIZE vec2(0.15, 0.05)

#define BOX_POS vec3(0.0, 0.0, 0.0)
#define BOX_DIM vec3(1.0, 1.0, 1.0)
#define LIGHT_COLOR vec4(1.0)
#define PEN_FACTOR 50.0
#define MAT_COLOR vec4(1.0)
#define MAT_GLOSS 1.0



// Configurable chroma key function - returns true if color should be keyed out (transparent)
bool isChromaKey(vec3 color) {
    if (!uChromaEnabled) return false;
    
    // Use distance-based color matching with hardware-agnostic tolerance
    float distance = length(color - uChromaKeyColor);
    
    // Add a softer falloff for better hardware compatibility
    // Instead of hard threshold, use a range for semi-transparency
    float hardThreshold = uChromaThreshold * 0.7; // Fully transparent
    float softThreshold = uChromaThreshold * 1.3; // Fully opaque
    
    // For pure black chroma key, use component-wise checking with better precision handling
    if (length(uChromaKeyColor) < 0.1) { // If chroma key color is close to black
        float maxComponent = max(max(color.r, color.g), color.b);
        return maxComponent < uChromaThreshold; // Use direct threshold, no soft falloff
    }
    
    return distance < hardThreshold;
}

// Enhanced chroma key function that returns alpha value for blending
float getChromaAlpha(vec3 color) {
    if (!uChromaEnabled) return 1.0;
    
    float distance = length(color - uChromaKeyColor);
    float hardThreshold = uChromaThreshold * 0.7;
    float softThreshold = uChromaThreshold * 1.3;
    
    // Standard distance-based keying with smooth falloff for all colors
    if (distance < hardThreshold) return 0.0;
    if (distance > softThreshold) return 1.0;
    return smoothstep(hardThreshold, softThreshold, distance);
}

// Legacy black chroma key function for text (still using black for text backgrounds)
bool isBlackChromaKey(vec3 color) {
    // For text backgrounds, we still use black keying
    float threshold = 0.5;

    float distance = length(color - vec3(0.0, 0.0, 0.0));
    return distance < threshold;
}

// Safe texture sampling function that prevents edge stretching
vec4 safeTextureSample(sampler2D tex, vec2 uv) {
    // Check if UV is outside the valid 0-1 range
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 0.0); // Return transparent black for out-of-bounds samples
    }
    return texture2D(tex, uv);
}

// Simple noise function for cloud generation
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fractal Brownian Motion for cloud generation
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    
    return value;
}

// Cubemap skybox sampling function
vec3 sampleCubemap(vec3 rayDir) {
    vec3 absDir = abs(rayDir);
    vec2 uv;
    vec4 color;
    
    // Determine which face to sample based on the largest component
    if (absDir.x >= absDir.y && absDir.x >= absDir.z) {
        // X face (left or right)
        if (rayDir.x > 0.0) {
            // Positive X (right face)
            uv = vec2(-rayDir.z / rayDir.x, -rayDir.y / rayDir.x);
            uv = uv * 0.5 + 0.5; // Map from [-1,1] to [0,1]
            color = texture2D(uSkyboxPosX, uv);
        } else {
            // Negative X (left face)
            uv = vec2(rayDir.z / -rayDir.x, -rayDir.y / -rayDir.x);
            uv = uv * 0.5 + 0.5;
            color = texture2D(uSkyboxNegX, uv);
        }
    } else if (absDir.y >= absDir.x && absDir.y >= absDir.z) {
        // Y face (top or bottom)
        if (rayDir.y > 0.0) {
            // Positive Y (top face)
            uv = vec2(rayDir.x / rayDir.y, rayDir.z / rayDir.y);
            uv = uv * 0.5 + 0.5;
            color = texture2D(uSkyboxPosY, uv);
        } else {
            // Negative Y (bottom face)
            uv = vec2(rayDir.x / -rayDir.y, -rayDir.z / -rayDir.y);
            uv = uv * 0.5 + 0.5;
            color = texture2D(uSkyboxNegY, uv);
        }
    } else {
        // Z face (front or back)
        if (rayDir.z > 0.0) {
            // Positive Z (front face)
            uv = vec2(rayDir.x / rayDir.z, -rayDir.y / rayDir.z);
            uv = uv * 0.5 + 0.5;
            color = texture2D(uSkyboxPosZ, uv);
        } else {
            // Negative Z (back face)
            uv = vec2(-rayDir.x / -rayDir.z, -rayDir.y / -rayDir.z);
            uv = uv * 0.5 + 0.5;
            color = texture2D(uSkyboxNegZ, uv);
        }
    }
    
    return color.rgb;
}

vec3 getSkyColor(vec3 rayDir, float time) {
    // Check background mode: 0=black, 1=tunnel, 2=skybox
    if (uBackgroundMode == 2) {
        // Skybox mode
        return sampleCubemap(rayDir);
    } else if (uBackgroundMode == 1) {
        // Tunnel mode - Abstract moving tunnel effect
        // Convert ray direction to cylindrical coordinates for tunnel effect
        float angle = atan(rayDir.x, rayDir.z);
        float radius = length(rayDir.xz);
        float depth = rayDir.y;
        
        // Create tunnel coordinates
        float tunnelRadius = 1.0 / max(radius, 0.1); // Inverse for tunnel effect
        float tunnelAngle = angle + time * 0.3; // Rotating tunnel
        float tunnelDepth = depth + time * 0.5; // Moving forward through tunnel
        
        // Multiple layers of tunnel patterns
        vec3 color = vec3(0.0);
        
        // Layer 1: Main tunnel structure
        float tunnel1 = sin(tunnelRadius * 8.0 + tunnelDepth * 4.0) * 0.5 + 0.5;
        float rings1 = sin(tunnelAngle * 6.0 + time * 2.0) * 0.5 + 0.5;
        vec3 color1 = vec3(0.2, 0.4, 0.8) * tunnel1 * rings1;
        
        // Layer 2: Secondary patterns
        float tunnel2 = sin(tunnelRadius * 12.0 - tunnelDepth * 6.0 + time) * 0.5 + 0.5;
        float rings2 = cos(tunnelAngle * 8.0 - time * 1.5) * 0.5 + 0.5;
        vec3 color2 = vec3(0.8, 0.2, 0.6) * tunnel2 * rings2;
        
        // Layer 3: Fine details
        float tunnel3 = fbm(vec2(tunnelRadius * 20.0, tunnelAngle * 10.0 + time * 3.0)) * 0.5 + 0.5;
        float depth3 = sin(tunnelDepth * 10.0 + time * 4.0) * 0.5 + 0.5;
        vec3 color3 = vec3(0.4, 0.8, 0.3) * tunnel3 * depth3;
        
        // Combine layers with different blend modes
        color = color1 * 0.4 + color2 * 0.3 + color3 * 0.2;
        
        // Add some energy pulses
        float pulse = sin(time * 5.0) * 0.5 + 0.5;
        float energyRing = smoothstep(0.8, 1.0, sin(tunnelRadius * 15.0 + time * 8.0));
        color += vec3(1.0, 0.5, 0.0) * energyRing * pulse * 0.3;
        
        // Add depth-based color shifting
        float depthShift = sin(tunnelDepth * 3.0 + time * 2.0) * 0.5 + 0.5;
        color = mix(color, color.zxy, depthShift * 0.3); // Cycle RGB channels
        
        // Add some sparkles/stars
        vec2 sparkleCoord = vec2(tunnelAngle * 20.0, tunnelRadius * 30.0);
        float sparkle = smoothstep(0.98, 1.0, fbm(sparkleCoord + time * 2.0));
        color += vec3(1.0) * sparkle * 0.5;
        
        // Enhance contrast and add glow
        color = pow(color, vec3(0.8)); // Gamma correction for more vibrant colors
        color *= 1.2; // Boost brightness
        
        // Add subtle vignette effect to enhance tunnel feeling
        float vignette = 1.0 - smoothstep(0.5, 1.5, radius);
        color *= mix(0.3, 1.0, vignette);
        
        return clamp(color, 0.0, 1.0);
    } else {
        // Black background mode (default)
        return vec3(0.0, 0.0, 0.0);
    }
}

struct Light {
    vec3 position;
    vec4 color;
    float brightness;
    float penumbraFactor;
};

struct Material {
    vec4 color;
    float gloss;
};

float distSphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

vec4 tex3D(in vec3 p, in vec3 n, sampler2D tex) {
    vec4 x = texture2D(tex, p.yz);
    vec4 y = texture2D(tex, p.xz);
    vec4 z = texture2D(tex, p.xy);
    return x * abs(n.x) + y * abs(n.y) + z * abs(n.z);
}

float sdBoxFrame( vec3 p, vec3 b, float e ){
    p = abs(p  )-b;
    vec3 q = abs(p+e)-e;
    return min(min(
    length(max(vec3(p.x,q.y,q.z),0.0))+min(max(p.x,max(q.y,q.z)),0.0),
    length(max(vec3(q.x,p.y,q.z),0.0))+min(max(q.x,max(p.y,q.z)),0.0)),
    length(max(vec3(q.x,q.y,p.z),0.0))+min(max(q.x,max(q.y,p.z)),0.0));
}

float distVideoPlane(vec3 p) {
    // Plane facing camera, centered at (0, 0, 0), size 2x2 in X and Y, lying at Z = 0.5
    // Adjust position/size as needed
    vec3 center = uPlanePosition;
    vec2 planeSize = uPlaneSize; // half extents
    vec3 local = p - center;

    // Create a sharp boundary exactly at the plane edges
    // Return a large distance if outside bounds
    if (abs(local.x) > planeSize.x || abs(local.y) > planeSize.y) {
        return 100.0; // Large distance to prevent rendering outside plane bounds
    }

    return abs(local.z); // distance to z-plane
}

float distTextBillboard(vec3 p, vec3 center, vec3 cameraPos, int orbIndex) {
    // Early distance check - if we're far from the billboard center, skip expensive calculations
    float roughDist = length(p - center);
    if (roughDist > 0.5) return roughDist; // Return actual distance, no offset
    
    // Calculate billboard orientation (always face camera)
    vec3 toCam = normalize(cameraPos - center);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, toCam));
    up = cross(toCam, right);
    
    // Transform point to billboard local space
    vec3 local = p - center;
    vec2 localPos = vec2(dot(local, right), dot(local, up));
    
    // Check if within billboard bounds
    if (abs(localPos.x) > TEXT_BILLBOARD_SIZE.x || abs(localPos.y) > TEXT_BILLBOARD_SIZE.y) {
        return length(local); // Return actual distance, no offset
    }
    
    // Calculate UV and sample texture to check if there's text here
    vec2 uv = (localPos / TEXT_BILLBOARD_SIZE) * 0.5 + 0.5;
    uv.y = 1.0 - uv.y;
    
    // Adjust UV for texture atlas - each orb gets a horizontal strip
    float orbIndexFloat = float(orbIndex);
    float totalOrbs = float(uTextCount);
    uv.y = (uv.y + orbIndexFloat) / totalOrbs; // Map to correct strip in atlas
    
    // Sample the text texture atlas
    vec4 textColor = texture2D(uTextTexture, uv);
    
    // If this pixel is black (background), don't register as a surface
    if (isBlackChromaKey(textColor.rgb)) {
        return 100.0; // Return large distance to prevent surface detection
    }
    
    // Distance to billboard plane for text pixels
    return abs(dot(local, toCam));
}

float distBox(vec3 samplePos, vec3 boxPos, vec3 boxDim) {    
    vec3 d = abs(samplePos-boxPos) - boxDim;
    float boxDist = min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
    
    // Apply bump mapping near the surface of the box
    float bump = 0.0;
    if (abs(boxDist) < 0.2) { // Apply bump within a reasonable distance of the surface
        vec3 normal = normalize(samplePos - boxPos);
        vec4 tex = tex3D(samplePos * TEX_SCALE_FACTOR, normal, iChannel0);
        bump = tex.x * BUMP_FACTOR;
    }
    
    return boxDist + bump;
}

float sdPlane( vec3 p, vec3 n, float h ){
    // n must be normalized
    return dot(p,n) + h;
}

float getDist(vec3 samplePos, bool skipVideoPlane, vec3 cameraPos) {
    float d = min(distBox(samplePos, BOX_POS, BOX_DIM), 
    distBox(samplePos, vec3(0.0, -5.0, 0.0), vec3(4.0, 4.0, 4.0)));

    // Optimized orb checking with early exit
    float minOrbDist = 1000.0;
    for (int i = 0; i < MAX_ORBS; i++) {
        if (i >= uOrbCount) break;
        
        // Check if camera is inside this orb
        float cameraDistToOrb = length(cameraPos - uOrbPositions[i]);
        bool cameraInsideOrb = cameraDistToOrb < uOrbRadii[i];
        
        // Only render orb if camera is not inside it
        if (!cameraInsideOrb) {
            float orbDist = distSphere(samplePos, uOrbPositions[i], uOrbRadii[i]);
            minOrbDist = min(minOrbDist, orbDist);
            // Early exit if we're very close to an orb
            if (orbDist < 0.01) break;
        }
    }

    d = min(d, minOrbDist);

    // Only check text billboards if we're close to orbs
    if (minOrbDist < 1.0) {
        for (int i = 0; i < MAX_ORBS; i++) {
            if (i >= uTextCount) break;
            
            // Check if camera is inside this orb - if so, skip its text billboard
            float cameraDistToOrb = length(cameraPos - uOrbPositions[i]);
            bool cameraInsideOrb = cameraDistToOrb < uOrbRadii[i];
            
            if (!cameraInsideOrb) {
                d = min(d, distTextBillboard(samplePos, uTextPositions[i], cameraPos, i));
            }
        }
    }

    // Add video plane
    if (!skipVideoPlane) {
        float dVideo = distVideoPlane(samplePos);
        d = min(d, dVideo);
    }

    return d;
}

void camFreefly(out vec3 pos, out vec3 dir, in vec3 cameraPos, in vec2 rotation, in vec2 fragCoord) {
    pos = cameraPos;
    
    // Calculate screen coordinates
    vec2 uv = (fragCoord.xy - iResolution.xy * 0.5) / iResolution.y;
    
    // Create view ray in camera space (looking down -Z)
    vec3 rayDir = normalize(vec3(uv.x, uv.y, -1.0));
    
    // Build rotation matrix from yaw and pitch
    float yaw = rotation.y;
    float pitch = rotation.x;
    
    // Rotation matrix for yaw (Y axis)
    mat3 yawMatrix = mat3(
        cos(yaw), 0.0, sin(yaw),
        0.0, 1.0, 0.0,
        -sin(yaw), 0.0, cos(yaw)
    );
    
    // Rotation matrix for pitch (X axis)
    mat3 pitchMatrix = mat3(
        1.0, 0.0, 0.0,
        0.0, cos(pitch), -sin(pitch),
        0.0, sin(pitch), cos(pitch)
    );
    
    // Apply rotations: first pitch, then yaw
    dir = yawMatrix * pitchMatrix * rayDir;
}

void camPolar(out vec3 pos, out vec3 dir, in vec3 origin, in vec2 rotation, in float dist, in float zoom, in vec2 fragCoord) {
    vec2 c = cos(rotation);
    vec4 s;
    s.xy = sin(rotation);
    s.zw = -s.xy;
    
    dir.xy = fragCoord.xy - iResolution.xy*.5;
    dir.z = iResolution.y*zoom;
    dir = normalize(dir);
    
    dir.yz = dir.yz*c.x + dir.zy*s.zx;
    dir.xz = dir.xz*c.y + dir.zx*s.yw;
    
    pos = origin - dist*vec3(c.x*s.y,s.z,c.x*c.y);
}

void marchThroughField(inout vec3 pos, vec3 dir, vec3 eye, bool skipVideoPlane) {
    float dist;
    for(int i = 0; i < MAX_VIEW_STEPS; i++) {
        dist = getDist(pos, skipVideoPlane, eye);
        if(dist < EPSILON || length(pos-eye) > MAX_DEPTH-EPSILON)            
            return;
        pos += dir * dist;
    }
}

vec3 getNormal(vec3 pos) {
    float d = getDist(pos, false, vec3(0.0));
    return normalize(vec3(
        getDist(pos+vec3(EPSILON,0,0), false, vec3(0.0))-d,
        getDist(pos+vec3(0,EPSILON,0), false, vec3(0.0))-d,
        getDist(pos+vec3(0,0,EPSILON), false, vec3(0.0))-d
    ));
}

float calcOcclusion(vec3 pos, vec3 surfaceNormal) {
    float result = 0.0;
    vec3 normalPos = vec3(pos);
    for(float i = 0.0; i < OCCLUSION_SAMPLES; i+=1.0) {
        normalPos += surfaceNormal * (1.0/OCCLUSION_SAMPLES);
        result += (1.0/exp2(i)) * (i/OCCLUSION_SAMPLES)-getDist(normalPos, false, vec3(0.0));
    }
    return 1.0-(OCCLUSION_FACTOR*result);
}

float calcShadow(vec3 origin, vec3 lightDir, Light light) {
    float dist;
    float result = 1.0;
    float lightDist = length(light.position - origin);
    
    vec3 pos = origin + lightDir * (EPSILON * 15.0 + BUMP_FACTOR);

    for (int i = 0; i < MAX_SHADOW_STEPS; i++) {
        // Check regular geometry (excluding video plane and text billboards)
        dist = getDist(pos, true, vec3(0.0));
        
        // Manually check only non-text geometry for shadows
        float d = min(distBox(pos, BOX_POS, BOX_DIM), 
        distBox(pos, vec3(0.0, -5.0, 0.0), vec3(4.0, 4.0, 4.0)));
        
        // Optimized orb checking for shadows with early exit
        for (int j = 0; j < MAX_ORBS; j++) {
            if (j >= uOrbCount) break;
            
            // Check if camera is inside this orb (same logic as in getDist)
            float cameraDistToOrb = length(origin - uOrbPositions[j]);
            bool cameraInsideOrb = cameraDistToOrb < uOrbRadii[j];
            
            // Only check orb shadow if camera is not inside it
            if (!cameraInsideOrb) {
                float orbDist = distSphere(pos, uOrbPositions[j], uOrbRadii[j]);
                d = min(d, orbDist);
                // Early exit if we hit an orb
                if (orbDist < EPSILON) {
                    return 0.0;
                }
            }
        }
        
        dist = d;

        // Check video plane (simplified)
        vec3 center = uPlanePosition;
        vec2 planeSize = uPlaneSize;
        vec3 local = pos - center;

        // Ray-plane intersection (plane at Z = center.z)
        if (abs(lightDir.z) > 0.0001) {  // avoid division by 0
            float tPlane = (center.z - origin.z) / lightDir.z;
        
            if (tPlane > 0.0 && tPlane < lightDist) {
                vec3 hitPos = origin + tPlane * lightDir;
                vec3 local = hitPos - center;
        
                if (abs(local.x) <= planeSize.x && abs(local.y) <= planeSize.y) {
                    vec2 uv = local.xy / planeSize + 0.5;
                    uv.y = 1.0 - uv.y;
                    
                    // Check if we're outside the valid texture area - no shadow if so
                    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
                        vec4 tex = texture2D(iChannel1, uv);
            
                        // Get chroma key alpha for smooth transparency
                        float chromaAlpha = getChromaAlpha(tex.rgb);
                        if (chromaAlpha > 0.1) { // Only block light if significantly opaque
                            return result * (1.0 - chromaAlpha); // Partial shadow based on alpha
                        }
                    }
                    // If outside texture bounds, don't cast any shadow (continue as if transparent)
                }
            }
        }

        if (dist < EPSILON) {
            return 0.0; // Hit solid geometry
        }

        if (length(pos - origin) > lightDist || length(pos - origin) > MAX_DEPTH) {
            return result;
        }

        pos += lightDir * dist;

        if (length(pos - origin) < lightDist) {
            result = min(result, light.penumbraFactor * dist / length(pos - origin));
        }
    }
    return result;
}


vec4 calcLighting(vec3 samplePos, vec3 eye, Light light, Material material) {
    float lightDist = length(light.position-samplePos);
    vec3 lightDir = normalize(light.position-samplePos);
    vec3 eyeDir = normalize(samplePos-eye);
    vec3 surfaceNormal = getNormal(samplePos);
    vec3 reflection = normalize(reflect(eyeDir, surfaceNormal));
    
    float specular = pow(max(0.0, dot(lightDir, reflection)), 72.0);
    float diffuse = max(0.0, dot(lightDir, surfaceNormal));
    float ambient = .05;
    
    float attenuation = min(1.0, 1.0/(lightDist/light.brightness));
    float shadow = calcShadow(samplePos, lightDir, light);
    float occlusion = calcOcclusion(samplePos, surfaceNormal);
    
    // Check if we're on an orb surface
    vec4 finalColor = material.color;
    for(int i = 0; i < MAX_ORBS; i++) {
        if(i >= uOrbCount) break;
        if(length(samplePos - uOrbPositions[i]) < uOrbRadii[i] + EPSILON) {
            finalColor = vec4(uOrbColors[i], 1.0);
            break;
        }
    }
    
    return light.color * finalColor * clamp(((specular+diffuse)*shadow*attenuation)+(ambient*occlusion), 0.0, 1.0);
}

vec4 shade(vec3 pos, vec3 dir, vec3 eye, Light light, Material material) {
    if (length(pos - eye) > MAX_DEPTH - EPSILON) {
        // Ray didn't hit anything - render sky
        vec3 skyColor = getSkyColor(dir, iTime);
        return vec4(skyColor, 1.0);
    }

    // Check if this point is on a text billboard
    for (int i = 0; i < MAX_ORBS; i++) {
        if (i >= uTextCount) break;
        
        vec3 center = uTextPositions[i];
        vec3 toCam = normalize(eye - center);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 right = normalize(cross(up, toCam));
        up = cross(toCam, right);
        
        vec3 local = pos - center;
        vec2 localPos = vec2(dot(local, right), dot(local, up));
        
        if (abs(localPos.x) <= TEXT_BILLBOARD_SIZE.x && 
            abs(localPos.y) <= TEXT_BILLBOARD_SIZE.y &&
            abs(dot(local, toCam)) < EPSILON) {
            
            // Calculate UV coordinates for the text texture atlas
            vec2 uv = (localPos / TEXT_BILLBOARD_SIZE) * 0.5 + 0.5;
            uv.y = 1.0 - uv.y; // Flip Y coordinate
            
            // Adjust UV for texture atlas - each orb gets a horizontal strip
            float orbIndex = float(i);
            float totalOrbs = float(uTextCount);
            uv.y = (uv.y + orbIndex) / totalOrbs; // Map to correct strip in atlas
            
            // Sample the text texture atlas
            vec4 textColor = texture2D(uTextTexture, uv);
            
            // Return the text color (transparency is handled at distance field level)
            return textColor;
        }
    }

    // Determine if this point is on the video plane
    vec3 center = uPlanePosition;
    vec2 planeSize = uPlaneSize;
    vec3 local = pos - center;

    if (abs(local.z) < EPSILON &&
    abs(local.x) <= planeSize.x &&
    abs(local.y) <= planeSize.y) {

        vec2 uv = local.xy / planeSize + 0.5;
        uv.y = 1.0 - uv.y;

        // Check if we're outside the valid texture area (0-1 range)
        // If so, make this area transparent regardless of chroma key settings
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            // Outside texture bounds - always transparent
            vec3 deepPos = pos + dir * EPSILON * 2.0;
            marchThroughField(deepPos, dir, eye, true);
            
            if (length(deepPos - eye) < MAX_DEPTH - EPSILON) {
                return calcLighting(deepPos, eye, light, material);
            } else {
                // No object behind transparent area - render sky instead of black
                vec3 skyColor = getSkyColor(dir, iTime);
                return vec4(skyColor, 1.0);
            }
        }

        vec4 tex = texture2D(iChannel1, uv); // Use regular texture2D since we know UV is valid
        
        // Get chroma key alpha for smooth transparency
        float chromaAlpha = getChromaAlpha(tex.rgb);
        
        // Calculate lighting for both front and back of the video plane
        float lightDist = length(light.position - pos);
        vec3 lightDir = normalize(light.position - pos);
        vec3 eyeDir = normalize(pos - eye);
        
        // Calculate lighting for front face
        vec3 frontNormal = vec3(0.0, 0.0, 1.0);
        vec3 frontReflection = normalize(reflect(eyeDir, frontNormal));
        float frontSpecular = pow(max(0.0, dot(lightDir, frontReflection)), 72.0);
        float frontDiffuse = max(0.0, dot(lightDir, frontNormal));
        
        // Calculate lighting for back face
        vec3 backNormal = vec3(0.0, 0.0, -1.0);
        vec3 backReflection = normalize(reflect(eyeDir, backNormal));
        float backSpecular = pow(max(0.0, dot(lightDir, backReflection)), 72.0);
        float backDiffuse = max(0.0, dot(lightDir, backNormal));
        
        // Use the stronger of front or back lighting
        float specular = max(frontSpecular, backSpecular);
        float diffuse = max(frontDiffuse, backDiffuse);
        float ambient = 0.3; // Increased from 0.15 to match orbworks.html
        
        float attenuation = min(1.0, 1.0/(lightDist/light.brightness));
        float shadow = calcShadow(pos, lightDir, light);
        float occlusion = calcOcclusion(pos, frontNormal);
        
        // Apply lighting to the video texture
        // Ensure minimum lighting so back side is never completely black
        float minLighting = 0.2; // Minimum lighting level to prevent complete darkness
        float lightingFactor = max(minLighting, ((specular+diffuse)*shadow*attenuation*0.7)+(ambient*occlusion));
        vec4 litColor = light.color * tex * clamp(lightingFactor, 0.4, 1.0); // Changed minimum from 0.0 to 0.4
        
        // Handle transparency with simple blending
        if (chromaAlpha < 0.99) {
            // Blend with background for semi-transparent pixels
            vec3 deepPos = pos + dir * EPSILON * 2.0;
            marchThroughField(deepPos, dir, eye, true);
            
            if (length(deepPos - eye) < MAX_DEPTH - EPSILON) {
                vec4 backgroundColor = calcLighting(deepPos, eye, light, material);
                return mix(backgroundColor, litColor, chromaAlpha);
            } else {
                // No object behind transparent area - render sky instead of black
                vec3 skyColor = getSkyColor(dir, iTime);
                vec4 skyBackground = vec4(skyColor, 1.0);
                return mix(skyBackground, litColor, chromaAlpha);
            }
        }
        
        return litColor;
    }

    return calcLighting(pos, eye, light, material);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec3 pos, dir, eye;
    
    if (uUsePolarCamera) {
        camPolar(pos, dir, uPlanePosition, uPolarRotation, uPolarDistance, 1.0, fragCoord);
    } else {
        camFreefly(pos, dir, uCameraPos, uCameraRot, fragCoord);
    }
    eye = vec3(pos);
    
    // Create dynamic light based on active light settings
    vec3 lightPos = vec3(3.0, 3.5, 3.0);
    vec3 lightColor = vec3(1.0, 1.0, 1.0);
    float lightIntensity = 3.0;
    int lightEffect = 0;
    
    // Use conditional statements to select the active light (WebGL 1.0 compatible)
    if (uActiveLightIndex == 0) {
        lightPos = uLightPositions[0];
        lightColor = uLightColors[0];
        lightIntensity = uLightIntensities[0];
        lightEffect = uLightEffects[0];
    } else if (uActiveLightIndex == 1) {
        lightPos = uLightPositions[1];
        lightColor = uLightColors[1];
        lightIntensity = uLightIntensities[1];
        lightEffect = uLightEffects[1];
    } else if (uActiveLightIndex == 2) {
        lightPos = uLightPositions[2];
        lightColor = uLightColors[2];
        lightIntensity = uLightIntensities[2];
        lightEffect = uLightEffects[2];
    } else if (uActiveLightIndex == 3) {
        lightPos = uLightPositions[3];
        lightColor = uLightColors[3];
        lightIntensity = uLightIntensities[3];
        lightEffect = uLightEffects[3];
    }
    
    // Apply light effects
    if (lightEffect == 1) { // SPIN
        float angle = iTime * 1.3;
        lightPos = vec3(
            3.0 * cos(angle),
            lightPos.y,
            3.0 * sin(angle)
        );
    } else if (lightEffect == 2) { // STROBE
        float strobe = step(0.5, fract(iTime * 4.0));
        lightIntensity *= strobe;
    } else if (lightEffect == 3) { // RAINBOW
        lightColor = vec3(
            0.5 + 0.5 * sin(iTime * 2.0),
            0.5 + 0.5 * sin(iTime * 2.0 + 2.094),
            0.5 + 0.5 * sin(iTime * 2.0 + 4.188)
        );
    }
    
    Light light = Light(
        lightPos,
        vec4(lightColor, 1.0),
        lightIntensity,
        PEN_FACTOR
    );
    Material mat = Material(MAT_COLOR, MAT_GLOSS);
    
    marchThroughField(pos, dir, eye, false);
    
    gl_FragColor = shade(pos, dir, eye, light, mat);
}