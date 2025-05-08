# WebAR Project

In this project, I try to use all the available features provided by WebXR Device API to create an immersive AR session that utilizes all of them. This project is currently ongoing and I like to keep track of the progress using the following milestones.

## Features

1. `unbounded`
2. `depth-sensing`
3. `camera-access`
4. `plane-detection`
5. `dom-overlay`
6. `anchors`
7. `hit-test`
8. `light-estimation`

## Milestones

- [x] Spawn objects at hit location.
- [x] Place virtual objects using `anchors`.
- [x] Implement occlusion using `depth-sensing`.
- [x] Combine occlusion shader with Three.js's builtin shader materials.
- [x] Implement plane detection and create virtual planes.
- [x] Implement light estimation and lighting to the scene.
- [X] Cast shadows based on the estimated light.
- [ ] Add an interactive UI using `dom-overlay`.
- [ ] Use `camera-access` for something.
- [ ] Replace virtual objects with meaningful 3D models.
- [ ] Add physics.
- [ ] Add session save for later loading (Maybe).

## Requirements

Inorder to run the project, it is essential to enable `WebXR Incubations` in `chrome://flags`. The testing device does not have `mesh-detection` support. Hence, that feature isn't used in this project.
