import * as THREE from 'three'
import { AddObjectCommand, CompoundCommand } from '../HistoryManager.js'

export class MirrorTool {
  // 【修改】：追加 toolHub 和 boxSelectState 参数
  constructor(scene, camera, canvas, entityManager, onUpdate, toolHub, boxSelectState) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.entityManager = entityManager;
    this.onUpdate = onUpdate; 
    
    this.toolHub = toolHub;             // 新增
    this.boxSelectState = boxSelectState; // 新增：保存 Vue 传来的状态引用

    this.isActive = false;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.step = 'targets'; 
    this.targets = [];
    this.referencePlane = null; 

    this.targetOutlines = new Map(); 
    this.refPlaneMesh = null;          
    this.hoverPlaneMesh = null;

    this.isBoxSelecting = false;
    this.boxStart = { x: 0, y: 0 };
    // 【修改】：删除了这里原本的 document.createElement('div') 和 style 设置
  }

  activate() {
    this.isActive = true;
    this.step = 'targets';
    this.notify();
  }

  deactivate() {
    this.isActive = false;
    this.clearAll();
    if (this.isBoxSelecting) {
      this.isBoxSelecting = false;
      this.boxSelectState.visible = false; // 【修改】：使用 Vue 状态隐藏框选
    }
  }

  setStep(step) {
    this.step = step;
    this.clearHover();
    this.notify();
  }

  onMouseMove(event) {
    if (!this.isActive) return;

    if (this.isBoxSelecting) {
      const currentX = event.clientX;
      const currentY = event.clientY;
      const left = Math.min(this.boxStart.x, currentX);
      const top = Math.min(this.boxStart.y, currentY);
      const width = Math.abs(currentX - this.boxStart.x);
      const height = Math.abs(currentY - this.boxStart.y);

      // 【修改】：使用 Vue 状态更新框选尺寸
      this.boxSelectState.left = left;
      this.boxSelectState.top = top;
      this.boxSelectState.width = width;
      this.boxSelectState.height = height;
      return;
    }

    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const hit = this.raycaster.intersectObjects(this.scene.children, true)
      .find(h => h.object.userData.isPart && !h.object.userData.isPreview && 
                 h.object.visible && (!h.object.parent || h.object.parent.visible !== false));

    if (hit) {
      if (this.step === 'targets') {
        if (this.hoveredMesh !== hit.object) {
          this.hoveredMesh = hit.object;
          this.showTargetHover(this.hoveredMesh);
        }
      } else if (this.step === 'reference') {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(worldNormal, hit.point);
        // 渲染精准悬停面
        this.showPlaneHover(plane, hit.object, hit.face.normal);
      }
    } else {
      this.clearHover();
    }
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0) return;
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const hit = this.raycaster.intersectObjects(this.scene.children, true)
      .find(h => h.object.userData.isPart && !h.object.userData.isPreview && 
                 h.object.visible && (!h.object.parent || h.object.parent.visible !== false));

    const isMultiMode = event.ctrlKey || event.metaKey || event.shiftKey;

    if (hit) {
      if (this.step === 'targets') {
        if (isMultiMode) this.toggleTarget(hit.object);
        else { this.clearTargets(); this.toggleTarget(hit.object); }
      } else if (this.step === 'reference') {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(worldNormal, hit.point);
        // 绑定基准面
        this.setReference(plane, hit.object, hit.face.normal);
      }
    } else {
      if (this.step === 'targets') {
        if (!isMultiMode) this.clearTargets();
        
        // 【修改】：激活框选 UI，通过更新 Vue 状态
        this.isBoxSelecting = true;
        this.boxStart = { x: event.clientX, y: event.clientY };
        
        this.boxSelectState.color = '#a855f7'; // 镜像是紫色的框
        this.boxSelectState.bg = 'rgba(168, 85, 247, 0.2)';
        this.boxSelectState.left = this.boxStart.x;
        this.boxSelectState.top = this.boxStart.y;
        this.boxSelectState.width = 0;
        this.boxSelectState.height = 0;
        this.boxSelectState.visible = true;
      } else {
        this.setReference(null);
      }
    }
    this.notify();
  }

  onMouseUp(event) {
    if (!this.isActive || !this.isBoxSelecting) return;
    
    // 【修改】：使用 Vue 状态隐藏框选
    this.isBoxSelecting = false;
    this.boxSelectState.visible = false;

    const currentX = event.clientX;
    const currentY = event.clientY;

    if (Math.abs(currentX - this.boxStart.x) > 5 || Math.abs(currentY - this.boxStart.y) > 5) {
      const minX = Math.min(this.boxStart.x, currentX);
      const maxX = Math.max(this.boxStart.x, currentX);
      const minY = Math.min(this.boxStart.y, currentY);
      const maxY = Math.max(this.boxStart.y, currentY);

      const parts = [];
      this.scene.traverse(child => {
        if (child.type === 'Mesh' && child.userData.isPart && !child.userData.isPreview) {
          // 过滤掉被隐藏的图层
          if (child.visible && (!child.parent || child.parent.visible !== false)) {
            parts.push(child);
          }
        }
      });

      const isMultiMode = event.ctrlKey || event.metaKey || event.shiftKey;
      if (!isMultiMode) this.clearTargets();

      parts.forEach(mesh => {
        if (this.isMeshInScreenRect(mesh, minX, maxX, minY, maxY)) {
          if (!this.targets.includes(mesh)) this.toggleTarget(mesh);
        }
      });
      this.notify();
    }
  }

  isMeshInScreenRect(mesh, minX, maxX, minY, maxY) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const pts = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    const rect = this.canvas.getBoundingClientRect();
    let isInside = false;

    for (let pt of pts) {
      pt.applyMatrix4(mesh.matrixWorld); pt.project(this.camera);
      if (pt.z > 1) continue; 
      const sx = (pt.x + 1) / 2 * rect.width + rect.left;
      const sy = -(pt.y - 1) / 2 * rect.height + rect.top;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) { isInside = true; break; }
    }
    if (!isInside) {
      const center = new THREE.Vector3(); box.getCenter(center);
      center.applyMatrix4(mesh.matrixWorld); center.project(this.camera);
      if (center.z <= 1) {
        const cx = (center.x + 1) / 2 * rect.width + rect.left;
        const cy = -(center.y - 1) / 2 * rect.height + rect.top;
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) isInside = true;
      }
    }
    return isInside;
  }

  toggleTarget(mesh) {
    const idx = this.targets.indexOf(mesh);
    if (idx > -1) {
      this.targets.splice(idx, 1);
      const outline = this.targetOutlines.get(mesh.uuid);
      if (outline) {
        this.scene.remove(outline);
        outline.geometry.dispose(); outline.material.dispose();
        this.targetOutlines.delete(mesh.uuid);
      }
    } else {
      this.targets.push(mesh);
      const edges = new THREE.EdgesGeometry(mesh.geometry);
      const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#a855f7', linewidth: 2, depthTest: false }));
      outline.matrixAutoUpdate = false; outline.matrix.copy(mesh.matrixWorld);
      this.scene.add(outline);
      this.targetOutlines.set(mesh.uuid, outline);
    }
  }

  // 【核心黑科技】：根据物理网格的面，动态生成等比例的遮罩平面
  createExactFaceMesh(mesh, localNormal, colorHex, isHover) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    let pw = 0, ph = 0;
    if (Math.abs(localNormal.x) > 0.5) { pw = size.z; ph = size.y; }
    else if (Math.abs(localNormal.y) > 0.5) { pw = size.x; ph = size.z; }
    else { pw = size.x; ph = size.y; }

    const faceCenter = center.clone().add(new THREE.Vector3(
      localNormal.x * size.x / 2,
      localNormal.y * size.y / 2,
      localNormal.z * size.z / 2
    ));

    // 防止 Z-fighting，稍微往外推一点点
    faceCenter.add(localNormal.clone().multiplyScalar(0.2));

    const geo = new THREE.PlaneGeometry(pw, ph);
    const mat = new THREE.MeshBasicMaterial({ 
      color: colorHex, 
      transparent: true, 
      opacity: isHover ? 0.4 : 0.7, 
      side: THREE.DoubleSide, 
      depthTest: false 
    });
    
    const planeMesh = new THREE.Mesh(geo, mat);
    planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
    planeMesh.position.copy(faceCenter);
    planeMesh.applyMatrix4(mesh.matrixWorld);
    
    return planeMesh;
  }

  setReference(plane, mesh, localNormal) {
    if (this.refPlaneMesh) {
      this.scene.remove(this.refPlaneMesh);
      this.refPlaneMesh.geometry.dispose(); this.refPlaneMesh.material.dispose();
      this.refPlaneMesh = null;
    }
    if (plane && mesh && localNormal) {
      this.referencePlane = plane;
      this.refPlaneMesh = this.createExactFaceMesh(mesh, localNormal, 0x10b981, false);
      this.scene.add(this.refPlaneMesh);
    } else {
      this.referencePlane = null;
    }
  }

  showTargetHover(mesh) {
    this.clearHover();
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    this.hoverLine = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#d8b4fe', linewidth: 1, depthTest: false }));
    this.hoverLine.matrixAutoUpdate = false; this.hoverLine.matrix.copy(mesh.matrixWorld);
    this.scene.add(this.hoverLine);
  }

  showPlaneHover(plane, mesh, localNormal) {
    this.clearHover();
    this.hoverPlaneMesh = this.createExactFaceMesh(mesh, localNormal, 0x6ee7b7, true);
    this.scene.add(this.hoverPlaneMesh);
  }

  clearHover() {
    if (this.hoverLine) {
      this.scene.remove(this.hoverLine);
      this.hoverLine.geometry.dispose(); this.hoverLine.material.dispose();
      this.hoverLine = null;
    }
    if (this.hoverPlaneMesh) {
      this.scene.remove(this.hoverPlaneMesh);
      this.hoverPlaneMesh.geometry.dispose(); this.hoverPlaneMesh.material.dispose();
      this.hoverPlaneMesh = null;
    }
    this.hoveredMesh = null;
  }

  clearTargets() {
    this.targets = [];
    this.targetOutlines.forEach(outline => {
      this.scene.remove(outline);
      outline.geometry.dispose(); outline.material.dispose();
    });
    this.targetOutlines.clear();
  }

  clearAll() {
    this.clearTargets();
    this.setReference(null);
    this.clearHover();
    this.notify();
  }

  updateMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  notify() {
    if (this.onUpdate) {
      this.onUpdate({ step: this.step, count: this.targets.length, hasRef: !!this.referencePlane });
    }
  }

  // 安全提取配置，绝不再发生 NaN
  executeMirror(config) {
    if (this.targets.length === 0 || !this.referencePlane) return;

    const dimMode = config.dimMode || 'outer';
    const offset = Number(config.offset) || 0;
    
    const basePlane = this.referencePlane.clone();
    
    if (offset !== 0) {
      const P0 = new THREE.Vector3();
      basePlane.coplanarPoint(P0);
      P0.add(basePlane.normal.clone().multiplyScalar(offset));
      basePlane.setFromNormalAndCoplanarPoint(basePlane.normal, P0);
    }

    const N = basePlane.normal;
    const commands = []; 

    this.targets.forEach(target => {
      let T = 0;
      if (target.geometry.type === 'BoxGeometry') {
        const { width: w, height: h, depth: d } = target.geometry.parameters;
        T = Math.min(w, h, d);
      }

      const mirroredGeo = target.geometry.clone();
      mirroredGeo.applyMatrix4(target.matrixWorld);

      const pos = mirroredGeo.attributes.position;
      const arr = pos.array;
      const v = new THREE.Vector3();

      for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]);
        const dist = basePlane.distanceToPoint(v);
        v.sub(N.clone().multiplyScalar(2 * dist));
        arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
      }

      if (dimMode === 'inner' && T > 0) {
        mirroredGeo.computeBoundingBox();
        const mCenter = new THREE.Vector3();
        mirroredGeo.boundingBox.getCenter(mCenter);
        const P0 = new THREE.Vector3();
        basePlane.coplanarPoint(P0);
        const dot = mCenter.clone().sub(P0).dot(N);
        const outwardSign = dot >= 0 ? 1 : -1;
        const shiftVec = N.clone().multiplyScalar(outwardSign * T);
        mirroredGeo.translate(shiftVec.x, shiftVec.y, shiftVec.z);
      }

      const indexAttribute = mirroredGeo.getIndex();
      if (indexAttribute) {
        const indices = indexAttribute.array;
        for (let i = 0; i < indices.length; i += 3) {
          const temp = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = temp;
        }
      } else {
        for (let i = 0; i < arr.length; i += 9) {
          for (let j = 0; j < 3; j++) {
            let temp = arr[i + 3 + j]; arr[i + 3 + j] = arr[i + 6 + j]; arr[i + 6 + j] = temp;
          }
        }
      }

      pos.needsUpdate = true;
      mirroredGeo.computeVertexNormals();
      mirroredGeo.computeBoundingBox();
      mirroredGeo.computeBoundingSphere(); 

      const mirroredMesh = new THREE.Mesh(mirroredGeo, target.material.clone());
      mirroredMesh.position.set(0, 0, 0);
      mirroredMesh.rotation.set(0, 0, 0);
      mirroredMesh.scale.set(1, 1, 1);
      mirroredMesh.userData = { ...target.userData }; 
      mirroredMesh.uuid = THREE.MathUtils.generateUUID(); 

      commands.push(new AddObjectCommand(mirroredMesh, this.scene, '生成独立镜像特征'));
    });

    if (this.history && commands.length > 0) {
        this.history.execute(new CompoundCommand(commands, '特征镜像操作'));
    }
  
    this.clearAll();
  }
}