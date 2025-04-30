import * as THREE from 'three';
import depthShaderVertex from './depthShader.vert.glsl';
import depthShaderFrag from './depthShader.frag.glsl';

// GLOBALS
let viewerRefSpace: XRReferenceSpace;
let unboundedRefSpace: XRReferenceSpace;
let arHitTestSource: XRHitTestSource;
let hitTestResult: XRHitTestResult;
let anchoredObjects: { sceneObj: THREE.Mesh; anchor: XRAnchor; }[] = [];
let renderer: THREE.WebGLRenderer;
let depthMaterial: THREE.ShaderMaterial;


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
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight);

    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(new THREE.Color(1,1,1), 10);
    scene.add(light);

    const domRoot = document.querySelector("#dom-overlay") as HTMLDivElement;
    const arBtn = document.querySelector('#ar-btn') as HTMLButtonElement;

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
                arHitTestSource = await session.requestHitTestSource({
                    space: viewerRefSpace,
                }) as XRHitTestSource;

                session.addEventListener('select', onSelect);
            }
        }
        else{
            console.log("Unable to create the AR session");
        }
    });

    depthMaterial = new THREE.ShaderMaterial({
        vertexShader: depthShaderVertex,
        fragmentShader: depthShaderFrag,
        uniforms: {
            depthTexture: { value: "" },
            depthUVTransform: { value: new THREE.Matrix4() },
            depthScale: { value: 0.0 },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        transparent: true // important if you're discarding fragments
    });

    const whiteMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1)
    });

    const reticleSphere = new THREE.Mesh(new THREE.SphereGeometry(0.025), whiteMaterial);
    reticleSphere.visible = false;
    reticleSphere.position.set(0, 0, -2);
    scene.add(reticleSphere);

    async function onSelect(event: Event){
        if(reticleSphere.visible && hitTestResult.createAnchor){
            const pose = hitTestResult.getPose(unboundedRefSpace);
            const anchor = await hitTestResult.createAnchor(pose?.transform as XRRigidTransform);
            const obj = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const objMesh = new THREE.Mesh(obj, depthMaterial);
            scene.add(objMesh);

            anchoredObjects.push({
                sceneObj: objMesh,
                anchor: anchor as XRAnchor
            });
        }
    }

    function xrOnFrame(timestamp: DOMHighResTimeStamp, frame: XRFrame){
        let pose = frame.getViewerPose(unboundedRefSpace);
        if(pose){
            processHitTest(frame, reticleSphere);

            processDepth(pose, frame);
        }
        
        renderer.render(scene, camera);
    }
}

function processHitTest(frame: XRFrame, reticleSphere: THREE.Mesh) {
    reticleSphere.visible = false;
    const hitResults = frame.getHitTestResults(arHitTestSource);
    if(hitResults.length > 0) {
        reticleSphere.visible = true;
        const hitResultPose = hitResults[0].getPose(unboundedRefSpace);
        hitTestResult = hitResults[0];
        if(hitResultPose){
            reticleSphere.position.set(
                hitResultPose.transform.position.x,
                hitResultPose.transform.position.y,
                hitResultPose.transform.position.z
            );

            reticleSphere.quaternion.set(
                hitResultPose.transform.orientation.x,
                hitResultPose.transform.orientation.y,
                hitResultPose.transform.orientation.z,
                hitResultPose.transform.orientation.w,
            );
        }
    }

    for (const {sceneObj, anchor} of anchoredObjects) {
        if(!frame.trackedAnchors?.has(anchor)){
            continue;
        }
        const anchorPose = frame.getPose(anchor.anchorSpace, unboundedRefSpace);
        if(!anchorPose){
            continue;
        }
        
        sceneObj.position.set(
            anchorPose.transform.position.x,
            anchorPose.transform.position.y,
            anchorPose.transform.position.z
        );

        sceneObj.quaternion.set(
            anchorPose.transform.orientation.x,
            anchorPose.transform.orientation.y,
            anchorPose.transform.orientation.z,
            anchorPose.transform.orientation.w,
        );
    }
}

function processDepth(pose: XRViewerPose, frame: XRFrame){
    pose.views.forEach(view => {
        const glLayer = renderer.xr.getBaseLayer() as XRWebGLLayer;
        const viewport = glLayer.getViewport(view) as XRViewport;
        const depthInfo = frame.getDepthInformation(view);
        if(depthInfo){
            // Convert to RGBA format (more universally supported)
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
            updateMaterial(depthMaterial, depthInfo, depthTexture, viewport);
        }
    });
}

function updateMaterial(material: THREE.ShaderMaterial, depthInfo: XRCPUDepthInformation, depthTexture: THREE.DataTexture, viewport: XRViewport) {
    if (!material.uniforms) return;
    
    material.uniforms.depthTexture.value = depthTexture;
    material.uniforms.depthUVTransform.value = depthInfo.normDepthBufferFromNormView.matrix;
    material.uniforms.depthScale.value = depthInfo.rawValueToMeters;
    material.uniforms.resolution.value = new THREE.Vector2(viewport.width, viewport.height);
}