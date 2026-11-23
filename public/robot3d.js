import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Robô Mediador Type-B 3D — Estilo Estúdio Minimalista Claro (Conceito 2)
 * Mantém todos os 6 Graus de Liberdade (6 DOFs) de Noguchi, Kamide & Tanaka (2023):
 * - Neck Pitch (Nodding a cada pausa na fala)
 * - Neck Roll (Inclinação empática)
 * - Neck Yaw (Giro horizontal)
 * - Left Arm & Right Arm (Servos articulados)
 * - Base Rotation & Weight Shift (Deslocamento de peso para Seriedade - Opção 9)
 */
export class MediatorRobot3DScene {
  constructor(containerEl, onTelemetryUpdate) {
    this.container = containerEl;
    this.onTelemetryUpdate = onTelemetryUpdate || (() => {});

    this.clock = new THREE.Clock();
    this.emotion = 'warm';
    this.gesture = 'idle';
    this.gestureTimer = 0;

    this.isSpeaking = false;
    this.isUserSpeaking = false;

    this.dofs = {
      neckPitch: 0,
      neckRoll: 0,
      neckYaw: 0,
      armL: 0,
      armR: 0,
      baseYaw: 0,
      weightShiftZ: 0,
    };

    this.initScene();
    this.buildStudioEnvironment();
    this.buildTypeBRobot();
    this.setupStudioLights();
    this.setupResize();
    this.animate();
  }

  initScene() {
    const w = this.container.clientWidth || 480;
    const h = this.container.clientHeight || 460;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeae8e3);
    this.scene.fog = new THREE.Fog(0xeae8e3, 2.5, 6.0);

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 30);
    this.camera.position.set(-0.22, 0.42, 1.15);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.24, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.65;
    this.controls.maxDistance = 2.4;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
  }

  setupStudioLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd6d3cd, 1.35);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffcf5, 1.65);
    keyLight.position.set(1.6, 2.8, 2.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 8;
    const d = 1.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf3f0e8, 0.75);
    fillLight.position.set(-1.8, 1.4, 1.2);
    this.scene.add(fillLight);
  }

  buildStudioEnvironment() {
    // Superfície limpa de estúdio (estilo Braun / Muji do Conceito 2)
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xe6e4df,
      roughness: 0.9,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  buildTypeBRobot() {
    this.robotRoot = new THREE.Group();
    this.robotRoot.position.set(0, 0, 0);
    this.scene.add(this.robotRoot);

    // Acabamento cerâmico fosco branco alabastro (fiel ao Conceito 2)
    const ceramicWhiteMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f6f2,
      roughness: 0.35,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
    });

    const visorGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e2022,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });

    // DOF 6: Base & Weight Shift
    this.bodyYawGroup = new THREE.Group();
    this.robotRoot.add(this.bodyYawGroup);

    this.weightShiftGroup = new THREE.Group();
    this.bodyYawGroup.add(this.weightShiftGroup);

    // Pés discretos arredondados sob a base
    const footGeo = new THREE.SphereGeometry(0.028, 16, 16);
    const leftFoot = new THREE.Mesh(footGeo, ceramicWhiteMat);
    leftFoot.scale.set(1.2, 0.55, 1.4);
    leftFoot.position.set(-0.075, 0.012, 0.03);
    leftFoot.castShadow = true;
    this.weightShiftGroup.add(leftFoot);

    const rightFoot = new THREE.Mesh(footGeo, ceramicWhiteMat);
    rightFoot.scale.set(1.2, 0.55, 1.4);
    rightFoot.position.set(0.075, 0.012, 0.03);
    rightFoot.castShadow = true;
    this.weightShiftGroup.add(rightFoot);

    // Anel inferior do corpo
    const baseRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.132, 0.118, 0.035, 36),
      ceramicWhiteMat
    );
    baseRing.position.y = 0.03;
    baseRing.castShadow = true;
    baseRing.receiveShadow = true;
    this.weightShiftGroup.add(baseRing);

    // Torso arredondado minimalista (Type-B / Conceito 2)
    const torsoMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.132, 0.11, 24, 36),
      ceramicWhiteMat
    );
    torsoMesh.position.y = 0.155;
    torsoMesh.scale.set(1.04, 1.0, 0.94);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.weightShiftGroup.add(torsoMesh);

    // DOF 4 & 5: Braços Esquerdo e Direito
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.145, 0.20, 0);
    this.weightShiftGroup.add(this.leftArmPivot);

    const armGeo = new THREE.CapsuleGeometry(0.033, 0.105, 16, 24);
    const leftArmMesh = new THREE.Mesh(armGeo, ceramicWhiteMat);
    leftArmMesh.position.set(-0.012, -0.055, 0);
    leftArmMesh.rotation.z = 0.12;
    leftArmMesh.castShadow = true;
    this.leftArmPivot.add(leftArmMesh);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.145, 0.20, 0);
    this.weightShiftGroup.add(this.rightArmPivot);

    const rightArmMesh = new THREE.Mesh(armGeo, ceramicWhiteMat);
    rightArmMesh.position.set(0.012, -0.055, 0);
    rightArmMesh.rotation.z = -0.12;
    rightArmMesh.castShadow = true;
    this.rightArmPivot.add(rightArmMesh);

    // Pescoço 3 DOFs (Neck Yaw -> Neck Roll -> Neck Pitch)
    this.neckYawGroup = new THREE.Group();
    this.neckYawGroup.position.set(0, 0.275, 0);
    this.weightShiftGroup.add(this.neckYawGroup);

    this.neckRollGroup = new THREE.Group();
    this.neckYawGroup.add(this.neckRollGroup);

    this.neckPitchGroup = new THREE.Group();
    this.neckRollGroup.add(this.neckPitchGroup);

    // Cabeça arredondada em cerâmica branca fosca (como o Type-B original da Fig. 6 do artigo)
    const headMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.138, 44, 44),
      ceramicWhiteMat
    );
    headMesh.position.y = 0.115;
    headMesh.scale.set(1.12, 0.94, 0.98);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    this.neckPitchGroup.add(headMesh);

    // Olhos amigáveis direto no rosto branco (estilo Type-B Fig. 6: círculos escuros suaves com brilho interno)
    const eyeDarkMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      roughness: 0.25,
      metalness: 0.05,
    });

    this.faceFeatureMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });

    // Olho esquerdo
    this.leftEyeGroup = new THREE.Group();
    this.leftEyeGroup.position.set(-0.048, 0.122, 0.128);
    this.leftEyeGroup.rotation.y = -0.18;
    this.neckPitchGroup.add(this.leftEyeGroup);

    const leftEyeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.012, 32),
      eyeDarkMat
    );
    leftEyeBase.rotation.x = Math.PI / 2;
    this.leftEyeGroup.add(leftEyeBase);

    const leftHighlight = new THREE.Mesh(
      new THREE.CircleGeometry(0.0065, 20),
      this.faceFeatureMat
    );
    leftHighlight.position.set(-0.005, 0.006, 0.007);
    this.leftEyeGroup.add(leftHighlight);

    // Olho direito
    this.rightEyeGroup = new THREE.Group();
    this.rightEyeGroup.position.set(0.048, 0.122, 0.128);
    this.rightEyeGroup.rotation.y = 0.18;
    this.neckPitchGroup.add(this.rightEyeGroup);

    const rightEyeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.012, 32),
      eyeDarkMat
    );
    rightEyeBase.rotation.x = Math.PI / 2;
    this.rightEyeGroup.add(rightEyeBase);

    const rightHighlight = new THREE.Mesh(
      new THREE.CircleGeometry(0.0065, 20),
      this.faceFeatureMat
    );
    rightHighlight.position.set(-0.005, 0.006, 0.007);
    this.rightEyeGroup.add(rightHighlight);

    // Bochechas rosadas bem sutis e acolhedoras
    const cheekMat = new THREE.MeshStandardMaterial({
      color: 0xeca89b,
      roughness: 0.6,
      transparent: true,
      opacity: 0.55,
    });
    const cheekGeo = new THREE.CircleGeometry(0.014, 24);
    const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
    leftCheek.position.set(-0.072, 0.095, 0.122);
    leftCheek.rotation.y = -0.32;
    this.neckPitchGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
    rightCheek.position.set(0.072, 0.095, 0.122);
    rightCheek.rotation.y = 0.32;
    this.neckPitchGroup.add(rightCheek);

    // Sorriso delicado minimalista
    const smileGeo = new THREE.TorusGeometry(0.013, 0.003, 12, 24, Math.PI);
    this.mouthMesh = new THREE.Mesh(smileGeo, eyeDarkMat);
    this.mouthMesh.rotation.z = Math.PI;
    this.mouthMesh.position.set(0, 0.098, 0.134);
    this.neckPitchGroup.add(this.mouthMesh);
  }

  updateTabletContent() {
    // No Conceito 2 o foco é 100% no estúdio minimalista sem objetos extras poluindo a cena
  }

  setEmotionAndGesture(emotion = 'warm', gesture = 'idle') {
    this.emotion = emotion;
    this.gesture = gesture;
    this.gestureTimer = gesture === 'idle' ? 0 : 1.8;

    const palette = {
      warm: 0xffffff,
      listening: 0xffffff,
      empathetic: 0xffffff,
      serious: 0xffffff,
      anxious_care: 0xffffff,
      optimistic: 0xffffff,
    };

    const hex = palette[emotion] || palette.warm;
    this.faceFeatureMat.color.setHex(hex);
    this.faceFeatureMat.emissive.setHex(hex);
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = isSpeaking;
    if (!isSpeaking) {
      // Quando a fala termina, zera imediatamente qualquer gesto residual para o robô parar de se mexer
      this.gesture = 'idle';
      this.gestureTimer = 0;
    }
  }

  setUserListeningState(isListening) {
    this.isUserSpeaking = isListening;
    if (isListening) {
      this.setEmotionAndGesture('listening', 'nod_gentle');
    } else {
      this.setEmotionAndGesture('warm', 'idle');
      this.gestureTimer = 0;
    }
  }

  triggerPauseNod() {
    this.gesture = 'nod_gentle';
    this.gestureTimer = 1.2;
  }

  setCameraPreset() {
    this.camera.position.set(-0.22, 0.42, 1.15);
    this.controls.target.set(0, 0.24, 0);
    this.controls.update();
  }

  setupResize() {
    window.addEventListener('resize', () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();
    const t = this.clock.getElapsedTime();

    if (this.gestureTimer > 0) {
      this.gestureTimer = Math.max(0, this.gestureTimer - dt);
      if (this.gestureTimer === 0 && !this.isUserSpeaking) {
        this.gesture = 'idle';
      }
    }

    // Estado idle super calmo (apenas respiração quase imperceptível, sem balançar quando calado)
    let targetNeckPitch = Math.sin(t * 1.1) * 0.008;
    let targetNeckRoll = 0;
    let targetNeckYaw = 0;
    let targetArmL = 0;
    let targetArmR = 0;
    let targetBaseYaw = 0.14;
    let targetWeightShiftZ = 0;

    if (this.gesture === 'nod_gentle' || this.isUserSpeaking) {
      targetNeckPitch = Math.sin(t * 6.2) * 0.15 + 0.05;
      targetArmL = -0.14 + Math.sin(t * 3.0) * 0.05;
      targetArmR = -0.14 - Math.sin(t * 3.0) * 0.05;
    } else if (this.gesture === 'tilt_curious') {
      targetNeckRoll = 0.22;
      targetNeckPitch = 0.06;
      targetArmL = -0.32;
      targetArmR = -0.16;
    } else if (this.gesture === 'lean_serious') {
      targetWeightShiftZ = 0.032;
      targetNeckPitch = 0.13;
      targetNeckRoll = 0;
      targetArmL = -0.08;
      targetArmR = -0.08;
    } else if (this.gesture === 'open_arms') {
      targetArmL = -0.68 + Math.sin(t * 4.5) * 0.07;
      targetArmR = -0.68 - Math.sin(t * 4.5) * 0.07;
      targetNeckRoll = Math.sin(t * 3.2) * 0.1;
      targetNeckPitch = 0.08;
    } else if (this.gesture === 'wave_farewell') {
      targetArmR = -1.75 + Math.sin(t * 8.5) * 0.22;
      targetArmL = -0.2;
      targetNeckRoll = -0.1;
      targetNeckPitch = Math.sin(t * 4) * 0.07;
    } else if (this.gesture === 'bow_respect') {
      targetNeckPitch = 0.24;
      targetWeightShiftZ = 0.022;
      targetArmL = -0.18;
      targetArmR = -0.18;
    }

    if (this.isSpeaking) {
      targetNeckPitch += Math.sin(t * 10) * 0.055;
      targetNeckYaw += Math.cos(t * 4.2) * 0.065;
      targetArmL -= 0.22 + Math.sin(t * 6.5) * 0.12;
      targetArmR -= 0.22 + Math.cos(t * 6.5) * 0.12;

      const mouthPulse = 0.85 + Math.abs(Math.sin(t * 16)) * 0.65;
      this.mouthMesh.scale.set(1, mouthPulse, 1);
    } else {
      this.mouthMesh.scale.set(1, 1, 1);
    }

    const blinkCycle = t % 4.2;
    const eyeScaleY = blinkCycle > 4.06 ? 0.15 : 1.0;
    this.leftEyeGroup.scale.y = eyeScaleY;
    this.rightEyeGroup.scale.y = eyeScaleY;

    const lerpSpeed = Math.min(1, dt * 8.0);
    this.dofs.neckPitch = THREE.MathUtils.lerp(this.dofs.neckPitch, targetNeckPitch, lerpSpeed);
    this.dofs.neckRoll = THREE.MathUtils.lerp(this.dofs.neckRoll, targetNeckRoll, lerpSpeed);
    this.dofs.neckYaw = THREE.MathUtils.lerp(this.dofs.neckYaw, targetNeckYaw, lerpSpeed);
    this.dofs.armL = THREE.MathUtils.lerp(this.dofs.armL, targetArmL, lerpSpeed);
    this.dofs.armR = THREE.MathUtils.lerp(this.dofs.armR, targetArmR, lerpSpeed);
    this.dofs.baseYaw = THREE.MathUtils.lerp(this.dofs.baseYaw, targetBaseYaw, lerpSpeed);
    this.dofs.weightShiftZ = THREE.MathUtils.lerp(this.dofs.weightShiftZ, targetWeightShiftZ, lerpSpeed);

    this.neckPitchGroup.rotation.x = this.dofs.neckPitch;
    this.neckRollGroup.rotation.z = this.dofs.neckRoll;
    this.neckYawGroup.rotation.y = this.dofs.neckYaw;
    this.leftArmPivot.rotation.x = this.dofs.armL;
    this.rightArmPivot.rotation.x = this.dofs.armR;
    this.bodyYawGroup.rotation.y = this.dofs.baseYaw;
    this.weightShiftGroup.position.z = this.dofs.weightShiftZ;
    this.weightShiftGroup.rotation.x = this.dofs.weightShiftZ * 3.0;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
