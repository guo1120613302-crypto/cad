<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  uiState: Object
})
const emit = defineEmits(['confirm', 'cancel'])

const wInput = ref(null)
const hInput = ref(null)

// 【新增】：安全数学计算解析器
const evalMath = (val) => {
  try {
    // 只保留数字、小数点和基础数学符号，防止恶意代码注入
    let expr = String(val).replace(/[^0-9+\-*/.()]/g, '');
    if (!expr) return 0;
    // 安全执行数学运算
    const res = new Function('return ' + expr)();
    return isNaN(res) ? 0 : Number(res.toFixed(2));
  } catch (e) {
    return 0;
  }
}

watch(() => props.uiState.visible, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      if (wInput.value) {
        wInput.value.focus()
        wInput.value.select()
      }
    }, 10) 
  }
})

const handleTab = (current) => {
  if (current === 'width') {
    // 离开前执行加减乘除计算
    props.uiState.width = evalMath(props.uiState.width)
    props.uiState.isWidthLocked = true
    setTimeout(() => { hInput.value?.focus(); hInput.value?.select() }, 10)
  } else {
    // 离开前执行加减乘除计算
    props.uiState.height = evalMath(props.uiState.height)
    props.uiState.isHeightLocked = true
    setTimeout(() => { wInput.value?.focus(); wInput.value?.select() }, 10)
  }
}

const handleEnter = () => {
  // 回车确认前，执行最终的数学运算
  props.uiState.width = evalMath(props.uiState.width)
  props.uiState.height = evalMath(props.uiState.height)
  emit('confirm')
}
const handleEsc = () => emit('cancel')
</script>

<template>
  <div v-show="uiState.visible" 
       class="absolute z-50 flex gap-1 pointer-events-auto shadow-lg bg-[#21252b] p-1 rounded border border-[#3b4453]"
       :style="{ left: uiState.x + 'px', top: uiState.y + 'px' }">
    
    <div class="flex items-center bg-[#181a1f] border border-[#3b4453]">
      <input ref="wInput" 
             v-model="uiState.width" 
             type="text"
             @keydown.tab.prevent="handleTab('width')" 
             @keydown.enter.prevent="handleEnter"
             @keydown.esc.prevent="handleEsc"
             @mousedown.stop
             class="w-16 bg-transparent text-white text-xs px-1 text-right outline-none focus:bg-[#3b82f6]/30">
    </div>
    
    <div class="flex items-center bg-[#181a1f] border border-[#3b4453]">
      <input ref="hInput" 
             v-model="uiState.height" 
             type="text"
             @keydown.tab.prevent="handleTab('height')" 
             @keydown.enter.prevent="handleEnter"
             @keydown.esc.prevent="handleEsc"
             @mousedown.stop
             class="w-16 bg-transparent text-gray-400 text-xs px-1 text-right outline-none focus:text-white focus:bg-[#3b82f6]/30">
    </div>
  </div>
</template>