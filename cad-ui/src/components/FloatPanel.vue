<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  title: { type: String, default: '面板' },
  initialX: { type: Number, default: 50 },
  initialY: { type: Number, default: 50 },
  initialWidth: { type: Number, default: 260 }
})

const panelRef = ref(null)
const position = ref({ x: props.initialX, y: props.initialY })
const isDragging = ref(false)
const isResizing = ref(false)
const isMinimized = ref(false)
const isVisible = ref(true)

const panelWidth = ref(props.initialWidth)
const contentHeight = ref('auto') // 内容区高度

let dragOffset = { x: 0, y: 0 }
let resizeType = '' // 记录当前缩放的方向：'e', 'w', 's', 'se', 'sw'

// --- 1. 强化版吸附系统 ---
const onDrag = (e) => {
  if (!isDragging.value || !panelRef.value) return
  let newX = e.clientX - dragOffset.x
  let newY = e.clientY - dragOffset.y

  const snapThreshold = 15 
  const screenW = window.innerWidth
  const screenH = window.innerHeight
  const selfW = panelRef.value.offsetWidth
  const selfH = panelRef.value.offsetHeight

  // 1. 面板间的磁吸逻辑
  const allPanels = document.querySelectorAll('.float-panel')
  allPanels.forEach(other => {
    if (other === panelRef.value || other.style.display === 'none') return
    const rect = other.getBoundingClientRect()
    if (Math.abs(newX - rect.right) < snapThreshold) newX = rect.right
    if (Math.abs(newX + selfW - rect.left) < snapThreshold) newX = rect.left - selfW
    if (Math.abs(newY - rect.bottom) < snapThreshold) newY = rect.bottom
    if (Math.abs(newY + selfH - rect.top) < snapThreshold) newY = rect.top - selfH
  })

  // 2. 屏幕边缘限制 (右侧 / 底部)
  let maxX = screenW - selfW;
  let maxY = screenH - 128 - selfH;
  if (newX > maxX - snapThreshold) newX = maxX;
  if (newY > maxY - snapThreshold) newY = maxY;

  // 3. 【核心修复】：屏幕边缘绝对防御 (左侧 / 顶部) - 放在最后，拥有最高优先级！
  // 哪怕面板高度有一万像素，它也只能向下溢出，绝不准把标题栏顶出屏幕外！
  if (newX < 0) newX = 0;
  if (newY < 5) newY = 5; 

  position.value = { x: newX, y: newY }
}

// --- 2. 核心：全边缘缩放系统 (已修复死区 Bug) ---
const startResize = (e, type) => {
  e.stopPropagation()
  isResizing.value = true
  resizeType = type
  
  // 强制全局光标变成拖拽箭头，防止拖快了鼠标样式闪烁
  document.body.style.cursor = `${type}-resize`
  
  const startX = e.clientX
  const startY = e.clientY
  const startW = panelWidth.value
  const startXPos = position.value.x
  const contentEl = panelRef.value.querySelector('.custom-content')
  const startH = contentEl.clientHeight

  const onResize = (ev) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY

    // 右边缘：直接增加宽度，最小宽度限制改为 60
    if (resizeType.includes('e')) { 
      panelWidth.value = Math.max(60, startW + dx)
    }
    
    // 左边缘：保证右侧边界绝对不动，向左衍生，最小宽度限制改为 60
    if (resizeType.includes('w')) { 
      let newW = startW - dx
      if (newW < 60) newW = 60 
      
      panelWidth.value = newW
      // 核心修复：X坐标 = 原始右边界(startXPos + startW) - 新的宽度
      position.value.x = startXPos + startW - newW 
    }
    
    // 下边缘：改变高度
    if (resizeType.includes('s')) { 
      contentHeight.value = Math.max(40, startH + dy) + 'px'
    }
  }

  const stopResize = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)
    // 恢复全局光标
    document.body.style.cursor = 'default'
  }

  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

const startDrag = (e) => {
  isDragging.value = true
  dragOffset.x = e.clientX - position.value.x
  dragOffset.y = e.clientY - position.value.y
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

const stopDrag = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

onMounted(() => {
  // 初始位置检查
  setTimeout(() => {
    if (!panelRef.value) return
    if (position.value.x + panelWidth.value > window.innerWidth) {
      position.value.x = window.innerWidth - panelWidth.value - 20
    }
  }, 100)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div v-show="isVisible" ref="panelRef"
       class="float-panel absolute flex flex-col bg-[#21252b]/95 backdrop-blur border border-[#3b4453] rounded shadow-2xl z-40"
       :class="{ 'shadow-blue-500/40 border-blue-500/50 z-50': isDragging || isResizing }"
       :style="{ left: position.x + 'px', top: position.y + 'px', width: panelWidth + 'px' }">
    
    <div class="h-8 bg-[#181a1f] flex items-center justify-between px-2 cursor-move select-none border-b border-[#111215]"
         @mousedown.stop="startDrag">
      <span class="text-[11px] font-bold text-gray-300 tracking-tighter whitespace-nowrap">{{ title }}</span>
      <div class="flex gap-1.5 items-center ml-2">
        <button @click.stop="isMinimized = !isMinimized" class="w-2.5 h-2.5 rounded-full bg-[#e5c07b] hover:bg-yellow-400 transition-colors"></button>
        <button @click.stop="isVisible = false" class="w-2.5 h-2.5 rounded-full bg-[#e06c75] hover:bg-red-400 transition-colors"></button>
      </div>
    </div>
    
    <div v-show="!isMinimized" class="custom-content p-2 text-white overflow-y-auto overflow-x-hidden custom-scrollbar relative" :style="{ height: contentHeight }">
      <slot></slot>
    </div>

    <template v-if="!isMinimized">
      <div class="absolute top-0 -right-1 w-2 h-full cursor-e-resize z-50" @mousedown="startResize($event, 'e')"></div>
      <div class="absolute top-0 -left-1 w-2 h-full cursor-w-resize z-50" @mousedown="startResize($event, 'w')"></div>
      <div class="absolute -bottom-1 left-0 h-2 w-full cursor-s-resize z-50" @mousedown="startResize($event, 's')"></div>
      <div class="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-[51]" @mousedown="startResize($event, 'se')"></div>
      <div class="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize z-[51]" @mousedown="startResize($event, 'sw')"></div>
    </template>
  </div>
</template>

<style scoped>
.float-panel {
  transition: box-shadow 0.2s, border-color 0.2s;
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #3b4453; border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #5c6370; }

/* 禁用内容区的某些交互，防止缩放时误触 */
.custom-content {
  user-select: none;
  max-height: calc(100vh - 180px);
}
</style>