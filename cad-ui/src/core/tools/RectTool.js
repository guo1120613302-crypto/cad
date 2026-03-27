import * as THREE from 'three'
import { AddObjectCommand } from '../HistoryManager.js'
export class RectTool {
  constructor(scene, camera, canvas, uiState) {
    this.scene = scene
    this.camera = camera
    this.canvas = canvas
    this.uiState = uiState
    
    this.isActive = false
    this.isDrawing = false // 新增状态：控制“点第一下”和“点第二下”
    this.startPoint = null
    this.lineMesh = null
    
    // 【修改1：不要躺在地上】把捕捉面改成立起来的 XY 平面 (法线朝向 Z 轴)
    this.drawingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
  }

  activate() {
    this.isActive = true
    this.isDrawing = false
    this.startPoint = null
    this.uiState.visible = false
  }

  deactivate() {
    this.isActive = false
    this.cleanup()
  }

  getIntersectPoint(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const target = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(this.drawingPlane, target)
    return target
  }

  onMouseDown(event) {
    if (!this.isActive) return
    if (event.button !== 0) return // 必须是左键

    if (!this.isDrawing) {
      // 【修改5：选择矩形工具后选择一个点】点击第一下，确定起点，松开鼠标！
      this.startPoint = this.getIntersectPoint(event)
      this.isDrawing = true // 进入跟随状态
      
      const geometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({ color: 0xffffff })
      this.lineMesh = new THREE.LineLoop(geometry, material)
      this.scene.add(this.lineMesh)
      
      this.uiState.visible = true
      this.uiState.x = event.clientX + 15
      this.uiState.y = event.clientY + 15
    } else {
      // 已经选了起点，点击第二下，就相当于确认生成
      this.onEnterPressed()
    }
  }

onMouseMove(event) {
    if (!this.isActive || !this.isDrawing || !this.startPoint) return

    const currentPoint = this.getIntersectPoint(event)
    
    // 获取鼠标真实的带方向差值（可能是负数，代表往左或往下拖）
    let rawW = currentPoint.x - this.startPoint.x
    let rawH = currentPoint.y - this.startPoint.y

    // 【问题 2 解决】获取拖拽方向的符号（往左是 -1，往右是 1）
    let signX = Math.sign(rawW) || 1
    let signY = Math.sign(rawH) || 1

    // 如果键盘锁死了数字，就用输入的绝对值乘以方向符号；否则跟着鼠标真实尺寸走
    let w = this.uiState.isWidthLocked ? parseFloat(this.uiState.width) * signX : rawW
    let h = this.uiState.isHeightLocked ? parseFloat(this.uiState.height) * signY : rawH

    // 悬浮框里永远只显示绝对值（正数）
    if (!this.uiState.isWidthLocked) this.uiState.width = Math.abs(w).toFixed(1)
    if (!this.uiState.isHeightLocked) this.uiState.height = Math.abs(h).toFixed(1)
    
    this.uiState.x = event.clientX + 15
    this.uiState.y = event.clientY + 15

    // 用带有正负方向的 w 和 h 去画白色的 2D 矩形线框
    const p1 = this.startPoint
    const p2 = new THREE.Vector3(p1.x + w, p1.y, 0)
    const p3 = new THREE.Vector3(p1.x + w, p1.y + h, 0)
    const p4 = new THREE.Vector3(p1.x, p1.y + h, 0)
    this.lineMesh.geometry.setFromPoints([p1, p2, p3, p4])
    
    // 偷偷记录下当前真实的带符号宽高，留给生成 3D 板子用
    this.currentW = w
    this.currentH = h
  }
onEnterPressed() {
    if (!this.isActive || !this.startPoint) return

    // 1. 强制读取 UI 响应式数据中的最新数值（无视当前的鼠标位置偏移）
    const inputW = Math.abs(parseFloat(this.uiState.width))
    const inputH = Math.abs(parseFloat(this.uiState.height))
    
    if (isNaN(inputW) || isNaN(inputH) || inputW === 0 || inputH === 0) return 

    const thickness = parseFloat(this.uiState.thickness) || 1.5 

    // 2. 根据鼠标之前的拉拽动作，确定生成方向（左上/右下等）
    const signX = Math.sign(this.currentW) || 1
    const signY = Math.sign(this.currentH) || 1

    const geometry = new THREE.BoxGeometry(inputW, inputH, thickness)
    const material = new THREE.MeshStandardMaterial({ 
      color: '#b0b5b9', 
      roughness: 0.4, 
      metalness: 0.6 
    })
    const sheetMetal = new THREE.Mesh(geometry, material)
    sheetMetal.userData = { isPart: true, type: 'base_rect' };
    // 3. 极其重要的物理对齐：起点坐标 + (输入的长度 * 方向符号) / 2
    const centerX = this.startPoint.x + (inputW * signX) / 2
    const centerY = this.startPoint.y + (inputH * signY) / 2
    const centerZ = thickness / 2 
    
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
    this.isDrawing = false
    this.startPoint = null
    this.uiState.visible = false
    this.uiState.isWidthLocked = false
    this.uiState.isHeightLocked = false
  }
}