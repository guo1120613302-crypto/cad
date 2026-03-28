<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  uiState: Object
})
const emit = defineEmits(['confirm', 'cancel'])

const wInput = ref(null)
const hInput = ref(null)

// 缓存用户点击输入框瞬间的基础值，用于相对运算
const baseValues = { width: 0, height: 0 }

const handleFocus = (field, event) => {
  // 1. 点击时全选文本
  event.target.select();
  // 2. 记录当前真实的值作为基础值
  const current = parseFloat(props.uiState[field]);
  if (!isNaN(current)) baseValues[field] = current;
}

// 【优化】：安全数学计算解析器（支持直接打 +50 进行相对运算，精度保留 3 位）
const evalMath = (val, base) => {
  try {
    let expr = String(val).trim();
    // 如果首字符是运算符号，则将基础值拼在前面
    if (/^[+\-*/]/.test(expr)) {
      expr = String(base) + expr;
    }
    // 过滤非法字符
    expr = expr.replace(/[^0-9+\-*/.()]/g, '');
    if (!expr) return base;
    
    const res = new Function('return ' + expr)();
    // 保留3位小数，并用 Number 抹除末尾多余的 0
    return isNaN(res) ? base : Number(res.toFixed(3));
  } catch (e) {
    return base;
  }
}

watch(() => props.uiState.visible, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      if (wInput.value) {
        wInput.value.focus()
        wInput.value.select()
        baseValues.width = parseFloat(props.uiState.width) || 0
      }
    }, 10) 
  }
})

const handleTab = (current) => {
  if (current === 'width') {
    props.uiState.width = evalMath(props.uiState.width, baseValues.width)
    props.uiState.isWidthLocked = true
    setTimeout(() => { 
      hInput.value?.focus(); 
      hInput.value?.select();
      baseValues.height = parseFloat(props.uiState.height) || 0
    }, 10)
  } else {
    props.uiState.height = evalMath(props.uiState.height, baseValues.height)
    props.uiState.isHeightLocked = true
    setTimeout(() => { 
      wInput.value?.focus(); 
      wInput.value?.select();
      baseValues.width = parseFloat(props.uiState.width) || 0
    }, 10)
  }
}

const handleEnter = () => {
  props.uiState.width = evalMath(props.uiState.width, baseValues.width)
  props.uiState.height = evalMath(props.uiState.height, baseValues.height)
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
             @focus="handleFocus('width', $event)"
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
             @focus="handleFocus('height', $event)"
             @keydown.tab.prevent="handleTab('height')" 
             @keydown.enter.prevent="handleEnter"
             @keydown.esc.prevent="handleEsc"
             @mousedown.stop
             class="w-16 bg-transparent text-gray-400 text-xs px-1 text-right outline-none focus:text-white focus:bg-[#3b82f6]/30">
    </div>
  </div>
</template>