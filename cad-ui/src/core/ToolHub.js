import * as THREE from 'three' // 【新增】：仅保留这一个新增的 THREE 引入
import { SelectTool } from './tools/SelectTool.js' // 确保这个只出现一次！
import { RectTool } from './tools/RectTool.js'
import { BendTool } from './tools/BendTool.js'
import { MirrorTool } from './tools/MirrorTool.js' 
import { EntityManager } from './EntityManager.js'
import { WeldTool } from './tools/WeldTool.js'
import { HistoryManager } from './HistoryManager.js'
import { TemplateManager } from './TemplateManager.js' 
import { CornerTool } from './tools/CornerTool.js'
import { InterferenceChecker } from './InterferenceChecker.js'


export class ToolHub {
  constructor(stage, uiState, onSelect, onEdgeSelected, onMirrorUpdate, onWeldUpdate = () => {}) {
    this.templateManager = new TemplateManager(this.stage, this.entityManager, this);
    
    this.stage = stage;
    this.history = new HistoryManager();
    this.entityManager = new EntityManager(stage.scene); 
    this.entityManager.history = this.history;
    this.templateManager = new TemplateManager(this.stage, this.entityManager);

    const scene = stage.scene;
    const camera = stage.camera;
    const canvas = stage.renderer.domElement;

    this.tools = {
      select: new SelectTool(scene, camera, canvas, this.entityManager, onSelect, this),
     
      rect: new RectTool(scene, camera, canvas, uiState),
      bend: new BendTool(scene, camera, canvas, this.entityManager, onEdgeSelected),
      mirror: new MirrorTool(scene, camera, canvas, this.entityManager, onMirrorUpdate),
      weld: new WeldTool(scene, camera, canvas, uiState, onWeldUpdate),
      corner: new CornerTool(scene, camera, canvas, this.entityManager, onWeldUpdate) // 为了省事，可以借用 weldUpdate 通道传数据
    };

    Object.values(this.tools).forEach(tool => {
      tool.history = this.history;
    });
    
    
    this.autoCheckInterference = false; // 【新增】：默认关闭状态

    this.history.onAction = () => {
      if (this.tools.select && this.tools.select.deselectAll) {
        this.tools.select.deselectAll();
      }
      // 【修改】：只有当按钮状态为“开”时，才在每次操作后执行后台扫描
      if (this.autoCheckInterference) {
        this.checkInterference();
      }
    };
  }
  clearInterference() {
    // 1. 清理深红色的重叠体积高亮块
    if (this.interferenceGroup) {
        this.stage.scene.remove(this.interferenceGroup);
        this.interferenceGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            child.children.forEach(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
        });
        this.interferenceGroup = null;
    }

    // 2. 恢复原始零件的不透明度、颜色和材质
    this.stage.scene.traverse(child => {
      if (child.isMesh && child.material && child.userData.isPart) {
        if (child.userData.origEmissive !== undefined) {
          child.material.emissive.setHex(child.userData.origEmissive);
          child.material.emissiveIntensity = child.userData.origIntensity;
          child.material.transparent = child.userData.origTransparent;
          child.material.opacity = child.userData.origOpacity;
          child.material.color.setHex(child.userData.origColor);
        }
      }
    });
  }

  undo() { return this.history.undo(); }
  redo() { return this.history.redo(); }


  // 【新增】：接收 UI 传来的吸附设置并同步给工具
  updateSnapSettings(settings) {
    if (this.tools.rect) {
      this.tools.rect.snapSettings = { ...settings };
    }
  }

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
  // ---------- 【工业级双色重叠干涉展示】 ----------
  // ---------- 【工业级重叠干涉展示】 ----------
  checkInterference() {
    if (!this.interferenceChecker) {
      this.interferenceChecker = new InterferenceChecker(this.stage.scene);
    }
    
    // 【先清理】：每次检查前，彻底清理上一轮的红光和包裹框
    this.clearInterference();

    const result = this.interferenceChecker.check();

    if (result.hasError) {
      // 1. 【面（大范围）】：变成纯粹的半透明玻璃态
      result.errorMeshes.forEach(mesh => {
        if (mesh.userData.origTransparent === undefined) {
          mesh.userData.origTransparent = mesh.material.transparent;
          mesh.userData.origOpacity = mesh.material.opacity;
        }
        mesh.material.transparent = true;
        mesh.material.opacity = 0.15; // 调到极低的透明度，产生明显的“虚化”对比效果
        mesh.material.needsUpdate = true; // 【核心修复】：必须通知 WebGL 更新材质，透明才能生效！
      });

      // 2. 【重叠区域（小范围）】：生成红块，但遵守物理透视法则
      if (!this.interferenceGroup) {
         this.interferenceGroup = new THREE.Group();
         this.stage.scene.add(this.interferenceGroup);
      }

      result.overlapBoxes.forEach(boxData => {
         const geo = new THREE.BoxGeometry(boxData.size.x, boxData.size.y, boxData.size.z);
         const mat = new THREE.MeshBasicMaterial({
             color: 0xff0000,
             transparent: true,
             opacity: 0.9
             // 【核心修复】：删除了 depthTest: false，恢复正常的 3D 透视，不再遮挡坐标轴！
         });
         const boxMesh = new THREE.Mesh(geo, mat);
         boxMesh.position.copy(boxData.center);

         // 给重叠区域加上白色线框
         const edges = new THREE.EdgesGeometry(geo);
         const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
         boxMesh.add(line);

         this.interferenceGroup.add(boxMesh);
      });

      return { hasError: true, count: result.errorMeshes.length };
    }

    return { hasError: false, count: 0 };
  }

  clearInterference() {
    // 1. 清理深红色的重叠体积高亮块
    if (this.interferenceGroup) {
        this.stage.scene.remove(this.interferenceGroup);
        this.interferenceGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            child.children.forEach(c => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            });
        });
        this.interferenceGroup = null;
    }

    // 2. 纯粹恢复原始零件的不透明度
    this.stage.scene.traverse(child => {
      if (child.isMesh && child.material && child.userData.isPart) {
        if (child.userData.origTransparent !== undefined) {
          child.material.transparent = child.userData.origTransparent;
          child.material.opacity = child.userData.origOpacity;
          child.material.needsUpdate = true; // 【核心修复】：恢复时也必须更新材质
        }
        
        // 防御性清理残留发光颜色
        if (child.userData.origEmissive !== undefined) {
          child.material.emissive.setHex(child.userData.origEmissive);
          child.material.emissiveIntensity = child.userData.origIntensity;
          if (child.userData.origColor) child.material.color.setHex(child.userData.origColor);
        }
      }
    });
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
  ungroupFeatures(uuids) {
    uuids.forEach(uuid => {
      const group = this.stage.scene.getObjectByProperty('uuid', uuid);
      if (group && group.userData.isSheetMetalGroup) {
        // 先把子元素克隆成一个数组，因为 attach 会动态修改 children 长度
        const children = [...group.children];
        children.forEach(child => {
          // attach 会保持物体的 3D 空间坐标绝对不变，同时将它剥离出组
          this.stage.scene.attach(child);
        });
        // 子元素剥离完后，把空文件夹删掉
        this.stage.scene.remove(group);
      }
    });
    // 清空选中状态，防止幽灵蓝框
    if (this.tools.select.deselectAll) this.tools.select.deselectAll();
  }
  updateEntity(dataPackage) {
    if (!dataPackage) return;
    if (dataPackage.type === 'corner_cmd' && this.activeToolId === 'corner') {
      if (dataPackage.action === 'execute') this.tools.corner.executeCorner(dataPackage.gap);
      return;
    }
    if (dataPackage.type === 'bend_preview' && this.activeToolId === 'bend') {
      this.tools.bend.updatePreview(dataPackage);
      return;
    }
    // 【新增】：矩形工具基准面与死锁参数通道
    if (dataPackage.type === 'rect_cmd' && this.activeToolId === 'rect') {
      if (dataPackage.action === 'preview') {
        this.tools.rect.startPreview(dataPackage.width, dataPackage.height);
        return;
      }
      // 切换视图基准面
      if (dataPackage.plane) this.tools.rect.setPlane(dataPackage.plane);
      
      // 删除了所有的 isWidthLocked/isHeightLocked 强行锁定代码
      // 把鼠标的自由划取权还给你！
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
    if (!this.activeToolId) return;
    const tool = this.tools[this.activeToolId];
    // 智能路由取消操作：不同工具的清理函数名可能不同，依次尝试调用
    if (typeof tool.cancel === 'function') tool.cancel();
    else if (typeof tool.clearAll === 'function') tool.clearAll();
    else if (typeof tool.cleanup === 'function') tool.cleanup();
    else if (typeof tool.deselectAll === 'function') tool.deselectAll();
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