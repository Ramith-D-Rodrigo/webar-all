import * as THREE from 'three';


class DepthManager {
    private depthaffectedMaterials: THREE.Material[] = [];

    public addDepthPropertyToMaterial(material: THREE.Material) {
        material.onBeforeCompile = (shader) => {
            material.userData.shader = shader;
            shader.uniforms = {
                ...shader.uniforms,
                depthTexture: { value: null },
                depthUVTransform: { value: new THREE.Matrix4() },
                depthScale: { value: 0.0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            };
            shader.fragmentShader = shader.fragmentShader.replace(`#include <clipping_planes_pars_fragment>`,
                `#include <clipping_planes_pars_fragment>
    
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
                }`
            );
    
            shader.fragmentShader = shader.fragmentShader.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`,
                `
                vec2 depthTexCoord = (depthUVTransform * vec4(normalizeFragCoords(gl_FragCoord.xy), 0.0, 1.0)).xy;
                float depth = depthGetMeters(depthTexture, depthTexCoord);
                float objectDepth = vViewPosition.z;
                
                if((depth + 0.05) < objectDepth) { // Real object is in front of virtual object
                    discard; // Discard the virtual object
                }
                
                vec4 diffuseColor = vec4( diffuse, opacity );`
            );
        }
    
        this.depthaffectedMaterials.push(material);
    }

    public processDepth(pose: XRViewerPose, frame: XRFrame, renderer: THREE.WebGLRenderer){
        pose.views.forEach(view => {
            const glLayer = renderer.xr.getBaseLayer() as XRWebGLLayer;
            const viewport = glLayer.getViewport(view) as XRViewport;
            const depthInfo = frame.getDepthInformation(view);
            if(depthInfo){
                const depthData = new Uint8Array(depthInfo.data, 0, depthInfo.data.byteLength);
                const depthTexture = new THREE.DataTexture(
                    depthData, 
                    depthInfo.width, 
                    depthInfo.height
                );
                depthTexture.format = THREE.RGFormat;
                depthTexture.type = THREE.UnsignedByteType;
                depthTexture.needsUpdate = true;
                
                // Update the original material
                this.updateMaterial(depthInfo, depthTexture, viewport);
            }
        });
    }

    private updateMaterial(depthInfo: XRCPUDepthInformation, depthTexture: THREE.DataTexture, viewport: XRViewport) { 
        this.depthaffectedMaterials.forEach(material => {
            if (!material.userData.shader) return;  
            material.userData.shader.uniforms.depthTexture.value = depthTexture;
            material.userData.shader.uniforms.depthUVTransform.value = depthInfo.normDepthBufferFromNormView.matrix;
            material.userData.shader.uniforms.depthScale.value = depthInfo.rawValueToMeters;
            material.userData.shader.uniforms.resolution.value = new THREE.Vector2(viewport.width, viewport.height);
        });
    }
}

export {DepthManager};
