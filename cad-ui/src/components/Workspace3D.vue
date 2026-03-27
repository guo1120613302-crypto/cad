<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { Stage } from '../core/Stage.js'
import { ToolHub } from '../core/ToolHub.js'
import DynamicInput from './DynamicInput.vue'

const props = defineProps({
  thickness: { type: String, default: '1.5' },
  activeTool: { type: String, default: 'select' },
  updateData: { type: Object, default: null },
  deleteSignal: { type: Number, default: 0 },
  confirmBendSignal: { type: Number, default: 0 }
})

// 【核心修改】：在 emits 数组里补上 'system-log'，用于向控制台输出撤销/重做日志
const emit = defineEmits(['object-selected', 'edge-selected', 'mirror-updated', 'weld-updated', 'system-log']) 
const canvasContainer = ref(null)

let stage, toolHub

const dynamicUIState = reactive({
  visible: false, x: 0, y: 0,
  width: '0.0', height: '0.0',
  isWidthLocked: false, isHeightLocked: false,
  thickness: props.thickness
})

watch(() => props.thickness, (val) => dynamicUIState.thickness = val)
watch(() => props.activeTool, (val) => toolHub?.switchTool(val))
watch(() => props.updateData, (newVal) => {
  if (newVal && toolHub) toolHub.updateEntity(newVal)
}, { deep: true })
watch(() => props.deleteSignal, () => toolHub?.deleteEntity())
watch(() => props.confirmBendSignal, () => toolHub?.finalizeBend())

const handleGlobalKeyDown = (e) => {
  // 防止在右侧输入框里敲字时触发了快捷键
  const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
  if (isTyping) return
  
  // 【新增核心功能】：Ctrl+Z 撤销，Ctrl+Y (或 Shift+Ctrl+Z) 重做
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
      // 兼容某些习惯用 Ctrl+Shift+Z 重做的用户
      const action = toolHub?.redo();
      if (action) emit('system-log', `[重做] ${action}`);
    } else {
      const action = toolHub?.undo();
      if (action) emit('system-log', `[撤销] ${action}`);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    const action = toolHub?.redo();
    if (action) emit('system-log', `[重做] ${action}`);
    return;
  }

  // 其他原有快捷键
  if (e.key === 'Escape') toolHub?.cancel()
  if (e.key === 'Enter' && dynamicUIState.visible) toolHub?.confirm()
  if (e.key === 'Delete' || (e.key === 'Backspace' && props.activeTool === 'select')) {
    toolHub?.deleteEntity()
  }
}

onMounted(() => {
  stage = new Stage(canvasContainer.value)
  
  toolHub = new ToolHub(
      stage, 
      dynamicUIState, 
      (data) => emit('object-selected', data),
      (data) => emit('edge-selected', data),
      (data) => emit('mirror-updated', data),
      (data) => emit('weld-updated', data) 
    )
  
  window.toolHub = toolHub // 【修复】：挂载到全局，让特征树能读取到数据

  const canvas = stage.renderer.domElement
  window.addEventListener('resize', () => stage.onResize())
  window.addEventListener('keydown', handleGlobalKeyDown)
  
  // 绑定鼠标事件到 ToolHub
  canvas.addEventListener('mousedown', (e) => toolHub.dispatch('onMouseDown', e))
  canvas.addEventListener('mousemove', (e) => toolHub.dispatch('onMouseMove', e))
  canvas.addEventListener('mouseup', (e) => toolHub.dispatch('onMouseUp', e))
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  stage?.dispose()
  window.toolHub = null // 【修复】：退出工作台时清理全局变量
})
</script>

<template>
  <div ref="canvasContainer" class="w-full h-full relative cursor-crosshair overflow-hidden">
    <DynamicInput :uiState="dynamicUIState" @confirm="toolHub.confirm()" @cancel="toolHub.cancel()" />
    
    <div class="absolute top-4 left-4 text-[9px] font-mono pointer-events-none select-none z-10 opacity-30">
      <p class="text-[#98c379]">CAD_CORE: ONLINE</p>
      <p class="mt-1 uppercase">MODE: {{ activeTool }}</p>
      <p class="mt-1 text-gray-500">Press [DEL] to delete</p>
    </div>
  </div>
</template>