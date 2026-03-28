<script setup>
import { ref } from 'vue'

const props = defineProps({
  selectedData: { type: Object, default: null }
})

const emit = defineEmits(['property-change'])

const calcMath = (val, fallback) => {
  try {
    let expr = String(val).trim();
    if (/^[+\-*/]/.test(expr)) expr = String(fallback) + expr;
    expr = expr.replace(/[^0-9+\-*/.()]/g, '');
    if (!expr) return fallback;
    const res = new Function('return ' + expr)();
    return isNaN(res) ? fallback : Number(res.toFixed(3));
  } catch (e) {
    return fallback;
  }
}

const handleChange = (field, event) => {
  if (!props.selectedData) return;
  const newVal = calcMath(event.target.value, props.selectedData[field]);
  const updatedData = { ...props.selectedData, [field]: newVal };
  const target = props.selectedData.isMultiple ? props.selectedData._rawArray : updatedData;
  emit('property-change', { target, data: updatedData });
}
</script>

<template>
  <div v-if="selectedData" class="animate-in fade-in slide-in-from-right-2 duration-200">
    <div v-if="selectedData.isMultiple" class="mb-4 px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded text-[11px] text-cyan-400 leading-relaxed">
      <div class="flex items-center gap-2 mb-1">
        <span class="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
        <span class="font-bold uppercase">多选对齐模式</span>
      </div>
      已选中 {{ selectedData.count }} 个特征。修改坐标将使所有特征在空间内“对齐”到该数值。
    </div>
      
    <div class="flex items-center gap-3 text-[#3b82f6] mb-4 bg-[#3b82f6]/10 p-3 rounded border border-[#3b82f6]/20">
      <span class="w-3 h-3 bg-[#3b82f6] rounded-full animate-pulse"></span>
      <span class="text-sm font-bold tracking-wider uppercase">特性详情 (PROPERTIES)</span>
    </div>

    <div class="space-y-3 bg-[#181a1f] p-4 rounded border border-[#3b4453]">
      <template v-if="!selectedData.isMultiple">
        <div class="text-xs text-gray-500 uppercase mb-2">尺寸参数 (Dimensions)</div>
        <div v-for="p in ['width', 'height', 'thickness']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
          <span class="text-gray-400">{{ p === 'width' ? '宽度 W' : p === 'height' ? '长度 L' : '厚度 T' }}</span>
          <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
            <input :value="selectedData[p]" @focus="$event.target.select()" @change="handleChange(p, $event)" type="text" class="w-24 bg-transparent text-right text-gray-300 py-1.5 outline-none font-bold">
            <span class="text-xs text-gray-600 ml-2">mm</span>
          </div>
        </div>
      </template>

      <div class="text-xs text-gray-500 uppercase mb-2 mt-4 pt-4 border-t border-[#3b4453]">空间位置 (World Position)</div>
      <div v-for="p in ['x', 'y', 'z']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
        <span class="capitalize font-bold" :class="p === 'x' ? 'text-red-500' : p === 'y' ? 'text-green-500' : 'text-blue-500'">{{ p.toUpperCase() }} 轴</span>
        <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
          <input :value="selectedData[p]" @focus="$event.target.select()" @change="handleChange(p, $event)" type="text" :class="['w-24 bg-transparent text-right py-1.5 outline-none font-bold', p === 'x' ? 'text-red-400' : p === 'y' ? 'text-green-400' : 'text-blue-400']">
          <span class="text-xs text-gray-600 ml-2">mm</span>
        </div>
      </div>
    </div>
  </div>
</template>