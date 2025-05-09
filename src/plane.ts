import * as THREE from 'three';

interface PlaneData {
    mesh: THREE.Mesh;
    timestamp: number;
}

class PlaneManager {
    private planes = new Map<XRPlane, PlaneData>();
    private refSpace: XRReferenceSpace;
    private grassMaterial: THREE.Material;

    public constructor(textureLoader: THREE.TextureLoader){
        const albedo = textureLoader.load('../assets/textures/grass/stylized-grass1_albedo.png');
        albedo.wrapS = THREE.RepeatWrapping;
        albedo.wrapT = THREE.RepeatWrapping;
        albedo.repeat.set(5,5);

        // const ao = textureLoader.load('../textures/grass/stylized-grass1_ao.png');
        // ao.wrapS = THREE.RepeatWrapping;
        // ao.wrapT = THREE.RepeatWrapping;

        const height = textureLoader.load('../assets/textures/grass/stylized-grass1_height.png');
        height.wrapS = THREE.RepeatWrapping;
        height.wrapT = THREE.RepeatWrapping;
        height.repeat.set(5,5);

        const metallic = textureLoader.load('../assets/textures/grass/stylized-grass1_metallic.png');
        metallic.wrapS = THREE.RepeatWrapping;
        metallic.wrapT = THREE.RepeatWrapping;
        metallic.repeat.set(5,5);

        const roughness = textureLoader.load('../assets/textures/grass/stylized-grass1_roughness.png');
        roughness.wrapS = THREE.RepeatWrapping;
        roughness.wrapT = THREE.RepeatWrapping;
        roughness.repeat.set(5,5);

        const normal = textureLoader.load('../assets/textures/grass/stylized-grass1_normal-ogl.png');
        normal.wrapS = THREE.RepeatWrapping;
        normal.wrapT = THREE.RepeatWrapping;
        normal.repeat.set(5,5);

        this.grassMaterial = new THREE.MeshStandardMaterial({
            metalnessMap: metallic,
            metalness: 1,
            normalMap: normal,
            roughnessMap: roughness,
            roughness: 1,
            bumpMap: height,
            bumpScale: 0.1,
            map: albedo,
            side: THREE.DoubleSide,
        });
    }

    public getMaterial(): THREE.Material{
        return this.grassMaterial;
    }

    public setReferenceSpace(refSpace: XRReferenceSpace){
        this.refSpace = refSpace;
    }

    public getPlaneMap(){
        return this.planes;
    }

    private createPlaneGeometry(polygons: DOMPointReadOnly[]){
        const geometry = new THREE.BufferGeometry();
        
        const vertices: number[] = [];
        const uvs: number[] = [];
        polygons.forEach(vec => {
            vertices.push(vec.x, vec.y, vec.z);
            uvs.push(vec.x, vec.z);
        });
    
        const indices: number[] = [];
        for(let i = 2; i < polygons.length; ++i) {
            indices.push(0, i-1, i);
        }
    
        geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
    
        return geometry;
    }
    
    public processPlanes(detectedPlanes: XRPlaneSet | undefined, frame: XRFrame, scene: THREE.Scene){
        if(detectedPlanes){
            for (const [xrPlane, planeData] of this.planes) {
                if (!detectedPlanes.has(xrPlane)) {
                    scene.remove(planeData.mesh);
                    this.planes.delete(xrPlane);
                }
            }
        
            detectedPlanes.forEach((xrPlane) => {
                const planePose = frame.getPose(xrPlane.planeSpace, this.refSpace);
                if(xrPlane.orientation === 'vertical') return;
    
                if (!planePose) return;
                const polygon = xrPlane.polygon;
                if (!polygon || polygon.length < 3) return;
        
                let planeData = this.planes.get(xrPlane);
        
                if(!planeData){
                    // Create mesh for new plane            
                    const geometry = this.createPlaneGeometry(polygon);
                    const mesh = new THREE.Mesh(geometry, this.grassMaterial);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.matrixAutoUpdate = false;
                    mesh.userData.isPlane = true;
                    scene.add(mesh);
    
                    planeData = { mesh, timestamp: xrPlane.lastChangedTime };
                    this.planes.set(xrPlane, planeData);
                }
        
                if (xrPlane.lastChangedTime > planeData.timestamp) {
                    // Rebuild geometry      
                    planeData.mesh.geometry.dispose();
                    planeData.mesh.geometry = this.createPlaneGeometry(polygon);
                    planeData.timestamp = xrPlane.lastChangedTime;
    
                    const matrix = new THREE.Matrix4().fromArray(planePose.transform.matrix);
                    planeData.mesh.matrix.copy(matrix);
                    planeData.mesh.matrix.decompose(
                        planeData.mesh.position, 
                        planeData.mesh.quaternion, 
                        planeData.mesh.scale
                    );
                    planeData.mesh.position.y += 0.01;
                }
            });
        }
    }
}

export {PlaneManager};
