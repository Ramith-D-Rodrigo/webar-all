import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader';
import { DepthManager } from './depth';

const WAVING = 'Waving';
const IDLE = 'Idle';
const WALK = 'Female Walk';

class ModelManager {
    private model: THREE.Group<THREE.Object3DEventMap>;
    private animations: string[] = [WAVING, IDLE, WALK];
    private animationMixer: THREE.AnimationMixer;
    private animationsMap: Map<string, THREE.AnimationAction>;
    private headBone: THREE.Bone;
    private headBoneQuat: THREE.Quaternion;
    private currentAction: THREE.AnimationAction | null = null;
    private currentState: string = IDLE;


    public async setup(fbxLoader: FBXLoader, depthManager: DepthManager){
        this.model = await fbxLoader.loadAsync('assets/models/character.fbx');
        this.model.scale.set(0.005, 0.005, 0.005);
        this.model.traverse((obj) => {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj instanceof THREE.Mesh) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                materials.forEach((material) => {
                    depthManager.addDepthPropertyToMaterial(material);
                });
            }
        });
    
        this.animationMixer = new THREE.AnimationMixer(this.model);
        this.animationsMap = new Map();
        for(let i = 0; i < this.animations.length; i++) {
            const animationFbx = await fbxLoader.loadAsync(
                `assets/models/animations/${this.animations[i]}.fbx`
            );
    
            const allAnimations = animationFbx.animations;
            allAnimations.forEach((clip) => {
                const action = this.animationMixer?.clipAction(clip);
                if (action) {
                    this.animationsMap.set(this.animations[i], action);
                }
            });
        }
    
        this.animationsMap.get(IDLE)?.play();

        this.headBone = this.model.getObjectByName("mixamorigHead") as THREE.Bone;
        if (!this.headBone) {
            console.warn("Head bone not found");
            return;
        }
        this.headBoneQuat = this.headBone.quaternion;
    }

    public addModelToScene(scene: THREE.Scene, position: THREE.Vector3){
        this.model.position.copy(position);
        scene.add(this.model);
    }   

    public updateModelMixer(delta: number){
        this.animationMixer.update(delta);
    }

    public moveModel(targetDest: THREE.Vector3, delta: number, camera: THREE.Camera): boolean{
        const currentPos = this.model.position.clone();
        const dir = new THREE.Vector3().subVectors(targetDest, currentPos);
        const distance = dir.length();

        const speed = 0.5; // units per second
        const moveDistance = speed * delta;

        if (distance > 0.01) {
            this.headBone.quaternion.copy(this.headBoneQuat);
            // Start walking animation if not already playing
            if (this.currentState === IDLE) {
                this.playAnimation(WALK);
            }
            
            // ROTATE model to face the target
            const targetLook = targetDest.clone();
            targetLook.y = currentPos.y;
            const lookQuat = new THREE.Quaternion();
            this.model.lookAt(targetLook);
            lookQuat.copy(this.model.quaternion); // target rotation
            this.model.quaternion.slerp(lookQuat, 0.1); // 0.1 = rotation smoothness
            // MOVE model toward the target
            dir.normalize();
            this.model.position.addScaledVector(dir, moveDistance);
            return false;
        } else {
            // Reached destination
            if (this.currentState === WALK) {
                this.playAnimation(IDLE);
            }
            
            // Face Camera
            const targetLook = camera.position.clone();
            targetLook.y = currentPos.y;
            const lookQuat = new THREE.Quaternion();
            this.model.lookAt(targetLook);
            lookQuat.copy(this.model.quaternion); // target rotation
            this.model.quaternion.slerp(lookQuat, 0.1); // 0.1 = rotation smoothness
            return true;
        }
    }

    public rotateHead(camera: THREE.Camera){
        // Compute direction from head to camera
        const headWorldPos = new THREE.Vector3();
        this.headBone.getWorldPosition(headWorldPos);
        
        const targetPos = new THREE.Vector3().copy(camera.position);
        
        // Compute look direction in world space
        const lookDir = new THREE.Vector3().subVectors(targetPos, headWorldPos).normalize();
        
        // Create a quaternion for the rotation
        const quat = new THREE.Quaternion();
        quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lookDir);
        
        // Convert quaternion to local space of the head bone's parent
        const parentQuat = new THREE.Quaternion();
        this.headBone.parent?.getWorldQuaternion(parentQuat);
        parentQuat.invert();
        this.headBone.quaternion.copy(quat.premultiply(parentQuat));
    }

    private playAnimation(name: string, fadeDuration: number = 0.3) {
        const newAction = this.animationsMap.get(name);
        if (!newAction || newAction === this.currentAction) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(fadeDuration);
        }

        newAction.reset().fadeIn(fadeDuration).play();
        this.currentAction = newAction;
        this.currentState = name;
    }
};

export {ModelManager};
