// Use varying for GLSL 1.0 compatibility
varying vec4 viewPosition;

void main() {
    viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
}