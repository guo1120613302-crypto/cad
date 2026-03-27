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

// --- 1. 强化版吸附系统 (保持之前逻辑) ---
const onDrag = (e) => {
  if (!isDragging.value || !panelRef.value) return
  let newX = e.clientX - dragOffset.x
  let newY = e.clientY - dragOffset.y

  const snapThreshold = 15 
  const screenW = window.innerWidth
  const screenH = window.innerHeight
  const selfW = panelRef.value.offsetWidth
  const selfH = panelRef.value.offsetHeight

  if (newX < snapThreshold) newX = 0
  if (newX > screenW - selfW - snapThreshold) newX = screenW - selfW
  if (newY < 40 + snapThreshold) newY = 40 
  if (newY > screenH - 128 - selfH - snapThreshold) newY = screenH - 128 - selfH 

  const allPanels = document.querySelectorAll('.float-panel')
  allPanels.forEach(other => {
    if (other === panelRef.value || other.style.display === 'none') return
    const rect = other.getBoundingClientRect()
    if (Math.abs(newX - rect.right) < snapThreshold) newX = rect.right
    if (Math.abs(newX + selfW - rect.left) < snapThreshold) newX = rect.left - selfW
    if (Math.abs(newY - rect.bottom) < snapThreshold) newY = rect.bottom
    if (Math.abs(newY + selfH - rect.top) < snapThreshold) newY = rect.top - selfH
  })

  position.value = { x: newX, y: newY }
}

// --- 2. 核心：全边缘缩放系统 ---
const startResize = (e, type) => {
  e.stopPropagation()
  isResizing.value = true
  resizeType = type
  
  const startX = e.clientX
  const startY = e.clientY
  const startW = panelWidth.value
  const startXPos = position.value.x
  const contentEl = panelRef.value.querySelector('.custom-content')
  const startH = contentEl.clientHeight

  const onResize = (ev) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY

    // 根据拖动的边缘执行不同的数学逻辑
    if (resizeType.includes('e')) { // 右边缘
      panelWidth.value = Math.max(150, startW + dx)
    }
    if (resizeType.includes('w')) { // 左边缘 (需要同时改变 X 坐标)
      const targetW = Math.max(150, startW - dx)
      if (targetW > 150) {
        panelWidth.value = targetW
        position.value.x = startXPos + dx
      }
    }
    if (resizeType.includes('s')) { // 下边缘
      contentHeight.value = Math.max(40, startH + dy) + 'px'
    }
  }

  const stopResize = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onResize)
    window.removeEventListener('mouseup', stopResize)
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
    
    <div v-show="!isMinimized" class="custom-content p-2 text-white overflow-y-auto custom-scrollbar relative" :style="{ height: contentHeight }">
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
}
</style>