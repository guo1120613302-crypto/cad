<script setup>
import { ref, onMounted } from 'vue'
import Workspace3D from '../components/Workspace3D.vue'
import FloatPanel from '../components/FloatPanel.vue'

const emit = defineEmits(['back', 'add-log'])

// === 工具函数：安全解析数学表达式 ===
const calcMath = (val, fallback) => {
  try {
    let expr = String(val).replace(/[^0-9+\-*/.()]/g, '');
    if (!expr) return fallback;
    const res = new Function('return ' + expr)();
    return isNaN(res) ? fallback : Number(res.toFixed(2));
  } catch (e) {
    return fallback;
  }
}
const handleSystemLog = (msg) => {
  commandHistory.value.push(msg)
  setTimeout(() => {
    const el = document.getElementById('cmd-history')
    if (el) el.scrollTop = el.scrollHeight
  }, 50)
}


// === 全局状态 ===
const activeTool = ref('select')   
const globalThickness = ref('1.5') 
const selectedData = ref(null)     
const updateTrigger = ref(null)    
const deleteSignal = ref(0)       

// === 各工具专属状态 ===
const selectedEdge = ref(null)
const confirmBendSignal = ref(0)   
const mirrorState = ref({ step: 'targets', count: 0, hasRef: false, dimMode: 'outer', offset: 0 })
const weldState = ref({ step: 'select', edgeLength: 0 })
const uiState = ref({
  thickness: globalThickness.value,
  weldParams: { height: 50, width: 0, thickness: 1.5, overlap: 'outer', angle: 90 }
})

const bendParams = ref({
  length: 100,
  width: 0, 
  angle: 90,
  isGrooved: true,
  direction: 1 
})

// === 系统交互逻辑 ===
const handleObjectSelected = (data) => {
  if (!data) {
    selectedData.value = null;
    return;
  }

  // 如果是多选数组
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    selectedData.value = {
      ...first,             // 借用第一个物体的坐标显示在输入框里
      isMultiple: true,
      count: data.length,
      _rawArray: data       // 存下原始数组供更新使用
    };
    commandHistory.value.push(`[系统] 选中了 ${data.length} 个特征`);
  } else {
    selectedData.value = { ...data, isMultiple: false };
  }
}

const onPropertyChange = () => {
  if (selectedData.value) {
    // 如果是多选，将原始数组和修改后的数据一起发给底层
    const target = selectedData.value.isMultiple ? selectedData.value._rawArray : selectedData.value;
    updateTrigger.value = { 
        target: target, 
        data: { ...selectedData.value } 
    };
  }
}

const deleteSelectedEntity = () => {
  if (!selectedData.value) return
  deleteSignal.value = Date.now()
  const deletedId = selectedData.value.id.substring(0, 8)
  selectedData.value = null
  commandHistory.value.push(`[系统] 实体 ${deletedId} 已删除`)
}

// === 折弯工具逻辑 ===
const handleEdgeSelected = (edgeData) => {
  selectedEdge.value = edgeData;
  if (edgeData.length) {
    bendParams.value.width = Number(edgeData.length.toFixed(1));
  }
  commandHistory.value.push(`[折弯] 已捕获基准边`);
  onBendParamChange(); 
}

const onBendParamChange = () => {
  if (selectedEdge.value) {
    updateTrigger.value = { 
      type: 'bend_preview', 
      ...bendParams.value, 
      edge: selectedEdge.value 
    }
  }
}

const confirmBend = () => {
  if (!selectedEdge.value) return;
  confirmBendSignal.value = Date.now();
  commandHistory.value.push(`[系统] 执行折弯: 长度${bendParams.value.length}, 角度${bendParams.value.angle}°`);
  selectedEdge.value = null; 
}

// === 镜像工具逻辑 ===
const handleMirrorUpdated = (state) => {
  mirrorState.value = { ...mirrorState.value, ...state };
}

const setMirrorStep = (step) => {
  updateTrigger.value = { type: 'mirror_cmd', action: 'setStep', step };
}

const executeMirror = () => {
  updateTrigger.value = { 
    type: 'mirror_cmd', 
    action: 'execute', 
    dimMode: mirrorState.value.dimMode,
    // 【修改这里】：将用户输入的直径除以 2，转换为平面的实际偏移半径
    offset: (Number(mirrorState.value.offset) || 0) / 2 
  };
  commandHistory.value.push(`[系统] 执行镜像, 基准:${mirrorState.value.dimMode === 'outer' ? '外径' : '内径'}, 间距/直径:${mirrorState.value.offset}mm`);
}

// === 焊接工具逻辑 ===
const handleWeldUpdated = (data) => {
  weldState.value.step = data.step;
  if (data.edgeLength) {
    uiState.value.weldParams.width = Number(data.edgeLength.toFixed(1));
  }
}

const onWeldParamChange = () => {
  updateTrigger.value = { type: 'weld_cmd', action: 'preview', params: uiState.value.weldParams };
}

const executeWeld = () => {
  updateTrigger.value = { type: 'weld_cmd', action: 'execute' };
  weldState.value.step = 'select';
  commandHistory.value.push(`[系统] 焊接新板生成成功`);
}

// === 命令行与 UI 配置 ===
const commandInput = ref('')
const commandHistory = ref(['钣金模拟台 V1.0 已启动', '等待操作...'])

const handleCommand = () => {
  if (!commandInput.value.trim()) return
  const cmd = commandInput.value.toUpperCase()
  commandHistory.value.push(`> ${cmd}`)
  if (cmd === 'REC' || cmd === 'RECT') activeTool.value = 'rect'
  if (cmd === 'SEL' || cmd === 'SELECT') activeTool.value = 'select'
  if (cmd === 'MI' || cmd === 'MIRROR') activeTool.value = 'mirror'
  commandInput.value = ''
  setTimeout(() => {
    const el = document.getElementById('cmd-history')
    if (el) el.scrollTop = el.scrollHeight
  }, 50)
}

const tools = ref([
  { id: 'select', name: '选择工具 (V)', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
  { id: 'rect', name: '绘制矩形 (R)', icon: 'M4 4h16v16H4z' },
  { id: 'weld', name: '添加焊板 (W)', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'bend', name: '添加折弯 (B)', icon: 'M3 10h4v11m14-11h-4v11' },
  { id: 'mirror', name: '特征镜像 (M)', icon: 'M8 7h8M8 12h8M8 17h8M3 2v20l5-5V7L3 2zm18 0v20l-5-5V7l5-5z' }
])

const panelX = typeof window !== 'undefined' ? window.innerWidth - 340 : 1000;

const exitWorkspace = () => {
  emit('add-log', '用户退出工作台')
  emit('back')
}
</script>

<template>
  <div class="fixed inset-0 z-[99] bg-[#1e2227] font-mono overflow-hidden select-none flex flex-col">
    
    <header class="h-14 bg-[#21252b]/95 backdrop-blur border-b border-[#111215] flex items-center justify-between px-6 z-40">
      <div class="flex items-center gap-4">
        <button @click="exitWorkspace" class="text-gray-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          退出
        </button>
        <span class="text-gray-600">|</span>
        <span class="font-bold text-gray-200 text-sm tracking-widest uppercase">Sheet Metal Sim V1.0</span>
      </div>
      <button class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg transition-all active:scale-95">
        保 存 模 板
      </button>
    </header>

    <div class="absolute inset-0 z-0 pt-14 pb-40">
      <Workspace3D 
        :thickness="globalThickness" 
        :activeTool="activeTool" 
        :updateData="updateTrigger"
        :deleteSignal="deleteSignal" 
        :confirmBendSignal="confirmBendSignal"
        @object-selected="handleObjectSelected"
        @edge-selected="handleEdgeSelected"
        @mirror-updated="handleMirrorUpdated"
        @weld-updated="handleWeldUpdated"
        @system-log="handleSystemLog" 
      />
    </div>

    <FloatPanel title="工具箱" :initialX="20" :initialY="80" :initialWidth="80">
      <div class="flex flex-col gap-5 items-center py-2">
        <button v-for="tool in tools" :key="tool.id" 
                @click="activeTool = tool.id"
                :class="['p-3 rounded-lg transition-all group relative', 
                         activeTool === tool.id ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'text-gray-500 hover:bg-[#2c313a] hover:text-gray-200 border border-transparent']"
                :title="tool.name">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" :d="tool.icon"></path></svg>
        </button>
      </div>
    </FloatPanel>

    <FloatPanel title="特性检查器" :initialX="panelX" :initialY="80" :initialWidth="320">
      <div class="space-y-6 pointer-events-auto">
        
        <div v-if="activeTool === 'select' && selectedData" class="animate-in fade-in slide-in-from-right-2 duration-200">
  
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
    <div class="text-xs text-gray-500 uppercase mb-2">空间位置 (World Position)</div>
    <div v-for="p in ['x', 'y', 'z']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
      <span class="text-gray-400 capitalize">{{ p.toUpperCase() }} 轴</span>
      <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
        <input :value="selectedData[p]" 
               @change="e => { selectedData[p] = calcMath(e.target.value, selectedData[p]); onPropertyChange(); }" 
               type="text" 
               class="w-24 bg-transparent text-right text-green-400 py-1.5 outline-none font-bold">
        <span class="text-xs text-gray-600 ml-2">mm</span>
      </div>
    </div>

    <template v-if="!selectedData.isMultiple">
      <div class="text-xs text-gray-500 uppercase mb-2 mt-4 pt-4 border-t border-[#3b4453]">尺寸参数 (Dimensions)</div>
      <div v-for="p in ['width', 'height', 'thickness']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
        <span class="text-gray-400">{{ p === 'width' ? '宽度 W' : p === 'height' ? '长度 L' : '厚度 T' }}</span>
        <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
          <input :value="selectedData[p]" 
                 @change="e => { selectedData[p] = calcMath(e.target.value, selectedData[p]); onPropertyChange(); }" 
                 type="text" 
                 class="w-24 bg-transparent text-right text-blue-400 py-1.5 outline-none font-bold">
          <span class="text-xs text-gray-600 ml-2">mm</span>
        </div>
      </div>
    </template>
  </div>

  <button @click="deleteSelectedEntity" 
          class="w-full mt-6 py-3 bg-red-500/10 text-red-500 text-xs font-bold rounded border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all flex items-center justify-center gap-2">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
    删除选中特征 (DELETE)
  </button>
</div>

        <div v-else-if="activeTool === 'bend'">
          <div v-if="selectedEdge" class="animate-in fade-in duration-200">
            <div class="flex items-center gap-3 text-yellow-500 mb-5 bg-yellow-500/10 p-3 rounded border border-yellow-500/20">
              <span class="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></span>
              <span class="text-sm font-bold">折弯参数 (BENDING)</span>
            </div>

            <div class="space-y-4 bg-[#181a1f] p-4 rounded border border-[#3b4453]">
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">拉伸长度 (L)</span>
                <input :value="bendParams.length" @change="e => { bendParams.length = calcMath(e.target.value, bendParams.length); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
              </div>
              
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">沿边长度 (W)</span>
                <input :value="bendParams.width" @change="e => { bendParams.width = calcMath(e.target.value, bendParams.width); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
              </div>

              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">折弯角度 (A)</span>
                <input :value="bendParams.angle" @change="e => { bendParams.angle = calcMath(e.target.value, bendParams.angle); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
              </div>
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">工艺：刨槽 (V-Cut)</span>
                <input type="checkbox" v-model="bendParams.isGrooved" @change="onBendParamChange" class="w-5 h-5 accent-yellow-500">
              </div>
              <button @click="bendParams.direction *= -1; onBendParamChange()" class="w-full py-2 mt-2 text-xs bg-[#2c313a] text-gray-300 rounded border border-gray-600 hover:bg-gray-600 transition-colors">
                反转折弯方向 (Flip)
              </button>
            </div>

            <button @click="confirmBend" 
                    :disabled="!selectedEdge"
                    :class="[!selectedEdge ? 'opacity-30 cursor-not-allowed bg-gray-700' : 'bg-yellow-600 hover:bg-yellow-500 active:scale-95']"
                    class="w-full mt-6 py-3 text-white text-sm font-bold rounded shadow-lg transition-all">
              生成折弯实体
            </button>
          </div>
          <div v-else class="h-48 flex items-center justify-center border border-dashed border-yellow-500/20 rounded-lg">
            <span class="text-sm text-yellow-500/60 uppercase tracking-widest">请在 3D 视图中点击一条边</span>
          </div>
        </div>

        <div v-else-if="activeTool === 'weld'" class="animate-in fade-in duration-200">
          <div class="flex items-center gap-3 text-orange-400 mb-5 bg-orange-400/10 p-3 rounded border border-orange-400/20">
            <span class="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></span>
            <span class="text-sm font-bold tracking-wider uppercase">添加焊板 (WELD)</span>
          </div>

          <div v-if="weldState.step === 'select'" class="text-xs text-gray-400 text-center py-8 border border-dashed border-gray-600 rounded">
            请在 3D 视图中点击任意一条基准边
          </div>

          <div v-else class="space-y-4">
            <div class="bg-[#181a1f] p-3 rounded border border-[#3b4453]">
              <div class="text-xs text-gray-500 mb-2">搭接方式 (Overlap Type)</div>
              <div class="flex gap-2">
                <button @click="uiState.weldParams.overlap = 'outer'; onWeldParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', uiState.weldParams.overlap === 'outer' ? 'bg-orange-500 text-white' : 'bg-[#2c313a] text-gray-400']">包外皮 (2包1)</button>
                <button @click="uiState.weldParams.overlap = 'inner'; onWeldParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', uiState.weldParams.overlap === 'inner' ? 'bg-orange-500 text-white' : 'bg-[#2c313a] text-gray-400']">包内皮 (1包2)</button>
                <button @click="uiState.weldParams.overlap = 'flush'; onWeldParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', uiState.weldParams.overlap === 'flush' ? 'bg-orange-500 text-white' : 'bg-[#2c313a] text-gray-400']">平齐对拼</button>
              </div>
            </div>

            <div class="bg-[#181a1f] p-3 rounded border border-[#3b4453]">
               <div class="text-xs text-gray-500 mb-2">挤出尺寸</div>
               <div class="flex justify-between items-center text-sm mb-1.5">
                  <span class="text-gray-400">拉伸长度 (H)</span>
                  <input :value="uiState.weldParams.height" @change="e => { uiState.weldParams.height = calcMath(e.target.value, uiState.weldParams.height); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
               </div>
               <div class="flex justify-between items-center text-sm mb-1.5">
                <span class="text-gray-400">焊接角度 (Deg)</span>
                <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-orange-500/50 px-2 transition-all">
                    <input :value="uiState.weldParams.angle" @change="e => { uiState.weldParams.angle = calcMath(e.target.value, uiState.weldParams.angle); onWeldParamChange(); }" type="text" class="w-20 bg-transparent text-right text-orange-400 py-1 outline-none font-bold">
                    <span class="text-[10px] text-gray-600 ml-1">°</span>
                </div>
              </div>
               <div class="flex justify-between items-center text-sm mb-1.5">
                  <span class="text-gray-400">沿边长度 (W)</span>
                  <input :value="uiState.weldParams.width" @change="e => { uiState.weldParams.width = calcMath(e.target.value, uiState.weldParams.width); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
               </div>
               <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-400">材料厚度 (T)</span>
                  <input :value="uiState.weldParams.thickness" @change="e => { uiState.weldParams.thickness = calcMath(e.target.value, uiState.weldParams.thickness); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
               </div>
            </div>

            <button @click="executeWeld" class="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded shadow-lg transition-all active:scale-95">
              确认生成焊板
            </button>
          </div>
        </div>

        <div v-else-if="activeTool === 'mirror'" class="animate-in fade-in duration-200">
          <div class="flex items-center gap-3 text-purple-500 mb-5 bg-purple-500/10 p-3 rounded border border-purple-500/20">
            <span class="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></span>
            <span class="text-sm font-bold tracking-wider uppercase">特征镜像 (MIRROR)</span>
          </div>

          <div class="space-y-4">
            <div @click="setMirrorStep('targets')"
                 :class="['p-3 rounded border transition-all cursor-pointer', mirrorState.step === 'targets' ? 'bg-purple-500/20 border-purple-500/50' : 'bg-[#181a1f] border-[#3b4453] hover:border-gray-500']">
              <div class="text-sm font-bold flex justify-between">
                <span :class="mirrorState.step === 'targets' ? 'text-purple-400' : 'text-gray-400'">1. 选择被镜像特征</span>
                <span class="text-xs bg-[#2c313a] px-2 py-0.5 rounded text-gray-300">已选: {{ mirrorState.count }}</span>
              </div>
            </div>

            <div @click="setMirrorStep('reference')"
                 :class="['p-3 rounded border transition-all cursor-pointer', mirrorState.step === 'reference' ? 'bg-green-500/20 border-green-500/50' : 'bg-[#181a1f] border-[#3b4453] hover:border-gray-500']">
              <div class="text-sm font-bold flex justify-between">
                <span :class="mirrorState.step === 'reference' ? 'text-green-400' : 'text-gray-400'">2. 选择基准对称面</span>
                <span v-if="mirrorState.hasRef" class="text-xs text-green-400 flex items-center gap-1">已绑定</span>
                <span v-else class="text-xs text-gray-500">未绑定</span>
              </div>
            </div>

            <div class="bg-[#181a1f] p-3 rounded border border-[#3b4453]">
              <div class="text-xs text-gray-500 mb-2">尺寸基准 (Dimension Mode)</div>
              <div class="flex gap-2">
                <button @click="mirrorState.dimMode = 'outer'"
                        :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', mirrorState.dimMode === 'outer' ? 'bg-purple-600 text-white' : 'bg-[#2c313a] text-gray-400 hover:bg-[#3b4453]']">
                  以外径为核心
                </button>
                <button @click="mirrorState.dimMode = 'inner'"
                        :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', mirrorState.dimMode === 'inner' ? 'bg-purple-600 text-white' : 'bg-[#2c313a] text-gray-400 hover:bg-[#3b4453]']">
                  以内径为核心
                </button>
              </div>
            </div>

            <div class="bg-[#181a1f] p-3 rounded border border-[#3b4453]">
              <div class="text-xs text-gray-500 mb-2">镜像平面偏移 (Offset)</div>
              <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-purple-500/50 px-2 transition-all">
                <input :value="mirrorState.offset" @change="e => { mirrorState.offset = calcMath(e.target.value, mirrorState.offset); }" type="text" class="w-full bg-transparent text-right text-purple-400 py-1.5 outline-none font-bold">
                <span class="text-xs text-gray-600 ml-2">mm</span>
              </div>
            </div>

            <button @click="executeMirror"
                    :disabled="mirrorState.count === 0 || !mirrorState.hasRef"
                    :class="[(mirrorState.count === 0 || !mirrorState.hasRef) ? 'opacity-30 cursor-not-allowed bg-gray-700' : 'bg-purple-600 hover:bg-purple-500 active:scale-95']"
                    class="w-full mt-4 py-3 text-white text-sm font-bold rounded shadow-lg transition-all flex items-center justify-center gap-2">
              执行镜像生成
            </button>
          </div>
        </div>
        
        <div v-else-if="activeTool === 'rect'" class="animate-in fade-in duration-200">
          <div class="text-sm font-bold text-gray-400 mb-4 px-3 border-l-4 border-blue-500 ml-1 uppercase">基准面参数 (BASE)</div>
          <div class="flex items-center justify-between p-4 bg-[#181a1f] rounded border border-[#3b4453] hover:border-blue-500/30 transition-colors">
            <span class="text-sm text-gray-500">默认板材厚度 (T)</span>
            <div class="flex items-center">
              <input :value="globalThickness" @change="e => { globalThickness = calcMath(e.target.value, globalThickness); }" type="text" class="w-16 bg-transparent text-right text-blue-400 text-sm font-bold outline-none">
              <span class="text-xs text-gray-600 ml-2 font-mono">mm</span>
            </div>
          </div>
          <div class="mt-5 p-4 rounded bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/60 leading-relaxed">
            提示：在 3D 空间拖拽左键绘制矩形，按回车键完成生成。
          </div>
        </div>

        <div v-else class="h-48 flex flex-col items-center justify-center border border-dashed border-[#3b4453] rounded-lg opacity-40">
          <svg class="w-10 h-10 mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"></path></svg>
          <span class="text-xs tracking-widest uppercase">等待选中实体...</span>
        </div>

      </div>
    </FloatPanel>

    <footer class="absolute bottom-0 left-0 right-0 h-40 bg-[#181a1f]/98 backdrop-blur border-t border-[#111215] flex flex-col z-40">
      <div id="cmd-history" class="flex-1 overflow-y-auto p-4 text-xs text-gray-500 font-mono scrollbar-hide">
        <div v-for="(line, idx) in commandHistory" :key="idx" class="mb-1.5 leading-relaxed">
          <span class="text-[#4b5263] mr-3">[{{ new Date().toLocaleTimeString() }}]</span>
          <span :class="line.startsWith('>') ? 'text-blue-400' : 'text-gray-400'">{{ line }}</span>
        </div>
      </div>
      <div class="h-12 bg-[#111215] flex items-center px-6 border-t border-[#21252b]">
        <span class="text-blue-500 text-xs mr-4 font-bold tracking-tighter uppercase">CMD ADMIN ></span>
        <input v-model="commandInput" @keyup.enter="handleCommand" 
               class="flex-1 bg-transparent outline-none text-gray-300 text-sm caret-blue-500" 
               placeholder="输入指令 (如: REC) 或点击左侧工具...">
      </div>
    </footer>

  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>