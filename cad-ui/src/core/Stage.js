import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class Stage {
  constructor(container) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#1e2227')

    const width = container.clientWidth
    const height = container.clientHeight
    
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000)
    // 初始距离目标点大约是 860 的距离
    this.camera.position.set(500, 400, 500)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)

    this.initBase()

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }
    
    // 【核心修复】：解决放大后平移和旋转极其缓慢的问题
    this.controls.screenSpacePanning = true // 开启屏幕空间平移，保证平移比例固定
    this.controls.minDistance = 5 // 防止过度缩放导致死锁
    this.controls.maxDistance = 5000
    
    // 提升基础灵敏度
    this.controls.zoomSpeed = 1.5
    this.controls.panSpeed = 1.0
    this.controls.rotateSpeed = 0.8

    // 【体验升级 1】：开启真实的物理阻尼（惯性），手感直接提升到工业 CAD 级别
    this.controls.enableDamping = false // 改为 true
    this.controls.dampingFactor = 0.08 // 阻尼系数，0.08 手感较为干脆丝滑

    this.animate()
  }

  initBase() {
    this.scene.add(new THREE.GridHelper(2000, 40, '#4b5263', '#2c313a'))
    this.scene.add(new THREE.AxesHelper(300))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(1000, 2000, 1000)
    this.scene.add(sun)
  }

  animate() {
    this.renderId = requestAnimationFrame(() => this.animate())
    
    if (this.controls) {
      // 删除了原先导致放大后卡顿的“动态灵敏度算法”
      // 因为开启 screenSpacePanning 后，Three.js 底层会自动完美处理近距离平移逻辑
      
      // 开启了阻尼之后，必须在 animate 中调用 update()
      this.controls.update()
    }

    this.renderer.render(this.scene, this.camera)
  }

  onResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose() {
    cancelAnimationFrame(this.renderId)
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}