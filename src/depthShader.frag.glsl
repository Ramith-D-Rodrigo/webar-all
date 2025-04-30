precision highp float;

// Use varying for GLSL 1.0 compatibility
varying vec4 viewPosition;

uniform sampler2D depthTexture;
uniform mat4 depthUVTransform; // UV transform matrix in normalized view space
uniform float depthScale; // Depth scale factor (unspecified unit to meters)
uniform vec2 resolution; // Resolution of the depth texture

float depthGetMeters(in sampler2D depth_texture, in vec2 depth_uv) {
    vec2 packedDepthAndVisibility = texture2D(depth_texture, depth_uv).rg;
    return dot(packedDepthAndVisibility, vec2(255.0, 256.0 * 255.0)) * depthScale;
}

vec2 normalizeFragCoords(in vec2 fragCoords) {    
    return vec2(fragCoords.x / resolution.x, 1.0 - fragCoords.y / resolution.y);
}

void main() {
    vec2 depthTexCoord = (depthUVTransform * vec4(normalizeFragCoords(gl_FragCoord.xy), 0.0, 1.0)).xy;
    float depth = depthGetMeters(depthTexture, depthTexCoord);
    
    // Adjust the comparison to handle possible precision issues
    // viewPosition.z is negative in view space, so we need the absolute value or proper comparison
    float objectDepth = -viewPosition.z; // Convert to positive distance
    
    if(depth < objectDepth) { // Real object is in front of virtual object
        discard; // Discard the virtual object
    }
    
    // Output with gl_FragColor for GLSL 1.0 compatibility
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}