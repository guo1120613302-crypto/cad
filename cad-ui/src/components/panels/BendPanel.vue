<script setup>
const props = defineProps({
  selectedEdge: { type: [Object, Boolean, null], default: null },
  bendParams: { type: Object, required: true }
})

const emit = defineEmits(['update-params', 'confirm'])

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

const updateField = (field, event) => {
  const newVal = calcMath(event.target.value, props.bendParams[field]);
  emit('update-params', { ...props.bendParams, [field]: newVal });
}

const toggleGroove = (event) => {
  emit('update-params', { ...props.bendParams, isGrooved: event.target.checked });
}

const flipDirection = () => {
  emit('update-params', { ...props.bendParams, direction: props.bendParams.direction * -1 });
}
</script>

<template>
  <div class="animate-in fade-in duration-200">
    <div v-if="selectedEdge">
      <div class="flex items-center gap-3 text-yellow-500 mb-5 bg-yellow-500/10 p-3 rounded border border-yellow-500/20">
        <span class="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></span>
        <span class="text-sm font-bold">折弯参数 (BENDING)</span>
      </div>
      <div class="space-y-4 bg-[#181a1f] p-4 rounded border border-[#3b4453]">
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-400">拉伸长度 (L)</span>
          <input :value="bendParams.length" @focus="$event.target.select()" @change="updateField('length', $event)" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-400">沿边长度 (W)</span>
          <input :value="bendParams.width" @focus="$event.target.select()" @change="updateField('width', $event)" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-400">折弯角度 (A)</span>
          <input :value="bendParams.angle" @focus="$event.target.select()" @change="updateField('angle', $event)" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-400">工艺：刨槽 (V-Cut)</span>
          <input type="checkbox" :checked="bendParams.isGrooved" @change="toggleGroove" class="w-5 h-5 accent-yellow-500">
        </div>
        <button @click="flipDirection" class="w-full py-2 mt-2 text-xs bg-[#2c313a] text-gray-300 rounded border border-gray-600 hover:bg-gray-600 transition-colors">
          反转折弯方向 (Flip)
        </button>
      </div>
      <button @click="emit('confirm')" class="bg-yellow-600 hover:bg-yellow-500 active:scale-95 w-full mt-6 py-3 text-white text-sm font-bold rounded shadow-lg transition-all">
        生成折弯实体
      </button>
    </div>
    
    <div v-else class="h-48 flex items-center justify-center border border-dashed border-yellow-500/20 rounded-lg">
      <span class="text-sm text-yellow-500/60 uppercase tracking-widest">请在 3D 视图中点击一条边</span>
    </div>
  </div>
</template>