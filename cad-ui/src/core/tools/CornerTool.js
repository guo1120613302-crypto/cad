import * as THREE from 'three'
import { ModifyGeometryCommand } from '../HistoryManager.js'

export class CornerTool {
  constructor(scene, camera, canvas, entityManager, onUpdate) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.entityManager = entityManager;
    this.onUpdate = onUpdate;
    this.history = null;

    this.isActive = false;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.targets = [];
    this.targetOutlines = new Map();
    this.hoverLine = null;

    this.previewGroup = new THREE.Group();
    this.scene.add(this.previewGroup);
    
    this.previewMat = new THREE.MeshPhongMaterial({
      color: '#3b82f6', transparent: true, opacity: 0.6, depthWrite: false, 
      emissive: '#3b82f6', emissiveIntensity: 0.3, side: THREE.DoubleSide
    });
  }

  activate() { this.isActive = true; this.clearAll(); this.notify(); }
  deactivate() { this.isActive = false; this.clearAll(); }

  onMouseMove(event) {
    if (!this.isActive) return;
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObjects(this.scene.children, true)
      .find(h => h.object.userData.isPart && !h.object.userData.isPreview && h.object.visible && (!h.object.parent || h.object.parent.visible !== false));
    if (hit && !this.targets.includes(hit.object)) this.showHover(hit.object);
    else this.clearHover();
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0) return;
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObjects(this.scene.children, true)
      .find(h => h.object.userData.isPart && !h.object.userData.isPreview && h.object.visible && (!h.object.parent || h.object.parent.visible !== false));
    if (hit) this.toggleTarget(hit.object);
    else this.clearAll();
  }

  toggleTarget(mesh) {
    const idx = this.targets.indexOf(mesh);
    if (idx > -1) {
      this.targets.splice(idx, 1);
      const outline = this.targetOutlines.get(mesh.uuid);
      if (outline) { this.scene.remove(outline); this.targetOutlines.delete(mesh.uuid); }
    } else {
      if (this.targets.length >= 2) return;
      this.targets.push(mesh);
      const edges = new THREE.EdgesGeometry(mesh.geometry);
      const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#f43f5e', linewidth: 2, depthTest: false }));
      outline.matrixAutoUpdate = false; outline.matrix.copy(mesh.matrixWorld);
      this.scene.add(outline);
      this.targetOutlines.set(mesh.uuid, outline);
    }
    this.notify();
    
    if (this.targets.length === 2) this.updatePreview(0.1);
    else this.clearPreviewGhost();
  }

  updatePreview(gap = 0.1) {
    if (this.targets.length !== 2) return;
    this.clearPreviewGhost();
    const [meshA, meshB] = this.targets;

    if (meshA.geometry.type !== 'BoxGeometry' || meshB.geometry.type !== 'BoxGeometry') {
      alert("拼角工具目前仅支持标准盒体板材！");
      return;
    }

    meshA.geometry.computeBoundingBox();
    meshB.geometry.computeBoundingBox();
    const boxA = meshA.geometry.boundingBox;
    const boxB = meshB.geometry.boundingBox;
    
    const centerA = boxA.getCenter(new THREE.Vector3()).applyMatrix4(meshA.matrixWorld);
    const centerB = boxB.getCenter(new THREE.Vector3()).applyMatrix4(meshB.matrixWorld);

    const getInfo = (mesh, box, targetWorldCenter) => {
      const size = box.getSize(new THREE.Vector3());
      let maxLen = size.x, localAxis = 'x', localTrack = new THREE.Vector3(1,0,0);
      if (size.y > maxLen) { maxLen = size.y; localAxis = 'y'; localTrack.set(0,1,0); }
      if (size.z > maxLen) { maxLen = size.z; localAxis = 'z'; localTrack.set(0,0,1); }

      const worldTrack = localTrack.clone().transformDirection(mesh.matrixWorld).normalize();
      const vecToTarget = targetWorldCenter.clone().sub(centerA === targetWorldCenter ? centerB : centerA);
      const signWorld = Math.sign(worldTrack.dot(vecToTarget)) || 1;
      const growDirWorld = worldTrack.clone().multiplyScalar(signWorld);
      
      const localGrowDir = localTrack.clone().multiplyScalar(signWorld);
      const signLocal = Math.sign(localGrowDir[localAxis]);
      const targetCoord = signLocal > 0 ? box.max[localAxis] : box.min[localAxis];

      return { localAxis, growDirWorld, targetCoord };
    };

    const infoA = getInfo(meshA, boxA, centerB);
    const infoB = getInfo(meshB, boxB, centerA);

    const getLineIntersection = (p1, d1, p2, d2) => {
      const cross = new THREE.Vector3().crossVectors(d1, d2);
      if (cross.lengthSq() < 0.001) return p1.clone().add(p2).multiplyScalar(0.5); 
      const n1 = new THREE.Vector3().crossVectors(d1, cross);
      const n2 = new THREE.Vector3().crossVectors(d2, cross);
      const c1 = p1.clone().add( d1.clone().multiplyScalar( p2.clone().sub(p1).dot(n2) / d1.dot(n2) ) );
      const c2 = p2.clone().add( d2.clone().multiplyScalar( p1.clone().sub(p2).dot(n1) / d2.dot(n1) ) );
      return c1.add(c2).multiplyScalar(0.5);
    };

    const cornerCenter = getLineIntersection(centerA, infoA.growDirWorld, centerB, infoB.growDirWorld);

    // 【核心修复！！！】：将 infoB 之前的 .add() 改为了 .sub()
    // 只有两个生长方向的“差”向量，才能构成真正的 45° 角平分面法线
    let planeNormal = infoA.growDirWorld.clone().sub(infoB.growDirWorld).normalize();
    if (planeNormal.lengthSq() < 0.01) planeNormal = infoA.growDirWorld.clone();
    
    const bisectPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, cornerCenter);

    const createGhost = (mesh, info, gapValue) => {
      const ghost = mesh.clone(); 
      ghost.geometry = mesh.geometry.clone(); 
      ghost.material = this.previewMat;
      ghost.userData = { isPreview: true };

      const plane = bisectPlane.clone();
      plane.translate(info.growDirWorld.clone().multiplyScalar(-gapValue / 2));

      const pos = ghost.geometry.attributes.position;
      const N = plane.normal;
      const P_plane = new THREE.Vector3();
      plane.coplanarPoint(P_plane);
      const W_dir = info.growDirWorld;
      const denom = N.dot(W_dir);

      if (Math.abs(denom) > 0.0001) {
        for(let i=0; i<pos.count; i++) {
          const vLocal = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
          if (Math.abs(vLocal[info.localAxis] - info.targetCoord) <= 0.5) {
            const vWorld = vLocal.clone().applyMatrix4(mesh.matrixWorld);
            const t = N.dot(P_plane.clone().sub(vWorld)) / denom;
            vWorld.add(W_dir.clone().multiplyScalar(t)); 
            
            const vNewLocal = mesh.worldToLocal(vWorld);
            pos.setXYZ(i, vNewLocal.x, vNewLocal.y, vNewLocal.z);
          }
        }
      }
      pos.needsUpdate = true; 
      ghost.geometry.computeVertexNormals();
      return ghost;
    };

    const ghostA = createGhost(meshA, infoA, gap);
    const ghostB = createGhost(meshB, infoB, gap);
    
    if (ghostA && ghostB) {
      this.previewGroup.add(ghostA);
      this.previewGroup.add(ghostB);
    }
  }

  clearPreviewGhost() {
    while(this.previewGroup.children.length > 0) {
      const ghost = this.previewGroup.children[0];
      this.previewGroup.remove(ghost);
      if (ghost.geometry) ghost.geometry.dispose();
    }
  }

  executeCorner() {
    if (this.targets.length !== 2 || this.previewGroup.children.length !== 2) return;
    const [meshA, meshB] = this.targets;
    const [ghostA, ghostB] = this.previewGroup.children;

    if (this.history) {
      this.history.execute(new ModifyGeometryCommand(
        [meshA, meshB],
        [
          new Float32Array(meshA.geometry.attributes.position.array),
          new Float32Array(meshB.geometry.attributes.position.array)
        ],
        [
          new Float32Array(ghostA.geometry.attributes.position.array),
          new Float32Array(ghostB.geometry.attributes.position.array)
        ],
        '边角处理(生长度拼角)'
      ));
    }
    
    this.clearAll();
  }

  showHover(mesh) {
    this.clearHover();
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    this.hoverLine = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#fb7185', linewidth: 1, depthTest: false }));
    this.hoverLine.matrixAutoUpdate = false; this.hoverLine.matrix.copy(mesh.matrixWorld);
    this.scene.add(this.hoverLine);
  }

  clearHover() {
    if (this.hoverLine) { this.scene.remove(this.hoverLine); this.hoverLine.geometry.dispose(); this.hoverLine.material.dispose(); this.hoverLine = null; }
  }

  clearAll() {
    this.targets = [];
    this.targetOutlines.forEach(outline => { this.scene.remove(outline); outline.geometry.dispose(); });
    this.targetOutlines.clear();
    this.clearHover();
    this.clearPreviewGhost();
    this.notify();
  }

  updateMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  notify() { if (this.onUpdate) this.onUpdate({ count: this.targets.length }); }
}