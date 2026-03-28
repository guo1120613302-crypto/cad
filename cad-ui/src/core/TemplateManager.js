import * as THREE from 'three';

export class TemplateManager {
  cconstructor(stage, entityManager, toolHub) {
    this.stage = stage;
    this.entityManager = entityManager;
    this.toolHub = toolHub; // 新增
  }

  // 1. 导出当前场景为 JSON 文件
  exportToFile() {
    const featureList = [];

    this.stage.scene.children.forEach(obj => {
      // 识别独立零件和被打组的钣金组件
      const isPart = obj.isMesh && obj.userData && (obj.userData.type || obj.userData.isPart);
      const isGroup = obj.userData && obj.userData.isSheetMetalGroup;

      if (isPart || isGroup) {
        // 【核心黑科技：逼迫 Three.js 保存真实的物理顶点】
        obj.traverse(child => {
          if (child.isMesh && child.geometry) {
            // 如果是标准盒体，先把参数备份到 userData 里
            if (child.geometry.type === 'BoxGeometry') {
              child.userData.isBox = true;
              child.userData.geoParams = Object.assign({}, child.geometry.parameters);
            }
            // 暂时伪装成基础缓冲几何体，强迫引擎把切角、移动的顶点原封不动地序列化！
            child.geometry.type = 'BufferGeometry';
            delete child.geometry.parameters;
          }
        });

        featureList.push(obj.toJSON());

        // 存完之后立刻“恢复原样”，绝不影响你继续在画布里操作
        obj.traverse(child => {
          if (child.isMesh && child.userData.isBox) {
            child.geometry.type = 'BoxGeometry';
            child.geometry.parameters = child.userData.geoParams;
          }
        });
      }
    });

    const templateData = {
      version: "3.0",
      timestamp: Date.now(),
      features: featureList
    };

    this._triggerDownload(templateData);
  }

  // 2. 触发浏览器下载
  _triggerDownload(data) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SheetMetal_Template_${new Date().getTime()}.smcad`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 3. 从文件导入并重建场景
  importFromFile(file, onSuccess, onError) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this._rebuildScene(data);
        if (onSuccess) onSuccess(file.name);
      } catch (err) {
        console.error("解析模板失败:", err);
        if (onError) onError();
      }
    };
    reader.readAsText(file);
  }

  // 4. 重建 3D 场景的内部逻辑
  _rebuildScene(data) {
    if (!data || !data.features) return;

    // A. 暴力清盘：连零件带文件夹（编组）一起删干净
    const objectsToRemove = [];
    this.stage.scene.children.forEach(obj => {
      const isPart = obj.isMesh && obj.userData && (obj.userData.type || obj.userData.isPart);
      const isGroup = obj.userData && obj.userData.isSheetMetalGroup;
      if (isPart || isGroup) {
        objectsToRemove.push(obj);
      }
    });
    objectsToRemove.forEach(obj => this.entityManager.deleteEntity(obj));

    // B. 一比一精准还原
    const loader = new THREE.ObjectLoader();

    data.features.forEach(itemJson => {
      try {
        const newObj = loader.parse(itemJson);

        // 【恢复身份】：把几何体参数还给它们，不然折弯和镜像工具找不到基础尺寸会报废！
        newObj.traverse(child => {
          if (child.isMesh) {
            if (child.geometry) {
              // 重新计算包围盒，防止之后鼠标点不中它们
              child.geometry.computeBoundingBox();
              child.geometry.computeBoundingSphere();
            }
            if (child.userData && child.userData.isBox) {
              child.geometry.type = 'BoxGeometry';
              child.geometry.parameters = child.userData.geoParams;
            }
          }
        });

        this.stage.scene.add(newObj);
      } catch (e) {
        console.error("重建特征失败:", e);
      }
    });
    
    // 取消选中状态，清理 UI
    if (this.toolHub && this.toolHub.tools && this.toolHub.tools.select) {
      this.toolHub.tools.select.deselectAll();
  }
  }
}