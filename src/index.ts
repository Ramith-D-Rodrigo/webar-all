import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader';
import depthShaderVertex from './depthShader.vert.glsl';
import depthShaderFrag from './depthShader.frag.glsl';
import { HitTestManager } from './hittest';
import { DepthManager } from './depth';

// GLOBALS
let viewerRefSpace: XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;

let anchoredObjects: { sceneObj: THREE.Mesh; anchor: XRAnchor; }[] = [];

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;

let textureLoader: THREE.TextureLoader;
let grassMaterial: THREE.Material;
let depthMaterial: THREE.MeshStandardMaterial;

let directionalLight: THREE.DirectionalLight;
let lightProbe: THREE.LightProbe;
let xrLightProbe: any;

interface PlaneData {
    mesh: THREE.Mesh;
    timestamp: number;
}
const planes = new Map<XRPlane, PlaneData>();

main();

async function main(){
    renderer = new THREE.WebGLRenderer({
        alpha: true,
        powerPreference: 'high-performance',
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xffffff, 0);
    renderer.xr.enabled = true;   
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight);
    scene = new THREE.Scene();
    directionalLight = new THREE.DirectionalLight();
    directionalLight.intensity = 0;
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    lightProbe = new THREE.LightProbe();
    lightProbe.intensity = 0;
    scene.add(lightProbe);

    const domRoot = document.querySelector("#dom-overlay") as HTMLDivElement;
    const arBtn = document.querySelector('#ar-btn') as HTMLButtonElement;

    textureLoader = new THREE.TextureLoader();
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

    grassMaterial = new THREE.MeshStandardMaterial({
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

    const features : XRSessionInit = {
        requiredFeatures: ['unbounded', 'depth-sensing', 'hit-test', 'anchors', 'light-estimation', 'viewer', 'dom-overlay', 'camera-access', 'plane-detection'],
        depthSensing: {
            usagePreference: ['cpu-optimized'],
            dataFormatPreference: ['luminance-alpha'],
        },
        domOverlay: {
            root: domRoot
        }
    };

    const hitTestManager = new HitTestManager(scene);
    const depthManager = new DepthManager();

    depthMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(1, 0, 0),
        transparent: true
    });

    depthManager.addDepthPropertyToMaterial(depthMaterial);
    depthManager.addDepthPropertyToMaterial(grassMaterial);

    arBtn.addEventListener('click', async (e) => {
        const session = await navigator.xr?.requestSession('immersive-ar', features);
        if(session){
            renderer.xr.setReferenceSpaceType('unbounded');
            renderer.setAnimationLoop(xrOnFrame);
            renderer.xr.setSession(session);

            viewerRefSpace = await session.requestReferenceSpace('viewer');
            unboundedRefSpace = await session.requestReferenceSpace('unbounded');

            if(session.requestHitTestSource){
                const arHitTestSource = await session.requestHitTestSource({
                    space: viewerRefSpace,
                }) as XRHitTestSource;
                hitTestManager.setSource(arHitTestSource);
                hitTestManager.setReferenceSpace(unboundedRefSpace);

                session.addEventListener('select', onSelect);
            }

            xrLightProbe = await session.requestLightProbe();
        }
        else{
            console.log("Unable to create the AR session");
        }
    });

    async function onSelect(event: Event){
        const hitTestResult = hitTestManager.getLatestResult();
        if(hitTestManager.isMeshVisible() && hitTestResult.createAnchor){
            const pose = hitTestResult.getPose(unboundedRefSpace);
            const anchor = await hitTestResult.createAnchor(pose?.transform as XRRigidTransform);
            const obj = new THREE.BoxGeometry(1, 1, 1);
            const objMesh = new THREE.Mesh(obj, depthMaterial);
            objMesh.castShadow = true;
            objMesh.receiveShadow = true;
            objMesh.scale.setScalar(0.5);
            scene.add(objMesh);

            anchoredObjects.push({
                sceneObj: objMesh,
                anchor: anchor as XRAnchor
            });
        }
    }

    function xrOnFrame(timestamp: DOMHighResTimeStamp, frame: XRFrame){
        let pose = frame.getViewerPose(unboundedRefSpace);
        let detectedPlanes = frame.detectedPlanes;
        if(pose){
            hitTestManager.processHitResult(frame, anchoredObjects);
            depthManager.processDepth(pose, frame, renderer);
            processLight(frame);
            processPlanes(detectedPlanes, frame);
        }
        renderer.render(scene, camera);
    }
}

function processLight(frame: XRFrame){
    if(xrLightProbe){
        const estimate = frame.getLightEstimate(xrLightProbe);
        if(estimate){
            lightProbe.sh.fromArray(estimate.sphericalHarmonicsCoefficients);
            lightProbe.intensity = 1;

            const intensityScalar =
                Math.max(1.0,
                    Math.max(estimate.primaryLightIntensity.x, Math.max(estimate.primaryLightIntensity.y, estimate.primaryLightIntensity.z))
                );
    
            directionalLight.color.setRGB(
                estimate.primaryLightIntensity.x / intensityScalar,
                estimate.primaryLightIntensity.y / intensityScalar,
                estimate.primaryLightIntensity.z / intensityScalar
            );
    
            directionalLight.intensity = intensityScalar;
            directionalLight.position.copy(estimate.primaryLightDirection);

        } else {
            console.log("light estimate not available");
        }
    }
}

function createPlaneGeometry(polygons: DOMPointReadOnly[]){
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

function processPlanes(detectedPlanes: XRPlaneSet | undefined, frame: XRFrame){
    if(detectedPlanes){
        for (const [xrPlane, planeData] of planes) {
            if (!detectedPlanes.has(xrPlane)) {
                scene.remove(planeData.mesh);
                planes.delete(xrPlane);
            }
        }
    
        detectedPlanes.forEach((xrPlane) => {
            const planePose = frame.getPose(xrPlane.planeSpace, unboundedRefSpace);
            if(xrPlane.orientation === 'vertical') return;

            if (!planePose) return;
            const polygon = xrPlane.polygon;
            if (!polygon || polygon.length < 3) return;
    
            let planeData = planes.get(xrPlane);
    
            if(!planeData){
                // Create mesh for new plane            
                const geometry = createPlaneGeometry(polygon);
                const mesh = new THREE.Mesh(geometry, grassMaterial);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.matrixAutoUpdate = false;
                scene.add(mesh);

                planeData = { mesh, timestamp: xrPlane.lastChangedTime };
                planes.set(xrPlane, planeData);
            }
    
            if (xrPlane.lastChangedTime > planeData.timestamp) {
                // Rebuild geometry      
                planeData.mesh.geometry.dispose();
                planeData.mesh.geometry = createPlaneGeometry(polygon);
                planeData.timestamp = xrPlane.lastChangedTime;

                const matrix = new THREE.Matrix4().fromArray(planePose.transform.matrix);
                planeData.mesh.matrix.copy(matrix);
                planeData.mesh.position.y += 0.05;
            }
        });
    }
}
