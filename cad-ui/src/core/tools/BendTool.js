import * as THREE from 'three'

export class BendTool {
  constructor(scene, camera, canvas, entityManager, onEdgeSelected) {
    this.scene = scene
    this.camera = camera
    this.canvas = canvas
    this.entityManager = entityManager
    this.onEdgeSelected = onEdgeSelected 

    this.isActive = false
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Line.threshold = 5 
    this.mouse = new THREE.Vector2()
    
    this.hoveredMesh = null
    this.hoveredEdge = null
    this.lockedMesh = null   
    this.lockedEdge = null   
    
    this.highlightLine = null
    this.selectedEdgeLine = null
    this.previewMesh = null 
  }

  activate() { this.isActive = true }
  
  deactivate() { 
    this.isActive = false
    this.clearHighlights()
    this.removePreview()
  }

  onMouseMove(event) {
    if (!this.isActive) return
    if (event.buttons !== 0) {
      this.clearHover()
      return
    }

    this.updateMouse(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const intersects = this.raycaster.intersectObjects(this.scene.children, true)
    const target = intersects.find(h => 
      h.object.type === 'Mesh' && 
      h.object.geometry.type === 'BoxGeometry' &&
      h.object.visible === true &&
      h.object.userData.isPart === true && 
      !h.object.userData.isPreview
    )

    if (target) {
      this.hoveredMesh = target.object
      this.findNearestEdge(target)
    } else {
      this.clearHover() 
    }
  }

  onMouseDown(event) {
    if (!this.isActive || event.button !== 0 || !this.hoveredEdge || !this.hoveredMesh) return
    
    this.deselectEdge()
    this.lockedMesh = this.hoveredMesh
    this.lockedEdge = this.hoveredEdge
    this.drawSelectedEdgeVisual(this.lockedMesh, this.lockedEdge)
    
    if (typeof this.onEdgeSelected === 'function') {
      this.onEdgeSelected({ 
        parentUuid: this.lockedMesh.uuid, 
        axis: this.lockedEdge.axis, 
        p1: this.lockedEdge.p1, 
        p2: this.lockedEdge.p2,
        // 【新增】：将边的物理长度传出去，供 UI 面板显示
        length: this.getEdgeLength(this.lockedEdge) 
      })
    }
  }

  updatePreview(params) {
    if (!this.lockedMesh || !this.selectedEdgeLine) return
    this.removePreview()

    // 【新增 width 参数接入】
    const { length, width, angle, isGrooved, direction } = params
    
    const { width: w, height: h, depth: d } = this.lockedMesh.geometry.parameters
    let T = d;
    if (w <= h && w <= d) T = w;
    else if (h <= w && h <= d) T = h;

    const L = length 
    // 【核心修改】：优先使用用户输入的 width，如果没有输入则默认占满整条边
    const edgeLength = (width !== undefined && width !== 0) ? Number(width) : this.getEdgeLength(this.lockedEdge)

    this.applyParentMiter(isGrooved)
    
    let geometry = new THREE.BoxGeometry(L, T, edgeLength)
    geometry.translate(L / 2, T / 2, 0)

    if (isGrooved) {
      const pos = geometry.attributes.position
      const arr = pos.array
      const eps = 0.001
      for (let i = 0; i < arr.length; i += 3) {
        if (Math.abs(arr[i]) < eps && Math.abs(arr[i+1] - T) < eps) {
          arr[i] = T
        }
      }
      pos.needsUpdate = true
      geometry.computeVertexNormals()
    }
    
    const material = new THREE.MeshStandardMaterial({ 
      color: '#e5c07b', transparent: true, opacity: 0.7, metalness: 0.6, roughness: 0.4
    })
    
    this.previewMesh = new THREE.Mesh(geometry, material)
    this.previewMesh.userData.isPreview = true

    this.alignAndRotate(direction, angle)
    this.scene.add(this.previewMesh)
  }

  alignAndRotate(direction, angle) {
    const mesh = this.lockedMesh
    const edge = this.lockedEdge
    
    const localMidPoint = new THREE.Vector3(
      (edge.p1[0] + edge.p2[0]) / 2,
      (edge.p1[1] + edge.p2[1]) / 2,
      (edge.p1[2] + edge.p2[2]) / 2
    )
    this.previewMesh.position.copy(localMidPoint)
    
    mesh.geometry.computeBoundingBox()
    const { min, max } = mesh.geometry.boundingBox
    
    const { width: w, height: h, depth: d } = mesh.geometry.parameters
    let tAxis = 'z'
    if (w <= h && w <= d) tAxis = 'x'
    else if (h <= w && h <= d) tAxis = 'y'
    
    const axes = ['x', 'y', 'z']
    const eAxis = edge.axis
    const extAxis = axes.find(a => a !== eAxis && a !== tAxis)
    
    const centerExt = (min[extAxis] + max[extAxis]) / 2
    const centerT = (min[tAxis] + max[tAxis]) / 2

    let signExt = Math.sign(localMidPoint[extAxis] - centerExt)
    if (signExt === 0) signExt = 1
    
    let signT = Math.sign(centerT - localMidPoint[tAxis])
    if (signT === 0) signT = 1
    
    const vX = new THREE.Vector3(0, 0, 0)
    vX[extAxis] = signExt
    
    const vY = new THREE.Vector3(0, 0, 0)
    vY[tAxis] = signT 
    
    const vZ_correct = new THREE.Vector3().crossVectors(vX, vY)
    
    const m = new THREE.Matrix4().makeBasis(vX, vY, vZ_correct)
    this.previewMesh.quaternion.setFromRotationMatrix(m)
    
    const rad = THREE.MathUtils.degToRad(-angle * direction)
    this.previewMesh.rotateZ(rad)

    this.previewMesh.updateMatrix()
    this.previewMesh.applyMatrix4(mesh.matrixWorld)
  }

  applyParentMiter(isGrooved) {
    try {
      const mesh = this.lockedMesh
      const edge = this.lockedEdge
      if (!mesh || mesh.geometry.type !== 'BoxGeometry') return

      const geo = mesh.geometry
      if (!mesh.userData.originalPos) {
        mesh.userData.originalPos = new Float32Array(geo.attributes.position.array)
      }

      const pos = geo.attributes.position
      const arr = pos.array
      const orig = mesh.userData.originalPos

      for(let i=0; i<arr.length; i++) arr[i] = orig[i]

      if (isGrooved) {
        geo.computeBoundingBox()
        const { min, max } = geo.boundingBox
        const { width: w, height: h, depth: d_param } = geo.parameters
        
        let tAxis = 'z'
        if (w <= h && w <= d_param) tAxis = 'x'
        else if (h <= w && h <= d_param) tAxis = 'y'

        const axes = ['x', 'y', 'z']
        const eAxis = edge.axis
        const extAxis = axes.find(a => a !== eAxis && a !== tAxis)

        const thickness = geo.parameters[tAxis === 'x' ? 'width' : tAxis === 'y' ? 'height' : 'depth']
        const eps = 0.001

        const getCoord = (pt, axis) => pt[axis === 'x' ? 0 : axis === 'y' ? 1 : 2]
        const eExt = getCoord(edge.p1, extAxis)
        const eT = getCoord(edge.p1, tAxis)

        const oppositeT = (Math.abs(eT - max[tAxis]) < eps) ? min[tAxis] : max[tAxis]
        const centerExt = (min[extAxis] + max[extAxis]) / 2
        const pushDir = Math.sign(centerExt - eExt)

        for (let i = 0; i < arr.length; i += 3) {
          const pt = { x: arr[i], y: arr[i+1], z: arr[i+2] }
          if (Math.abs(pt[extAxis] - eExt) < eps && Math.abs(pt[tAxis] - oppositeT) < eps) {
            if (extAxis === 'x') arr[i] += thickness * pushDir
            if (extAxis === 'y') arr[i+1] += thickness * pushDir
            if (extAxis === 'z') arr[i+2] += thickness * pushDir
          }
        }
      }
      pos.needsUpdate = true
      geo.computeVertexNormals() 
    } catch (error) {
      console.warn('45° 倒角计算被中断', error)
    }
  }

  findNearestEdge(intersect) {
    const mesh = intersect.object
    mesh.geometry.computeBoundingBox()
    const { min, max } = mesh.geometry.boundingBox

    const edges = [
      { p1: [min.x, min.y, min.z], p2: [max.x, min.y, min.z], axis: 'x' },
      { p1: [min.x, max.y, min.z], p2: [max.x, max.y, min.z], axis: 'x' },
      { p1: [min.x, min.y, max.z], p2: [max.x, min.y, max.z], axis: 'x' },
      { p1: [min.x, max.y, max.z], p2: [max.x, max.y, max.z], axis: 'x' },

      { p1: [min.x, min.y, min.z], p2: [min.x, max.y, min.z], axis: 'y' },
      { p1: [max.x, min.y, min.z], p2: [max.x, max.y, min.z], axis: 'y' },
      { p1: [min.x, min.y, max.z], p2: [min.x, max.y, max.z], axis: 'y' },
      { p1: [max.x, min.y, max.z], p2: [max.x, max.y, max.z], axis: 'y' },

      { p1: [min.x, min.y, min.z], p2: [min.x, min.y, max.z], axis: 'z' },
      { p1: [max.x, min.y, min.z], p2: [max.x, min.y, max.z], axis: 'z' },
      { p1: [min.x, max.y, min.z], p2: [min.x, max.y, max.z], axis: 'z' },
      { p1: [max.x, max.y, min.z], p2: [max.x, max.y, max.z], axis: 'z' }
    ]

    const { width: w, height: h, depth: d } = mesh.geometry.parameters
    let tAxis = 'z'
    if (w <= h && w <= d) tAxis = 'x'
    else if (h <= w && h <= d) tAxis = 'y'

    const validEdges = edges.filter(e => e.axis !== tAxis)

    let minForce = Infinity, bestEdge = null
    const localRay = new THREE.Ray().copy(this.raycaster.ray).applyMatrix4(mesh.matrixWorld.clone().invert())
    
    validEdges.forEach(edge => {
      const dist = localRay.distanceSqToSegment(new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2), null, null)
      if (dist < minForce) { minForce = dist; bestEdge = edge }
    })

    if (bestEdge && minForce < 120) { 
      this.showHoverEdge(mesh, bestEdge)
      this.hoveredEdge = bestEdge
    } else {
      this.clearHover()
    }
  }

  showHoverEdge(mesh, edge) {
    this.clearHoverVisuals()
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2)])
    this.highlightLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffcc00', depthTest: true }))
    this.highlightLine.position.copy(mesh.position)
    this.highlightLine.rotation.copy(mesh.rotation)
    this.scene.add(this.highlightLine)
  }

  drawSelectedEdgeVisual(mesh, edge) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...edge.p1), new THREE.Vector3(...edge.p2)])
    this.selectedEdgeLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ff0000', linewidth: 3, depthTest: true }))
    this.selectedEdgeLine.position.copy(mesh.position)
    this.selectedEdgeLine.rotation.copy(mesh.rotation)
    this.scene.add(this.selectedEdgeLine)
  }

  clearHoverVisuals() {
    if (this.highlightLine) { 
      this.scene.remove(this.highlightLine)
      if(this.highlightLine.geometry) this.highlightLine.geometry.dispose()
      this.highlightLine = null 
    }
  }

  clearHover() { 
    this.clearHoverVisuals()
    this.hoveredEdge = null 
    this.hoveredMesh = null
  }

  deselectEdge() { 
    if (this.selectedEdgeLine) { 
      this.scene.remove(this.selectedEdgeLine)
      if(this.selectedEdgeLine.geometry) this.selectedEdgeLine.geometry.dispose()
      this.selectedEdgeLine = null 
    }
    if (this.lockedMesh && this.lockedMesh.userData.originalPos) {
      this.applyParentMiter(false)
      delete this.lockedMesh.userData.originalPos
    }
    this.lockedMesh = null
    this.lockedEdge = null
  }

  removePreview() { 
    if (this.previewMesh) { 
      this.scene.remove(this.previewMesh)
      if(this.previewMesh.geometry) this.previewMesh.geometry.dispose()
      this.previewMesh = null 
    } 
  }
  
  clearHighlights() { this.clearHover(); this.deselectEdge() }
  getEdgeLength(edge) { return new THREE.Vector3(...edge.p1).distanceTo(new THREE.Vector3(...edge.p2)) }
  
  updateMouse(e) { 
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1 
  }
}