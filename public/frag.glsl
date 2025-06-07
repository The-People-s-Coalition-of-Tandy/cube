precision highp float;

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
    #define MAX_ORBS 10             // Full orbs for desktop
#endif

#define OCCLUSION_FACTOR .5
#define MAX_DEPTH 50.0
#define BUMP_FACTOR .03
#define TEX_SCALE_FACTOR .4
#define ORB_RADIUS 0.1
#define TEXT_BILLBOARD_SIZE vec2(0.1, 0.03) // Smaller billboards - width and height

#define BOX_POS vec3(0.0, 0.0, 0.0)
#define BOX_DIM vec3(1.0, 1.0, 1.0)
#define LIGHT_COLOR vec4(1.0)
#define PEN_FACTOR 50.0
#define MAT_COLOR vec4(1.0)
#define MAT_GLOSS 1.0
// #define PLANE_SIZE vec2(uPlaneSize * (16./9.), uPlaneSize)


// Configurable chroma key function - returns true if color should be keyed out (transparent)
bool isChromaKey(vec3 color) {
    if (!uChromaEnabled) return false;
    
    // Use distance-based color matching for better accuracy
    float distance = length(color - uChromaKeyColor);
    return distance < uChromaThreshold;
}

// Legacy black chroma key function for text (still using black for text backgrounds)
bool isBlackChromaKey(vec3 color) {
    // For text backgrounds, we still use black keying
    float threshold = 0.5;
    return (color.r < threshold && color.g < threshold && color.b < threshold);
}

// Safe texture sampling function that prevents edge stretching
vec4 safeTextureSample(sampler2D tex, vec2 uv) {
    // Check if UV is outside the valid 0-1 range
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 0.0); // Return transparent black for out-of-bounds samples
    }
    return texture2D(tex, uv);
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
                    vec4 tex = safeTextureSample(iChannel1, uv);
        
                    if (!isChromaKey(tex.rgb)) {
                        return 0.0; // opaque part of the video plane blocks light
                    }
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
    if (length(pos - eye) > MAX_DEPTH - EPSILON) return vec4(0.0);

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

        vec4 tex = safeTextureSample(iChannel1, uv);
        
        // Check if this pixel should be keyed out (transparent)
        if (isChromaKey(tex.rgb)) {
            // Pixel is transparent, raymarch through to background
            vec3 deepPos = pos;
            marchThroughField(deepPos, dir, eye, true);
            
            // Only render background if something was hit
            if (length(deepPos - eye) < MAX_DEPTH - EPSILON) {
                return calcLighting(deepPos, eye, light, material);
            }
            
            // If nothing hit behind, return black/transparent
            return vec4(0.0, 0.0, 0.0, 0.0);
        }
        
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
        float ambient = 0.3; // Increased from 0.05 to maintain higher minimum brightness
        
        float attenuation = min(1.0, 1.0/(lightDist/light.brightness));
        float shadow = calcShadow(pos, lightDir, light);
        float occlusion = calcOcclusion(pos, frontNormal); // Using front normal for occlusion
        
        // Apply lighting to the video texture with higher minimum brightness
        vec4 litColor = light.color * tex * clamp(((specular+diffuse)*shadow*attenuation*0.7)+(ambient*occlusion), 0.4, 1.0);
        
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
    
    Light light = Light(
        vec3(3.0*sin(iTime+1.3), 3.5, 3.0*cos(iTime+1.3)),
        LIGHT_COLOR,
        3.0,
        PEN_FACTOR
    );
    Material mat = Material(MAT_COLOR, MAT_GLOSS);
    
    marchThroughField(pos, dir, eye, false);
    
    gl_FragColor = shade(pos, dir, eye, light, mat);
}