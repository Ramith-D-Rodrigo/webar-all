import * as THREE from 'three';

class HitTestManager {
    private hitMesh: THREE.Mesh;
    private arHitTestSource: XRHitTestSource;
    private refSpace: XRReferenceSpace;
    private latestHitTestResult: XRHitTestResult;

    constructor(scene: THREE.Scene){
        const whiteMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(1, 1, 1)
        });

        this.hitMesh = new THREE.Mesh(new THREE.SphereGeometry(0.025), whiteMaterial);
        this.hitMesh.visible = false;
        this.hitMesh.position.set(0, 0, -2);
        scene.add(this.hitMesh);
    }

    public setSource(arHitTestSource: XRHitTestSource){
        this.arHitTestSource = arHitTestSource;
    }

    public setReferenceSpace(refSpace: XRReferenceSpace){
        this.refSpace = refSpace;
    }

    public getLatestResult(): XRHitTestResult{
        return this.latestHitTestResult;
    }

    public isMeshVisible(): boolean {
        return this.hitMesh.visible;
    }

    public processHitResult(frame: XRFrame, anchoredObjects: { sceneObj: THREE.Mesh; anchor: XRAnchor; }[]) {
        this.hitMesh.visible = false;
        const hitResults = frame.getHitTestResults(this.arHitTestSource);
        if(hitResults.length > 0) {
            this.hitMesh.visible = true;
            this.latestHitTestResult = hitResults[0];
            const hitResultPose = hitResults[0].getPose(this.refSpace);
            if(hitResultPose){
                this.hitMesh.position.set(
                    hitResultPose.transform.position.x,
                    hitResultPose.transform.position.y,
                    hitResultPose.transform.position.z
                );
        
                this.hitMesh.quaternion.set(
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
            const anchorPose = frame.getPose(anchor.anchorSpace, this.refSpace);
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
}

export {HitTestManager};
