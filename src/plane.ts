import * as THREE from 'three';
import { Pathfinding, PathfindingHelper } from 'three-pathfinding';

interface PlaneData {
    mesh: THREE.Mesh;
    timestamp: number;
    zoneId: string;
}

class PlaneManager {
    private planes = new Map<XRPlane, PlaneData>();
    private refSpace: XRReferenceSpace;
    private grassMaterial: THREE.Material;
    private pathFinding: Pathfinding;
    private pathFindingHelper: PathfindingHelper;
    private nextZoneNo: number = 0;

    public constructor(textureLoader: THREE.TextureLoader, scene: THREE.Scene){
        const repeatX = 2;
        const repeatY = 2;
        const offsetX = 0;
        const offsetY = 0;
        const albedo = textureLoader.load('assets/textures/grass/stylized-grass1_albedo.png');
        albedo.wrapS = THREE.RepeatWrapping;
        albedo.wrapT = THREE.RepeatWrapping;
        albedo.repeat.set(repeatX,repeatY);
        albedo.offset.set(offsetX, offsetY);

        const height = textureLoader.load('assets/textures/grass/stylized-grass1_height.png');
        height.wrapS = THREE.RepeatWrapping;
        height.wrapT = THREE.RepeatWrapping;
        height.repeat.set(repeatX,repeatY);
        height.offset.set(offsetX, offsetY);

        const metallic = textureLoader.load('assets/textures/grass/stylized-grass1_metallic.png');
        metallic.wrapS = THREE.RepeatWrapping;
        metallic.wrapT = THREE.RepeatWrapping;
        metallic.repeat.set(repeatX,repeatY);
        metallic.offset.set(offsetX, offsetY);

        const normal = textureLoader.load('assets/textures/grass/stylized-grass1_normal-ogl.png');
        normal.wrapS = THREE.RepeatWrapping;
        normal.wrapT = THREE.RepeatWrapping;
        normal.repeat.set(repeatX,repeatY);
        normal.offset.set(offsetX, offsetY);

        this.grassMaterial = new THREE.MeshStandardMaterial({
            metalnessMap: metallic,
            normalMap: normal,
            bumpMap: height,
            map: albedo,
            side: THREE.DoubleSide
        });

        this.pathFinding = new Pathfinding();
        this.pathFindingHelper = new PathfindingHelper();
        scene.add(this.pathFindingHelper);
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
                    const zoneId = this.createZoneId();
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.userData.isPlane = true;
                    mesh.userData.zoneId = zoneId;
                    scene.add(mesh);
    
                    planeData = { mesh, timestamp: xrPlane.lastChangedTime,  zoneId: zoneId};
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

                    const zoneGeometry = planeData.mesh.geometry.clone().applyMatrix4(matrix);
                    this.pathFinding.setZoneData(planeData.zoneId, Pathfinding.createZone(zoneGeometry));
                    planeData.mesh.position.y += 0.01;
                }
            });
        }
    }

    public processPath(src: THREE.Vector3, dst: THREE.Vector3, zoneId: string){
        const groupId = this.pathFinding.getGroup(zoneId, src);
        const path = this.pathFinding.findPath(src, dst, zoneId, groupId);
        if(path){
            this.pathFindingHelper.reset();
            this.pathFindingHelper.setPlayerPosition(src);
            this.pathFindingHelper.setTargetPosition(dst);
            this.pathFindingHelper.setPath(path);
        }
    }

    private createZoneId(){
        return "zone" + this.nextZoneNo++;
    }
}

export {PlaneManager};
