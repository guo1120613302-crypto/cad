import * as THREE from 'three'
import { TransformCommand } from '../HistoryManager.js'

export class SelectTool {
  constructor(scene, camera, canvas, entityManager, onSelect, toolHub, boxSelectState) {
    this.scene = scene
    this.camera = camera
    this.canvas = canvas
    this.entityManager = entityManager
    this.onSelect = onSelect
    this.toolHub = toolHub; // 新增
    this.boxSelectState = boxSelectState // 保存 Vue 传来的引用
    
    this.isActive = false
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // --- 多选状态体系 ---
    this.selectedObjects = []
    this.outlineMeshes = []

    this.gizmoSize = 60 
    this.gizmo = new THREE.Group()
    this.gizmoHandles = new THREE.Group()
    this.gizmoVisuals = new THREE.Group()
    this.gizmo.add(this.gizmoHandles, this.gizmoVisuals)
    this.gizmo.visible = false
    this.scene.add(this.gizmo)

    this.initGizmo()
    this.isDraggingGizmo = false
    this.activeAxis = null
    
    // 记录多选批量拖拽时的初始位置
    this.dragStartPositions = new Map() 
    this.gizmoStartPos = new THREE.Vector3()
    this.dragPlane = new THREE.Plane()

    // --- 纯正的 2D 框选系统 DOM ---
    this.isBoxSelecting = false
    this.boxStart = { x: 0, y: 0 }
  } // 【修复：这里补回了 constructor 的闭合括号】

  // 对外伪装单选 getter，保证兼容原本外部对 selectedObject 的调用
  get selectedObject() {
    return this.selectedObjects.length > 0 ? this.selectedObjects[this.selectedObjects.length - 1] : null;
  }

  initGizmo() {
    const axisDirs = { x: [1,0,0], y: [0,1,0], z: [0,0,1] }, axisColors = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff }
    for (const axis in axisDirs) {
      const dir = new THREE.Vector3(...axisDirs[axis]), color = axisColors[axis]
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), this.gizmoSize, color, 12, 6)
      
      arrow.line.material.depthTest = false
      arrow.line.material.depthWrite = false
      arrow.line.renderOrder = 999 
      arrow.cone.material.depthTest = false
      arrow.cone.material.depthWrite = false
      arrow.cone.renderOrder = 999
      
      this.gizmoVisuals.add(arrow)

      const handleGeo = new THREE.BoxGeometry(axis==='x'?60:10, axis==='y'?60:10, axis==='z'?60:10)
      handleGeo.translate(axis==='x'?30:0, axis==='y'?30:0, axis==='z'?30:0)
      const handle = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ visible: false }))
      handle.userData.axis = axis
      this.gizmoHandles.add(handle)
    }
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0) return
    this.updateMouse(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const gizmoHits = this.raycaster.intersectObjects(this.gizmoHandles.children)
    if (gizmoHits.length > 0) {
      this.isDraggingGizmo = true
      this.hasMoved = false;
      this.activeAxis = gizmoHits[0].object.userData.axis
      
      this.dragStartPositions.clear()
      this.selectedObjects.forEach(mesh => {
        this.dragStartPositions.set(mesh.uuid, mesh.position.clone())
      })
      this.gizmoStartPos.copy(this.gizmo.position)
      this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), this.gizmo.position)
      
      this.dragStartPoint = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.dragPlane, this.dragStartPoint)
      
      return
    }

    const intersects = this.raycaster.intersectObjects(this.scene.children, true)
    const target = intersects.find(h => 
      h.object.type === 'Mesh' && 
      h.object.userData.isPart && 
      !h.object.userData.isPreview &&
      h.object.visible && (!h.object.parent || h.object.parent.visible !== false)
    )
    const isMultiMode = event.shiftKey || event.ctrlKey || event.metaKey

    if (target) {
      const mesh = target.object
      if (isMultiMode) {
        if (this.selectedObjects.includes(mesh)) this.deselectMesh(mesh)
        else this.selectMesh(mesh, true)
      } else {
        this.deselectAll()
        this.selectMesh(mesh, false)
      }
    } else {
      // 点在空白处
      if (!isMultiMode) this.deselectAll()
      
      // 【修复】：在这里触发框选 UI，用 Vue 状态取代了原生 DOM
      this.isBoxSelecting = true
      this.boxStart = { x: event.clientX, y: event.clientY }
      
      this.boxSelectState.color = '#3b82f6';
      this.boxSelectState.bg = 'rgba(59, 130, 246, 0.2)';
      this.boxSelectState.left = this.boxStart.x;
      this.boxSelectState.top = this.boxStart.y;
      this.boxSelectState.width = 0;
      this.boxSelectState.height = 0;
      this.boxSelectState.visible = true;
    }
  }

  onMouseMove(event) {
    if (!this.isActive) return

    if (this.isDraggingGizmo && this.selectedObjects.length > 0) {
      this.updateMouse(event)
      this.raycaster.setFromCamera(this.mouse, this.camera)
      this.hasMoved = true;

      const intersectPoint = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)
      
      const offset = intersectPoint.clone().sub(this.dragStartPoint)
      
      const axisDir = new THREE.Vector3(this.activeAxis==='x'?1:0, this.activeAxis==='y'?1:0, this.activeAxis==='z'?1:0)
      const delta = axisDir.clone().multiplyScalar(offset.dot(axisDir))

      this.selectedObjects.forEach(mesh => {
        const startP = this.dragStartPositions.get(mesh.uuid)
        if (startP) {
          mesh.position.copy(startP.clone().add(delta))
          mesh.updateMatrixWorld()
        }
      })
      this.syncGizmo()
      this.notify()
      
      if (this.toolHub && this.toolHub.autoCheckInterference) {
        this.toolHub.checkInterference();
      }
      return
    }

    if (this.isBoxSelecting) {
      const currentX = event.clientX
      const currentY = event.clientY
      const left = Math.min(this.boxStart.x, currentX)
      const top = Math.min(this.boxStart.y, currentY)
      const width = Math.abs(currentX - this.boxStart.x)
      const height = Math.abs(currentY - this.boxStart.y)

      // 【修复】：用 Vue 状态响应宽度和高度
      this.boxSelectState.left = left;
      this.boxSelectState.top = top;
      this.boxSelectState.width = width;
      this.boxSelectState.height = height;
    }
  }

  onMouseUp(event) {
    if (!this.isActive) return
    
    if (this.isDraggingGizmo) {
      this.isDraggingGizmo = false;
      if (this.hasMoved && this.history) {
        const items = [];
        this.selectedObjects.forEach(mesh => {
          const oldPos = this.dragStartPositions.get(mesh.uuid);
          const newPos = mesh.position.clone();
          if (oldPos && !oldPos.equals(newPos)) {
            items.push({ mesh, oldPos, newPos });
          }
        });
        if (items.length > 0) {
          this.history.execute(new TransformCommand(items));
        }
      }
      this.hasMoved = false;
    }
    if (this.isDraggingGizmo) this.isDraggingGizmo = false

    if (this.isBoxSelecting) {
      this.isBoxSelecting = false
      this.boxSelectState.visible = false; // 【修复】：鼠标松开，隐藏框选

      const currentX = event.clientX
      const currentY = event.clientY
      
      if (Math.abs(currentX - this.boxStart.x) > 5 || Math.abs(currentY - this.boxStart.y) > 5) {
        const minX = Math.min(this.boxStart.x, currentX)
        const maxX = Math.max(this.boxStart.x, currentX)
        const minY = Math.min(this.boxStart.y, currentY)
        const maxY = Math.max(this.boxStart.y, currentY)

        const parts = []
        this.scene.traverse(child => {
          if (child.type === 'Mesh' && child.userData.isPart && !child.userData.isPreview) {
            if (child.visible && (!child.parent || child.parent.visible !== false)) {
              parts.push(child)
            }
          }
        })

        const isMultiMode = event.shiftKey || event.ctrlKey || event.metaKey
        if (!isMultiMode) this.deselectAll()

        parts.forEach(mesh => {
          if (this.isMeshInScreenRect(mesh, minX, maxX, minY, maxY)) {
            if (!this.selectedObjects.includes(mesh)) {
              this.selectMesh(mesh, true)
            }
          }
        })
      }
    }
  }

  isMeshInScreenRect(mesh, minX, maxX, minY, maxY) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    const pts = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ]

    const rect = this.canvas.getBoundingClientRect()
    let isInside = false

    for (let pt of pts) {
      pt.applyMatrix4(mesh.matrixWorld)
      pt.project(this.camera)
      if (pt.z > 1) continue 
      
      const sx = (pt.x + 1) / 2 * rect.width + rect.left
      const sy = -(pt.y - 1) / 2 * rect.height + rect.top
      
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        isInside = true
        break
      }
    }

    if (!isInside) {
      const center = new THREE.Vector3()
      box.getCenter(center)
      center.applyMatrix4(mesh.matrixWorld)
      center.project(this.camera)
      if (center.z <= 1) {
        const cx = (center.x + 1) / 2 * rect.width + rect.left
        const cy = -(center.y - 1) / 2 * rect.height + rect.top
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) isInside = true
      }
    }
    return isInside
  }

  selectMesh(mesh, append = false) {
    if (!append) this.deselectAll()
    if (!this.selectedObjects.includes(mesh)) {
      this.selectedObjects.push(mesh)
      
      const edges = new THREE.EdgesGeometry(mesh.geometry)
      const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#3b82f6', depthTest: true }))
      outline.userData.targetUuid = mesh.uuid
      this.scene.add(outline)
      this.outlineMeshes.push(outline)
    }
    
    this.gizmo.visible = true
    this.syncGizmo()
    this.notify()
  }

  deselectMesh(mesh) {
    const index = this.selectedObjects.indexOf(mesh)
    if (index > -1) this.selectedObjects.splice(index, 1)
    
    const outlineIndex = this.outlineMeshes.findIndex(o => o.userData.targetUuid === mesh.uuid)
    if (outlineIndex > -1) {
      const outline = this.outlineMeshes[outlineIndex]
      this.scene.remove(outline)
      outline.geometry.dispose()
      outline.material.dispose()
      this.outlineMeshes.splice(outlineIndex, 1)
    }

    if (this.selectedObjects.length === 0) this.gizmo.visible = false
    this.syncGizmo()
    this.notify()
  }

  deselectAll() {
    this.selectedObjects = []
    this.outlineMeshes.forEach(outline => {
      this.scene.remove(outline)
      outline.geometry.dispose()
      outline.material.dispose()
    })
    this.outlineMeshes = []
    this.gizmo.visible = false
    this.notify()
  }

  deselect() {
    this.deselectAll()
  }

  syncGizmo() {
    if (this.selectedObjects.length === 0) return

    this.outlineMeshes.forEach(outline => {
      const target = this.selectedObjects.find(m => m.uuid === outline.userData.targetUuid)
      if (target) {
        outline.matrixAutoUpdate = false
        outline.matrix.copy(target.matrixWorld)
      }
    })

    const primary = this.selectedObject
    if (primary) {
      primary.updateMatrixWorld()
      this.gizmo.position.copy(primary.position)
    }
  }

  notify() {
    const primary = this.selectedObject
    if (!primary) {
      this.onSelect(null)
      return
    }
    const p = primary.position, g = primary.geometry.parameters
    const format = (val) => val !== undefined ? Number(val.toFixed(3)) : 0
    
    this.onSelect({ 
      id: primary.uuid, 
      width: format(g.width), 
      height: format(g.height), 
      thickness: format(g.depth), 
      x: format(p.x), y: format(p.y), z: format(p.z) 
    })
  }

  updateMouse(e) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  activate() { this.isActive = true }
  
  deactivate() { 
    this.isActive = false
    this.deselectAll() 
    if(this.isBoxSelecting) {
        this.isBoxSelecting = false
        this.boxSelectState.visible = false; // 【修复】：工具停用时，隐藏框选
    }
  }
}