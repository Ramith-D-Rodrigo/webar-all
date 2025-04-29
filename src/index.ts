import * as THREE from 'three';

async function main(){
    const renderer = new THREE.WebGLRenderer({
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

    let viewerRefSpace: XRReferenceSpace;
    let unboundedRefSpace: XRReferenceSpace;
    let arHitTestSource: XRHitTestSource;
    let hitTestResult: XRHitTestResult;

    const features : XRSessionInit = {
        requiredFeatures: ['unbounded', 'depth-sensing', 'hit-test', 'anchors', 'light-estimation', 'viewer', 'dom-overlay', 'camera-access', 'plane-detection'],
        depthSensing: {
            dataFormatPreference: ['luminance-alpha'],
            usagePreference: ['cpu-optimized']
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

    const whiteMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1)
    });

    const reticleSphere = new THREE.Mesh(new THREE.SphereGeometry(0.025), whiteMaterial);
    reticleSphere.visible = false;
    reticleSphere.position.set(0, 0, -2);
    scene.add(reticleSphere);

    let anchoredObjects: { sceneObj: THREE.Mesh; anchor: XRAnchor; }[] = [];

    async function onSelect(event: Event){
        if(reticleSphere.visible && hitTestResult.createAnchor){
            const pose = hitTestResult.getPose(unboundedRefSpace);
            const anchor = await hitTestResult.createAnchor(pose?.transform as XRRigidTransform);
            const obj = new THREE.BoxGeometry(0.05, 0.05, 0.05);
            const objMesh = new THREE.Mesh(obj, whiteMaterial);
            scene.add(objMesh);

            anchoredObjects.push({
                sceneObj: objMesh,
                anchor: anchor as XRAnchor
            });
        }
    }

    function xrOnFrame(timestamp: DOMHighResTimeStamp, frame: XRFrame){
        reticleSphere.visible = false;
        let pose = frame.getViewerPose(unboundedRefSpace);
        if(pose){
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
                const anchorPose = frame.getPose(anchor.anchorSpace, unboundedRefSpace) as XRPose;
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
        
        renderer.render(scene, camera);
    }
}

main();
