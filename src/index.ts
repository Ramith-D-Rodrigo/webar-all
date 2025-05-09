import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader';
import { HitTestManager } from './hittest';
import { DepthManager } from './depth';
import { PlaneManager } from './plane';

// GLOBALS
let viewerRefSpace: XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;

let anchoredObjects: { sceneObj: THREE.Mesh; anchor: XRAnchor; }[] = [];

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;

let textureLoader: THREE.TextureLoader;
let depthMaterial: THREE.MeshStandardMaterial;

let directionalLight: THREE.DirectionalLight;
let lightProbe: THREE.LightProbe;
let xrLightProbe: any;

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

    const hitTestManager = new HitTestManager(scene);
    const depthManager = new DepthManager();
    const planeManager = new PlaneManager(textureLoader);

    depthMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(1, 0, 0),
        transparent: true
    });

    depthManager.addDepthPropertyToMaterial(depthMaterial);
    depthManager.addDepthPropertyToMaterial(planeManager.getMaterial());

    const fbxLoader = new FBXLoader();
    const model = await fbxLoader.loadAsync('../assets/models/character.fbx');
    model.scale.set(0.005, 0.005, 0.005);

    model.traverse((obj) => {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj instanceof THREE.Mesh) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((material) => {
                depthManager.addDepthPropertyToMaterial(material);
            });
        }
    });
    
    let isModelAdded: boolean = false;

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
                planeManager.setReferenceSpace(unboundedRefSpace);

                session.addEventListener('select', onSelect);
            }

            xrLightProbe = await session.requestLightProbe();
        }
        else{
            console.log("Unable to create the AR session");
        }
    });

    async function onSelect(event: XRInputSourceEvent){
        // const hitTestResult = hitTestManager.getLatestResult();
        // if(hitTestManager.isMeshVisible() && hitTestResult.createAnchor){
        //     const pose = hitTestResult.getPose(unboundedRefSpace);
        //     const anchor = await hitTestResult.createAnchor(pose?.transform as XRRigidTransform);
        //     const obj = new THREE.BoxGeometry(1, 1, 1);
        //     const objMesh = new THREE.Mesh(obj, depthMaterial);
        //     objMesh.castShadow = true;
        //     objMesh.receiveShadow = true;
        //     objMesh.scale.setScalar(0.5);
        //     scene.add(objMesh);

        //     anchoredObjects.push({
        //         sceneObj: objMesh,
        //         anchor: anchor as XRAnchor
        //     });
        // }

        if(!isModelAdded){
            const frame = event.frame;
            const pose = frame.getPose(event.inputSource.targetRaySpace, unboundedRefSpace);
            if (!pose) return;

            const rayOrigin = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
            const direction = new THREE.Vector3(0, 0, -1) // Forward in XR space
                .applyQuaternion(new THREE.Quaternion(
                    pose.transform.orientation.x, 
                    pose.transform.orientation.y, 
                    pose.transform.orientation.z, 
                    pose.transform.orientation.w)
                )
                .normalize();

            const raycaster = new THREE.Raycaster(rayOrigin, direction);

            // Calculate intersections
            const intersects = raycaster.intersectObjects(scene.children, true);

            for (let i = 0; i < intersects.length; i++) {
                const obj = intersects[i].object;
                intersects[i].point
                if (obj instanceof THREE.Mesh && obj.userData.isPlane) {
                    model.position.set(
                        intersects[i].point.x,
                        intersects[i].point.y,
                        intersects[i].point.z
                    );
                    scene.add(model);
                    isModelAdded = true;
                    break;
                }
            }
        }
    }

    function xrOnFrame(timestamp: DOMHighResTimeStamp, frame: XRFrame){
        let pose = frame.getViewerPose(unboundedRefSpace);
        let detectedPlanes = frame.detectedPlanes;
        if(pose){
            hitTestManager.processHitResult(frame, anchoredObjects);
            depthManager.processDepth(pose, frame, renderer);
            processLight(frame);
            planeManager.processPlanes(detectedPlanes, frame, scene);
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
