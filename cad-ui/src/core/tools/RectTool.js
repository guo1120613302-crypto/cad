import * as THREE from 'three'
import { AddObjectCommand } from '../HistoryManager.js'

export class RectTool {
  constructor(scene, camera, canvas, uiState) {
    this.scene = scene
    this.camera = camera
    this.canvas = canvas
    this.uiState = uiState
    
    this.isActive = false
    this.isDrawing = false 
    this.isPreviewMode = false 
    this.startPoint = null
    this.lineMesh = null
    this.previewMesh = null 
    this.snapSettings = { grid: false, vertex: false } 
    
    this.currentPlane = 'XY'
    this.drawingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // 【修改 1】：捕捉点改为一个小巧的实心青色小球，不再突兀
    const markerGeo = new THREE.SphereGeometry(1.2, 16, 16)
    const markerMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff, 
      depthTest: false, 
      transparent: true, 
      opacity: 0.9 
    })
    this.snapMarker = new THREE.Mesh(markerGeo, markerMat)
    this.snapMarker.visible = false
    this.snapMarker.renderOrder = 999
    this.scene.add(this.snapMarker)
  }

  setPlane(plane) {
    this.currentPlane = plane;
    if (plane === 'XY') this.drawingPlane.normal.set(0, 0, 1);
    if (plane === 'XZ') this.drawingPlane.normal.set(0, 1, 0);
    if (plane === 'YZ') this.drawingPlane.normal.set(1, 0, 0);
    // 如果正在预览，切换基准面时自动取消，防止错位
    if (this.isPreviewMode) this.cleanup();
  }

  activate() {
    this.isActive = true
    this.cleanup()
  }

  deactivate() {
    this.isActive = false
    this.cleanup()
  }

  // 响应 Esc 键
  cancel() {
    this.cleanup()
  }

  
  // --- 完全替换现有的 getIntersectPoint 方法 ---
 // --- 完全替换现有的 getIntersectPoint 方法 ---
 // --- 完全替换现有的 getIntersectPoint 方法 ---
 getIntersectPoint(event) {
  const rect = this.canvas.getBoundingClientRect()
  this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  this.raycaster.setFromCamera(this.mouse, this.camera)
  
  // 默认落点在当前的基准面上
  const target = new THREE.Vector3()
  if (!this.raycaster.ray.intersectPlane(this.drawingPlane, target)) {
    if (this.snapMarker) this.snapMarker.visible = false;
    return target
  }

  let exactSnappedVertex = null;
  
  // 【新增】：用于记录轴向追踪（智能参考线）的坐标
  let trackCoord1 = null;
  let trackCoord2 = null;

  // 确定当前平面的两个工作轴（比如 XY 平面，工作轴就是 x 和 y）
  let ax1 = 'x', ax2 = 'y';
  if (this.currentPlane === 'XZ') { ax1 = 'x'; ax2 = 'z'; }
  else if (this.currentPlane === 'YZ') { ax1 = 'y'; ax2 = 'z'; }

  // 1. 优先执行：实体顶点捕捉 (Vertex Snapping) & 轴向追踪
  if (this.snapSettings.vertex) {
    const camDist = this.camera.position.distanceTo(target)
    let exactThreshold = camDist * 0.035 
    if (exactThreshold < 3) exactThreshold = 3
    if (exactThreshold > 30) exactThreshold = 30

    // 轴向追踪的吸附阈值，稍微严苛一点，防止横向拖拽时乱吸
    let trackThreshold1 = exactThreshold * 0.8;
    let trackThreshold2 = exactThreshold * 0.8;

    this.scene.traverse(c => {
      if (c.isMesh && c.userData.isPart && c !== this.previewMesh && c.visible && (!c.parent || c.parent.visible !== false)) {
        
        const posAttr = c.geometry.attributes.position
        if (!posAttr) return
        
        for (let i = 0; i < posAttr.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(c.matrixWorld)
          
          // [A] 点对点精确捕捉 (计算视线距离)
          const distExact = this.raycaster.ray.distanceToPoint(v)
          if (distExact < exactThreshold) {
            exactThreshold = distExact
            exactSnappedVertex = v 
          }

          // 【核心修复】：[B] 轴向对齐追踪
          // 将模型顶点投影到画板后，独立检查鼠标在横轴或纵轴上是否与它平齐
          const projV = new THREE.Vector3()
          this.drawingPlane.projectPoint(v, projV)
          
          const dist1 = Math.abs(target[ax1] - projV[ax1])
          const dist2 = Math.abs(target[ax2] - projV[ax2])

          // 如果高度/宽度非常接近某个顶点，记录下这个顶点的坐标！
          if (dist1 < trackThreshold1) {
            trackThreshold1 = dist1
            trackCoord1 = projV[ax1]
          }
          if (dist2 < trackThreshold2) {
            trackThreshold2 = dist2
            trackCoord2 = projV[ax2]
          }
        }
      }
    })
  }

  // --- 最终坐标结算分配 ---

  // 优先级 1：如果鼠标直直地指着某个角，触发精确捕捉
  if (exactSnappedVertex) {
    if (this.snapMarker) {
      this.snapMarker.position.copy(exactSnappedVertex);
      this.snapMarker.visible = true;
    }
    return exactSnappedVertex.clone()
  } 
  
  // 优先级 2：没有精确点，但鼠标拖拽高度/宽度时，与某个顶点持平了
  if (trackCoord1 !== null || trackCoord2 !== null) {
    if (this.snapMarker) this.snapMarker.visible = false; 
    
    // 强行把鼠标的坐标“锁死”到那个模型的对应高度/宽度上！
    if (trackCoord1 !== null) target[ax1] = trackCoord1;
    if (trackCoord2 !== null) target[ax2] = trackCoord2;
  } else {
    if (this.snapMarker) this.snapMarker.visible = false;
  }

  // 优先级 3：执行网格捕捉 (Grid Snapping)
  if (this.snapSettings.grid) {
    const step = 10;
    // 只有在没有被“轴向追踪”锁死的轴，才继续执行网格四舍五入
    if (trackCoord1 === null) target[ax1] = Math.round(target[ax1] / step) * step;
    if (trackCoord2 === null) target[ax2] = Math.round(target[ax2] / step) * step;
  }

  return target
}

  // 【新增】：启动预览模式
  // 完全替换 startPreview 方法
  startPreview(w, h) {
    this.cleanup();
    const width = parseFloat(w);
    const height = parseFloat(h);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return;

    this.isPreviewMode = true;
    const thickness = parseFloat(this.uiState.thickness) || 1.5;

    let geometry = new THREE.BoxGeometry(width, height, thickness);
    // 【核心修复】：将几何体的内部坐标系原点，从中心移动到左下角的起点！
    geometry.translate(width / 2, height / 2, thickness / 2);

    const material = new THREE.MeshStandardMaterial({
      color: '#3b82f6', transparent: true, opacity: 0.6, roughness: 0.4, metalness: 0.6
    });
    this.previewMesh = new THREE.Mesh(geometry, material);
    
    // 旋转后，原点依然完美钉在角落
    if (this.currentPlane === 'XZ') this.previewMesh.rotation.x = -Math.PI / 2;
    else if (this.currentPlane === 'YZ') this.previewMesh.rotation.y = Math.PI / 2;
    this.scene.add(this.previewMesh);
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0) return

    // 【新增】：如果在预览印章模式下点击，直接生成真实板材
    if (this.isPreviewMode && this.previewMesh) {
      const finalMesh = this.previewMesh.clone();
      finalMesh.material = new THREE.MeshStandardMaterial({ 
        color: '#b0b5b9', roughness: 0.4, metalness: 0.6 
      });
      finalMesh.userData = { isPart: true, type: 'base_rect' };

      if (this.history) {
        this.history.execute(new AddObjectCommand(finalMesh, this.scene, '放置矩形基板'));
      } else {
        this.scene.add(finalMesh);
      }
      return;
    }

    // 原有的拖拽绘制逻辑
    if (!this.isDrawing) {
      this.startPoint = this.getIntersectPoint(event)
      this.isDrawing = true 
      
      const geometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({ color: 0xffffff })
      this.lineMesh = new THREE.LineLoop(geometry, material)
      this.scene.add(this.lineMesh)
      
      this.uiState.visible = true
      this.uiState.x = event.clientX + 15
      this.uiState.y = event.clientY + 15
    } else {
      this.onEnterPressed()
    }
  }

  onMouseMove(event) {
    if (!this.isActive) return

    const currentPoint = this.getIntersectPoint(event)

    // 【修改】：既然在 startPreview 里已经把原点挪到了角落，这里直接赋值坐标即可！
    if (this.isPreviewMode && this.previewMesh) {
        this.previewMesh.position.copy(currentPoint);
        return;
    }

    // 原有的拖拽画线逻辑
    if (!this.isDrawing || !this.startPoint) return

    let rawW = 0, rawH = 0;
    if (this.currentPlane === 'XY') {
      rawW = currentPoint.x - this.startPoint.x;
      rawH = currentPoint.y - this.startPoint.y;
    } else if (this.currentPlane === 'XZ') {
      rawW = currentPoint.x - this.startPoint.x;
      rawH = currentPoint.z - this.startPoint.z;
    } else if (this.currentPlane === 'YZ') {
      rawW = currentPoint.z - this.startPoint.z; 
      rawH = currentPoint.y - this.startPoint.y; 
    }
    let signX = Math.sign(rawW) || 1
    let signY = Math.sign(rawH) || 1

    let w = this.uiState.isWidthLocked ? parseFloat(this.uiState.width) * signX : rawW
    let h = this.uiState.isHeightLocked ? parseFloat(this.uiState.height) * signY : rawH

    if (!this.uiState.isWidthLocked) this.uiState.width = Math.abs(w).toFixed(1)
    if (!this.uiState.isHeightLocked) this.uiState.height = Math.abs(h).toFixed(1)
    
    this.uiState.x = event.clientX + 15
    this.uiState.y = event.clientY + 15

    const p1 = this.startPoint
    let p2, p3, p4;
    
    if (this.currentPlane === 'XY') {
      p2 = new THREE.Vector3(p1.x + w, p1.y, p1.z);
      p3 = new THREE.Vector3(p1.x + w, p1.y + h, p1.z);
      p4 = new THREE.Vector3(p1.x, p1.y + h, p1.z);
    } else if (this.currentPlane === 'XZ') {
      p2 = new THREE.Vector3(p1.x + w, p1.y, p1.z);
      p3 = new THREE.Vector3(p1.x + w, p1.y, p1.z + h);
      p4 = new THREE.Vector3(p1.x, p1.y, p1.z + h);
    }  else if (this.currentPlane === 'YZ') {
      p2 = new THREE.Vector3(p1.x, p1.y, p1.z + w);
      p3 = new THREE.Vector3(p1.x, p1.y + h, p1.z + w);
      p4 = new THREE.Vector3(p1.x, p1.y + h, p1.z);
    }
    
    this.lineMesh.geometry.setFromPoints([p1, p2, p3, p4])
    this.currentW = w
    this.currentH = h
  }

  onEnterPressed() {
    if (!this.isActive || !this.startPoint || this.isPreviewMode) return

    const inputW = Math.abs(parseFloat(this.uiState.width))
    const inputH = Math.abs(parseFloat(this.uiState.height))
    
    if (isNaN(inputW) || isNaN(inputH) || inputW === 0 || inputH === 0) return 

    const thickness = parseFloat(this.uiState.thickness) || 1.5 

    const signX = Math.sign(this.currentW) || 1
    const signY = Math.sign(this.currentH) || 1

    let geometry = new THREE.BoxGeometry(inputW, inputH, thickness);
    const material = new THREE.MeshStandardMaterial({ 
      color: '#b0b5b9', roughness: 0.4, metalness: 0.6 
    });
    const sheetMetal = new THREE.Mesh(geometry, material);
    sheetMetal.userData = { isPart: true, type: 'base_rect' };

    let centerX = this.startPoint.x, centerY = this.startPoint.y, centerZ = this.startPoint.z;

    if (this.currentPlane === 'XY') {
      centerX += (inputW * signX) / 2;
      centerY += (inputH * signY) / 2;
      centerZ += thickness / 2;
    } else if (this.currentPlane === 'XZ') {
      sheetMetal.rotation.x = -Math.PI / 2; // 让板子躺下
      centerX += (inputW * signX) / 2;
      centerY += thickness / 2;
      centerZ += (inputH * signY) / 2;
    } else if (this.currentPlane === 'YZ') {
      sheetMetal.rotation.y = Math.PI / 2;  // 让板子侧立
      centerX += thickness / 2;
      centerY += (inputH * signY) / 2; // 严守 Y 轴为公共高度
      centerZ += (inputW * signX) / 2; // Z 轴为宽度
    }
    sheetMetal.position.set(centerX, centerY, centerZ)
    if (this.history) {
      this.history.execute(new AddObjectCommand(sheetMetal, this.scene, '绘制矩形基板'));
    } else {
      this.scene.add(sheetMetal)
    }

    this.cleanup()
  }

  cleanup() {
    if (this.lineMesh) {
      this.scene.remove(this.lineMesh)
      this.lineMesh.geometry.dispose()
      this.lineMesh.material.dispose()
      this.lineMesh = null
    }
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh)
      this.previewMesh.geometry.dispose()
      this.previewMesh.material.dispose()
      this.previewMesh = null
    }
    if (this.snapMarker) {
      this.snapMarker.visible = false; // 取消工具或结束绘制时隐藏红点
    }
    this.isDrawing = false
    this.isPreviewMode = false
    this.startPoint = null
    this.uiState.visible = false
  }
}