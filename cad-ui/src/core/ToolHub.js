import { SelectTool } from './tools/SelectTool.js'
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