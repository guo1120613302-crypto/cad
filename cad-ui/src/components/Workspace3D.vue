<script setup>
import { ref, reactive, inject, onMounted, onUnmounted, watch } from 'vue'
import { Stage } from '../core/Stage.js'
import { ToolHub } from '../core/ToolHub.js'
import DynamicInput from './DynamicInput.vue'



const props = defineProps({
  thickness: { type: [String, Number], default: '1.5' }, 
  activeTool: { type: String, default: 'select' },
  updateData: { type: Object, default: null },
  deleteSignal: { type: Number, default: 0 },
  confirmBendSignal: { type: Number, default: 0 }
})

const emit = defineEmits(['object-selected', 'edge-selected', 'mirror-updated', 'weld-updated', 'system-log']) 
const canvasContainer = ref(null)
const snapSettings = reactive({ grid: false, vertex: false })
const systemSettings = reactive({ autoCheck: false }) // 【新增】：智能干涉开关状态
const toolHubInstance = inject('toolHub')
let stage, toolHub

const toggleInterferenceCheck = () => {
  if (toolHub) {
    systemSettings.autoCheck = !systemSettings.autoCheck; // 切换状态
    toolHub.autoCheckInterference = systemSettings.autoCheck; // 同步给底层

    if (!systemSettings.autoCheck) {
       toolHub.clearInterference(); // 如果关闭，自动清除屏幕上的红光
    } else {
       toolHub.checkInterference(); // 如果开启，立刻手动执行一次全盘扫描
    }
  }
}

const dynamicUIState = reactive({
  visible: false, x: 0, y: 0,
  width: '0.0', height: '0.0',
  isWidthLocked: false, isHeightLocked: false,
  thickness: props.thickness,
  boxSelect: { visible: false, left: 0, top: 0, width: 0, height: 0, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' }
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
  
  // Ctrl+Z 撤销，Ctrl+Y (或 Shift+Ctrl+Z) 重做
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) {
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

  if (e.key === 'Escape') toolHub?.cancel()
  if (e.key === 'Enter' && dynamicUIState.visible) toolHub?.confirm()
  
  // 彻底屏蔽 Backspace，只保留 Delete 触发模型删除
  if (e.key === 'Delete') {
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
  
    if (toolHubInstance) {
    toolHubInstance.value = toolHub;
  }

  const canvas = stage.renderer.domElement
  window.addEventListener('resize', () => stage.onResize())
  window.addEventListener('keydown', handleGlobalKeyDown)
  
  canvas.addEventListener('mousedown', (e) => toolHub.dispatch('onMouseDown', e))
  canvas.addEventListener('mousemove', (e) => toolHub.dispatch('onMouseMove', e))
  canvas.addEventListener('mouseup', (e) => toolHub.dispatch('onMouseUp', e))
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  stage?.dispose()
  if (toolHubInstance) {
    toolHubInstance.value = null; // 安全销毁，斩断内存泄漏根源
  }
})
</script>

<template>
  <div ref="canvasContainer" class="w-full h-full relative cursor-crosshair overflow-hidden">
    <DynamicInput :uiState="dynamicUIState" @confirm="toolHub?.confirm()" @cancel="toolHub?.cancel()" />
    <div v-show="dynamicUIState.boxSelect.visible" 
         class="fixed pointer-events-none z-[9999]"
         :style="{ 
           left: dynamicUIState.boxSelect.left + 'px', 
           top: dynamicUIState.boxSelect.top + 'px', 
           width: dynamicUIState.boxSelect.width + 'px', 
           height: dynamicUIState.boxSelect.height + 'px',
           border: `1px solid ${dynamicUIState.boxSelect.color}`,
           backgroundColor: dynamicUIState.boxSelect.bg
         }">
    </div>
    <div class="absolute top-4 left-4 text-[9px] font-mono pointer-events-none select-none z-10 opacity-30">
      <p class="text-[#98c379]">CAD_CORE: ONLINE</p>
      <p class="mt-1 uppercase">MODE: {{ activeTool }}</p>
      <p class="mt-1 text-gray-500">Press [DEL] to delete</p>
    </div>

    <div class="absolute bottom-6 right-6 flex flex-col gap-2 z-10 select-none">
      <label class="flex items-center gap-2 text-xs text-gray-300 bg-[#222933] px-3 py-2 rounded border border-[#3b4453] cursor-pointer hover:bg-[#2a323d] transition-all shadow-lg shadow-black/20">
        <input type="checkbox" v-model="snapSettings.grid" @change="toolHub?.updateSnapSettings(snapSettings)" class="w-3.5 h-3.5 accent-blue-500 cursor-pointer">
        <span class="font-bold tracking-wider">网格捕捉 (10mm)</span>
      </label>
      <label class="flex items-center gap-2 text-xs text-gray-300 bg-[#222933] px-3 py-2 rounded border border-[#3b4453] cursor-pointer hover:bg-[#2a323d] transition-all shadow-lg shadow-black/20">
        <input type="checkbox" v-model="snapSettings.vertex" @change="toolHub?.updateSnapSettings(snapSettings)" class="w-3.5 h-3.5 accent-blue-500 cursor-pointer">
        <span class="font-bold tracking-wider">实体顶点捕捉</span>
      </label>
    </div>
  </div>
</template>