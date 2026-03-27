import * as THREE from 'three' // 【新增】：仅保留这一个新增的 THREE 引入
import { SelectTool } from './tools/SelectTool.js' // 确保这个只出现一次！
import { RectTool } from './tools/RectTool.js'
import { BendTool } from './tools/BendTool.js'
import { MirrorTool } from './tools/MirrorTool.js' 
import { EntityManager } from './EntityManager.js'
import { WeldTool } from './tools/WeldTool.js'
import { HistoryManager } from './HistoryManager.js'
export class ToolHub {
  constructor(stage, uiState, onSelect, onEdgeSelected, onMirrorUpdate, onWeldUpdate = () => {}) {
    this.stage = stage;
    this.history = new HistoryManager();
    this.entityManager = new EntityManager(stage.scene); 
    this.entityManager.history = this.history;

    const scene = stage.scene;
    const camera = stage.camera;
    const canvas = stage.renderer.domElement;

    this.tools = {
      select: new SelectTool(scene, camera, canvas, this.entityManager, onSelect),
      rect: new RectTool(scene, camera, canvas, uiState),
      bend: new BendTool(scene, camera, canvas, this.entityManager, onEdgeSelected),
      mirror: new MirrorTool(scene, camera, canvas, this.entityManager, onMirrorUpdate),
      weld: new WeldTool(scene, camera, canvas, uiState, onWeldUpdate)
    };

    Object.values(this.tools).forEach(tool => {
      tool.history = this.history;
    });

    this.history.onAction = () => {
      if (this.tools.select && this.tools.select.deselectAll) {
        this.tools.select.deselectAll();
      }
    };
  }

  undo() { return this.history.undo(); }
  redo() { return this.history.redo(); }

  switchTool(toolId) {
    if (this.activeToolId === toolId) return;
    if (this.tools[this.activeToolId]) this.tools[this.activeToolId].deactivate();
    this.activeToolId = toolId;
    if (this.tools[toolId]) this.tools[toolId].activate();
  }

  dispatch(action, event) {
    if (this.activeToolId && this.tools[this.activeToolId] && typeof this.tools[this.activeToolId][action] === 'function') {
      this.tools[this.activeToolId][action](event);
    }
  }
  selectByUuid(uuid) {
    if (!this.tools.select) return;
    
    // 找到场景中对应的 Mesh
    const target = this.stage.scene.getObjectByProperty('uuid', uuid);
    if (target) {
      this.tools.select.deselectAll();
      this.tools.select.selectMesh(target, false);
    }
  }

  toggleObjectVisible(uuid) {
    const obj = this.stage.scene.getObjectByProperty('uuid', uuid);
    if (obj) obj.visible = !obj.visible;
  }

  toggleObjectLock(uuid) {
    const obj = this.stage.scene.getObjectByProperty('uuid', uuid);
    if (obj) obj.userData.locked = !obj.userData.locked;
  }

  // 获取场景中所有符合条件的零件列表，供 Vue 渲染
  getFeatureList() {
    const list = [];
    // 仅遍历场景的第一层直接子元素
    this.stage.scene.children.forEach(obj => {
      // 1. 如果这是一个钣金组件（自动打组的 Group）
      if (obj.userData && obj.userData.isSheetMetalGroup) {
        const children = [];
        obj.children.forEach(child => {
          if (child.isMesh && (child.userData.type || child.userData.isPart)) {
            children.push({
              uuid: child.uuid,
              name: child.name,
              visible: child.visible,
              userData: { ...child.userData }
            });
          }
        });
        list.push({
          uuid: obj.uuid,
          name: obj.name,
          isGroup: true,       // 标记为组件组
          visible: obj.visible,
          children: children,  // 挂载子特征
          userData: { ...obj.userData }
        });
      } 
      // 2. 如果这是一个独立的单体特征（还没有进行折弯等打组操作）
      else if (obj.isMesh && obj.userData && (obj.userData.type || obj.userData.isPart)) {
        list.push({
          uuid: obj.uuid,
          name: obj.name,
          isGroup: false,
          visible: obj.visible,
          userData: { ...obj.userData }
        });
      }
    });
    return list;
  }
  renameFeature(uuid, newName) {
    const obj = this.stage.scene.getObjectByProperty('uuid', uuid);
    if (obj) obj.name = newName;
  }

  deleteFeature(uuid) {
    const obj = this.stage.scene.getObjectByProperty('uuid', uuid);
    if (obj) {
      // 【优化】：删除前强制清空所有高亮蓝框，防止删除组时产生幽灵轮廓
      if (this.tools.select.deselectAll) this.tools.select.deselectAll();
      this.entityManager.deleteEntity(obj);
    }
  }
  groupFeatures(uuids) {
    const group = new THREE.Group();
    group.userData.isSheetMetalGroup = true;
    group.name = `钣金组件_${THREE.MathUtils.generateUUID().substring(0, 4).toUpperCase()}`;
    
    // 组必须先装载进场景中
    this.stage.scene.add(group);
    
    uuids.forEach(uuid => {
      const obj = this.stage.scene.getObjectByProperty('uuid', uuid);
      if (obj) {
        // attach API 最强大之处在于：保持世界物理坐标不变的同时转移父级
        group.attach(obj);
      }
    });
    
    if (this.tools.select.deselectAll) this.tools.select.deselectAll();
  }
  updateEntity(dataPackage) {
    if (!dataPackage) return;

    if (dataPackage.type === 'bend_preview' && this.activeToolId === 'bend') {
      this.tools.bend.updatePreview(dataPackage);
      return;
    }

    if (dataPackage.type === 'rect_cmd' && this.activeToolId === 'rect') {
      this.tools.rect.setPlane(dataPackage.plane);
      return;
    }
    
    if (dataPackage.type === 'mirror_cmd' && this.activeToolId === 'mirror') {
      if (dataPackage.action === 'setStep') this.tools.mirror.setStep(dataPackage.step);
      if (dataPackage.action === 'execute') this.tools.mirror.executeMirror(dataPackage);
      return;
    }

    if (dataPackage.type === 'weld_cmd' && this.activeToolId === 'weld') {
      if (dataPackage.action === 'preview') this.tools.weld.updatePreview(dataPackage.params);
      if (dataPackage.action === 'execute') this.tools.weld.executeWeld();
      if (dataPackage.action === 'cancel') this.tools.weld.clearAll();
      return;
    }

    if (this.activeToolId === 'select') {
      // 获取当前选中的所有 Mesh 数组
      const selectedObjects = this.tools.select.selectedObjects || [this.tools.select.selectedObject].filter(Boolean);
      const data = dataPackage.data ? dataPackage.data : dataPackage;

      if (selectedObjects.length > 0) {
        // 将整个数组传给管理器处理批量位移
        this.entityManager.updateEntity(selectedObjects, data);
        if (this.tools.select.syncGizmo) this.tools.select.syncGizmo();
      }
    }
  }

  deleteEntity() {
    if (this.activeToolId === 'select') {
      const selectedObjects = this.tools.select.selectedObjects || [this.tools.select.selectedObject].filter(Boolean);
      if (selectedObjects.length > 0) {
        this.tools.select.deselectAll ? this.tools.select.deselectAll() : this.tools.select.deselect();
        selectedObjects.forEach(mesh => {
          this.entityManager.deleteEntity(mesh);
        });
      }
    }
  }

  confirm() {
    if (this.activeToolId && typeof this.tools[this.activeToolId].onEnterPressed === 'function') {
      this.tools[this.activeToolId].onEnterPressed();
    }
  }

  cancel() {
    if (this.activeToolId && typeof this.tools[this.activeToolId].cancel === 'function') {
      this.tools[this.activeToolId].cancel();
    }
  }

  finalizeBend() {
    const bendTool = this.tools.bend;
    if (this.activeToolId === 'bend' && bendTool.previewMesh) {
      this.entityManager.createBendEntity(bendTool.previewMesh, bendTool.lockedMesh);
      if (bendTool.lockedMesh) delete bendTool.lockedMesh.userData.originalPos;
      bendTool.clearHighlights();
      bendTool.removePreview();
    }
  }
}