import * as THREE from 'three'
import { DeleteObjectCommand, AddBendCommand, TransformCommand } from './HistoryManager.js'

export class EntityManager {
  constructor(scene) {
    this.scene = scene;
    this.history = null; 
  }

  updateEntity(target, data) {
    if (!target || !data) return;

    const meshes = Array.isArray(target) ? target : [target];
    const itemsForHistory = [];

    // --- 核心逻辑：计算偏移增量 (Delta) ---
    let dx = 0, dy = 0, dz = 0;
    
    if (meshes.length > 1) {
      // 以第一个物体作为参照基准点
      const ref = meshes[0];
      const newX = parseFloat(data.x);
      const newY = parseFloat(data.y);
      const newZ = parseFloat(data.z);
      
      // 计算用户输入的数值与当前基准点的差值
      if (!isNaN(newX)) dx = newX - ref.position.x;
      if (!isNaN(newY)) dy = newY - ref.position.y;
      if (!isNaN(newZ)) dz = newZ - ref.position.z;
    }

    meshes.forEach(mesh => {
      if (!mesh || !mesh.position || typeof mesh.position.clone !== 'function') return;

      const oldPos = mesh.position.clone();

      if (meshes.length > 1) {
        // 【多选模式】：应用偏移增量，保持相对位置不变（保形状）
        mesh.position.x += dx;
        mesh.position.y += dy;
        mesh.position.z += dz;
      } else {
        // 【单选模式】：直接应用绝对坐标
        const px = parseFloat(data.x);
        const py = parseFloat(data.y);
        const pz = parseFloat(data.z);
        if (!isNaN(px)) mesh.position.x = px;
        if (!isNaN(py)) mesh.position.y = py;
        if (!isNaN(pz)) mesh.position.z = pz;

        // 仅在单选且是基础矩形时允许改尺寸
        if (!mesh.userData.type || mesh.userData.type === 'base_rect') {
          const w = parseFloat(data.width);
          const h = parseFloat(data.height);
          const t = parseFloat(data.thickness);
          if (!isNaN(w) && !isNaN(h) && !isNaN(t) && w > 0 && h > 0 && t > 0) {
            mesh.geometry.dispose();
            mesh.geometry = new THREE.BoxGeometry(w, h, t);
          }
        }
      }

      itemsForHistory.push({ mesh, oldPos, newPos: mesh.position.clone() });
    });

    const moved = itemsForHistory.some(it => !it.oldPos.equals(it.newPos));
    if (this.history && moved) {
      this.history.execute(new TransformCommand(itemsForHistory));
    }
  }

  createBendEntity(previewMesh, parentMesh) {
    if (!previewMesh) return;
    const material = new THREE.MeshStandardMaterial({ color: '#b0b5b9', roughness: 0.4, metalness: 0.6 });
    const newBend = new THREE.Mesh(previewMesh.geometry.clone(), material);
    newBend.position.copy(previewMesh.position);
    newBend.quaternion.copy(previewMesh.quaternion);
    newBend.userData = { type: 'bend_flange', isPart: true };

    if (this.history) {
      this.history.execute(new AddBendCommand(this.scene, newBend, parentMesh));
    } else {
      if (parentMesh && parentMesh.parent && parentMesh.parent.userData.isSheetMetalGroup) {
        parentMesh.parent.add(newBend);
      } else {
        this.scene.add(newBend);
      }
    }
    return newBend;
  }

  deleteEntity(mesh) {
    if (!mesh) return;
    const parent = mesh.parent || this.scene;
    if (this.history) {
      this.history.execute(new DeleteObjectCommand(mesh, parent));
    } else {
      parent.remove(mesh);
    }
  }
}