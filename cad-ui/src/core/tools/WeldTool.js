import * as THREE from 'three'
import { AddObjectCommand } from '../HistoryManager.js'
export class WeldTool {
  constructor(scene, camera, canvas, uiState, onUpdate) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.uiState = uiState;
    this.onUpdate = onUpdate;
    this.isActive = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 5; 
    this.mouse = new THREE.Vector2();

    this.hoveredMesh = null;
    this.hoveredEdge = null;
    this.lockedMesh = null;   
    this.lockedEdge = null;   
    
    this.highlightLine = null;
    this.selectedEdgeLine = null;
    this.previewMesh = null; 

    this.currentParams = { height: 50, thickness: 1.5, overlap: 'outer', width: 0, angle: 90 };
  }

  activate() { this.isActive = true; }
  deactivate() { 
    this.isActive = false; 
    this.clearHighlights();
    this.removePreview();
  }

  onMouseMove(event) {
    if (!this.isActive) return;

    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    const target = intersects.find(h => 
      h.object.type === 'Mesh' && 
      h.object.userData.isPart === true && 
      !h.object.userData.isPreview
    );

    if (target) {
      this.hoveredMesh = target.object;
      this.findNearestEdge(target);
    } else {
      if (!this.lockedEdge) this.clearHover(); 
    }
  }

  findNearestEdge(intersect) {
    const mesh = intersect.object;
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;

    const edges = [
      { p1: [min.x, min.y, min.z], p2: [max.x, min.y, min.z], axis: 'x' },
      { p1: [min.x, max.y, min.z], p2: [max.x, max.y, min.z], axis: 'x' },
      { p1: [min.x, min.y, max.z], p2: [max.x, min.y, max.z], axis: 'x' },
      { p1: [min.x, max.y, max.z], p2: [max.x, max.y, max.z], axis: 'x' },

      { p1: [min.x, min.y, min.z], p2: [min.x, max.y, min.z], axis: 'y' },
      { p1: [max.x, min.y, min.z], p2: [max.x, max.y, min.z], axis: 'y' },
      { p1: [min.x, min.y, max.z], p2: [min.x, max.y, max.z], axis: 'y' },
      { p1: [max.x, min.y, max.z], p2: [max.x, max.y, max.z], axis: 'y' },

      { p1: [min.x, min.y, min.z], p2: [min.x, min.y, max.z], axis: 'z' },
      { p1: [max.x, min.y, min.z], p2: [max.x, min.y, max.z], axis: 'z' },
      { p1: [min.x, max.y, min.z], p2: [min.x, max.y, max.z], axis: 'z' },
      { p1: [max.x, max.y, min.z], p2: [max.x, max.y, max.z], axis: 'z' }
    ];

    const { width: w, height: h, depth: d } = mesh.geometry.parameters;
    let tAxis = 'z';
    if (w <= h && w <= d) tAxis = 'x';
    else if (h <= w && h <= d) tAxis = 'y';

    const validEdges = edges.filter(e => e.axis !== tAxis);

    let minForce = Infinity, bestEdge = null;
    const localRay = new THREE.Ray().copy(this.raycaster.ray).applyMatrix4(mesh.matrixWorld.clone().invert());
    
    validEdges.forEach(edge => {
      const dist = localRay.distanceSqToSegment(new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2), null, null);
      if (dist < minForce) { minForce = dist; bestEdge = edge; }
    });

    if (bestEdge && minForce < 120) { 
      this.showHoverEdge(mesh, bestEdge);
      this.hoveredEdge = bestEdge;
    } else {
      this.clearHover();
    }
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0 || !this.hoveredEdge || !this.hoveredMesh) return;
    
    this.deselectEdge();
    this.lockedMesh = this.hoveredMesh;
    this.lockedEdge = this.hoveredEdge;
    this.drawSelectedEdgeVisual(this.lockedMesh, this.lockedEdge);
    
    if (this.onUpdate) {
      const edgeLen = new THREE.Vector3(...this.lockedEdge.p1).distanceTo(new THREE.Vector3(...this.lockedEdge.p2));
      this.onUpdate({ step: 'params', edgeLength: edgeLen });
    }
    this.updatePreview(this.uiState.weldParams);
  }

  updatePreview(params) {
    if (params) this.currentParams = { ...this.currentParams, ...params };
    if (!this.lockedMesh || !this.lockedEdge) return;
    this.removePreview();

    const mesh = this.lockedMesh;
    const edge = this.lockedEdge;

    const H = Number(this.currentParams.height) || 50;
    const W = Number(this.currentParams.width) || new THREE.Vector3(...edge.p1).distanceTo(new THREE.Vector3(...edge.p2));
    const T = Number(this.currentParams.thickness) || 1.5;
    const overlap = this.currentParams.overlap;
    const angleRad = Number(this.currentParams.angle) * (Math.PI / 180);

    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    const { width: wp, height: hp, depth: dp } = mesh.geometry.parameters;

    // 获取母板厚度 (parentT)
    let tAxis = 'z';
    if (wp <= hp && wp <= dp) tAxis = 'x';
    else if (hp <= wp && hp <= dp) tAxis = 'y';
    const parentT = mesh.geometry.parameters[tAxis === 'x' ? 'width' : tAxis === 'y' ? 'height' : 'depth'];

    const axes = ['x', 'y', 'z'];
    const eAxis = edge.axis;
    const extAxis = axes.find(a => a !== eAxis && a !== tAxis);

    const centerExt = (min[extAxis] + max[extAxis]) / 2;
    const centerT = (min[tAxis] + max[tAxis]) / 2;

    const localMidPoint = new THREE.Vector3(
        (edge.p1[0] + edge.p2[0]) / 2,
        (edge.p1[1] + edge.p2[1]) / 2,
        (edge.p1[2] + edge.p2[2]) / 2
    );

    let signExt = Math.sign(localMidPoint[extAxis] - centerExt) || 1;
    let signT = Math.sign(localMidPoint[tAxis] - centerT) || 1;

    const v_out = new THREE.Vector3(); v_out[extAxis] = signExt;
    const n = new THREE.Vector3(); n[tAxis] = signT;

    const g = new THREE.Vector3().addVectors(
        v_out.clone().multiplyScalar(Math.cos(angleRad)),
        n.clone().multiplyScalar(Math.sin(angleRad))
    ).normalize();

    const t_vec = new THREE.Vector3().addVectors(
        n.clone().multiplyScalar(Math.cos(angleRad)),
        v_out.clone().multiplyScalar(-Math.sin(angleRad))
    ).normalize();

    const w_vec = new THREE.Vector3().crossVectors(t_vec, g).normalize();
    const localRotMatrix = new THREE.Matrix4().makeBasis(g, w_vec, t_vec);

    let posLocal = localMidPoint.clone();
    posLocal.add(g.clone().multiplyScalar(H / 2));

    const shiftOuter = new THREE.Vector3().addVectors(
        n.clone().multiplyScalar(Math.cos(angleRad)),
        v_out.clone().multiplyScalar(Math.sin(angleRad))
    ).multiplyScalar(T / 2);

    // --- 终极搭接逻辑 ---
    if (overlap === 'inner') {
        // 包内皮 (1包2)：往里缩
        posLocal.sub(shiftOuter); 
    } else if (overlap === 'flush') {
        // 平齐对拼：仅仅往外推，形成角对角的完美对接
        posLocal.add(shiftOuter); 
    } else if (overlap === 'outer') {
        // 包外皮 (2包1)：往外推，且沿生长轴反向退回 parentT，完美包裹母板
        posLocal.add(shiftOuter);
        posLocal.sub(g.clone().multiplyScalar(parentT));
    }

    const geo = new THREE.BoxGeometry(H, W, T);
    const mat = new THREE.MeshStandardMaterial({ color: '#f59e0b', transparent: true, opacity: 0.8 });
    this.previewMesh = new THREE.Mesh(geo, mat);

    this.previewMesh.quaternion.setFromRotationMatrix(localRotMatrix);
    this.previewMesh.position.copy(posLocal);

    this.previewMesh.updateMatrix();
    this.previewMesh.applyMatrix4(mesh.matrixWorld);

    this.scene.add(this.previewMesh);
  }

  executeWeld() {
    if (!this.previewMesh) return;
    const finalMesh = this.previewMesh.clone();
    finalMesh.material = new THREE.MeshStandardMaterial({ color: '#8892b0', metalness: 0.6, roughness: 0.4 });
    
    // 【核心修复】：补回这行丢失的类型标识，后续功能都会依赖它！
    finalMesh.userData.isPart = true;
    finalMesh.userData.type = 'weld_plate'; 
    
    if (this.history) {
      this.history.execute(new AddObjectCommand(finalMesh, this.scene, '生成焊板'));
    } else {
      this.scene.add(finalMesh);
    }

    this.clearAll();
    if (this.onUpdate) this.onUpdate({ step: 'select', edgeLength: 0 });
  }

  showHoverEdge(mesh, edge) {
    this.clearHoverVisuals();
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2)]);
    this.highlightLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffcc00' }));
    this.highlightLine.matrixAutoUpdate = false;
    this.highlightLine.matrix.copy(mesh.matrixWorld);
    this.scene.add(this.highlightLine);
  }

  drawSelectedEdgeVisual(mesh, edge) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2)]);
    this.selectedEdgeLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ff0000', linewidth: 3 }));
    this.selectedEdgeLine.matrixAutoUpdate = false;
    this.selectedEdgeLine.matrix.copy(mesh.matrixWorld);
    this.scene.add(this.selectedEdgeLine);
  }

  updateMouse(e) { 
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; 
  }

  clearHoverVisuals() { if (this.highlightLine) { this.scene.remove(this.highlightLine); this.highlightLine = null; } }
  clearHover() { this.clearHoverVisuals(); this.hoveredEdge = null; this.hoveredMesh = null; }
  deselectEdge() { if (this.selectedEdgeLine) { this.scene.remove(this.selectedEdgeLine); this.selectedEdgeLine = null; } this.lockedMesh = null; this.lockedEdge = null; }
  removePreview() { if (this.previewMesh) { this.scene.remove(this.previewMesh); this.previewMesh = null; } }
  clearHighlights() { this.clearHover(); this.deselectEdge(); }
  clearAll() { this.clearHighlights(); this.removePreview(); if (this.onUpdate) this.onUpdate({ step: 'select', edgeLength: 0 }); }
}