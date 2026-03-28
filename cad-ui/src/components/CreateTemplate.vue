<script setup>
import { ref, shallowRef, provide, onMounted, onUnmounted, watch } from 'vue'
import FeatureTree from './FeatureTree.vue'
import Workspace3D from '../components/Workspace3D.vue'
import FloatPanel from '../components/FloatPanel.vue'
const toolHubInstance = shallowRef(null)
provide('toolHub', toolHubInstance)
const emit = defineEmits(['back', 'add-log'])


// === 工具函数：安全解析数学表达式 (重构：支持前置符号相对计算，精度 3 位) ===
const calcMath = (val, fallback) => {
  try {
    let expr = String(val).trim();
    // 如果首字符是数学符号，自动拼接原数值实现相对运算（例如原值 100，输入 +50，变成 100+50）
    if (/^[+\-*/]/.test(expr)) {
      expr = String(fallback) + expr;
    }
    // 过滤掉所有乱七八糟的非数字/非符号输入
    expr = expr.replace(/[^0-9+\-*/.()]/g, '');
    if (!expr) return fallback;
    const res = new Function('return ' + expr)();
    // 保证 0.001 的极高工业精度
    return isNaN(res) ? fallback : Number(res.toFixed(3));
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
const fileInput = ref(null);
const featureList = ref([])      // 存储左侧树列表
const selectedIds = ref([])

const syncTree = () => {
  if (toolHubInstance.value) {
    featureList.value = toolHubInstance.value.getFeatureList();
    selectedIds.value = (toolHubInstance.value.tools.select.selectedObjects || []).map(o => o.uuid);
  }
}

const handleExport = () => {
  if (toolHubInstance.value && toolHubInstance.value.templateManager) {
    toolHubInstance.value.templateManager.exportToFile();
    handleSystemLog('[系统] 模板保存成功 (.smcad)');
  }
}
const triggerImport = () => {
  if (fileInput.value) fileInput.value.click();
}
const handleImport = (event) => {
  const file = event.target.files[0];
  if (!file || !toolHubInstance.value) return;

  toolHubInstance.value.templateManager.importFromFile(
    file, 
    (fileName) => {
      handleSystemLog(`[系统] 成功导入模板: ${fileName}`);
      syncTree(); 
      event.target.value = ''; 
    },
    () => handleSystemLog('[系统错误] 模板文件损坏或格式错误')
  );
}

let syncTimer = null;
onMounted(() => { syncTimer = setInterval(syncTree, 200); })
onUnmounted(() => { if (syncTimer) clearInterval(syncTimer); })

const handleTreeSelect = (uuid) => toolHubInstance.value?.selectByUuid(uuid);
const handleTreeVisible = (uuid) => { toolHubInstance.value?.toggleObjectVisible(uuid); syncTree(); };
const handleTreeLock = (uuid) => { toolHubInstance.value?.toggleObjectLock(uuid); syncTree(); };
const bendParams = ref({
  length: 100, width: 0, angle: 90, isGrooved: true, direction: 1 
})

// 【新增】：矩形基板工具的状态，并绑定向底层的发送事件
const rectParams = ref({ plane: 'XZ', width: '', height: '' });
const onRectParamChange = () => {
  updateTrigger.value = { type: 'rect_cmd', ...rectParams.value };
}
// 【新增】：启动放置预览模式
const startRectPreview = () => {
  const w = parseFloat(rectParams.value.width);
  const h = parseFloat(rectParams.value.height);
  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    alert('请先在上方固定宽度(W)和固定高度(H)中输入有效数值！');
    return;
  }
  updateTrigger.value = { type: 'rect_cmd', action: 'preview', width: w, height: h };
  commandHistory.value.push(`[系统] 进入矩形印章放置模式，鼠标点击放置，按 Esc 键取消`);
}
const handleObjectSelected = (data) => {
  if (!data) {
    selectedData.value = null;
    return;
  }
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    selectedData.value = {
      ...first,             
      isMultiple: true,
      count: data.length,
      _rawArray: data       
    };
    commandHistory.value.push(`[系统] 选中了 ${data.length} 个特征`);
  } else {
    selectedData.value = { ...data, isMultiple: false };
  }
}

const onPropertyChange = () => {
  if (selectedData.value) {
    const target = selectedData.value.isMultiple ? selectedData.value._rawArray : selectedData.value;
    updateTrigger.value = { target: target, data: { ...selectedData.value } };
  }
}

const deleteSelectedEntity = () => {
  if (!selectedData.value) return
  deleteSignal.value = Date.now()
  const deletedId = selectedData.value.id.substring(0, 8)
  selectedData.value = null
  commandHistory.value.push(`[系统] 实体 ${deletedId} 已删除`)
}

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
    updateTrigger.value = { type: 'bend_preview', ...bendParams.value, edge: selectedEdge.value }
  }
}

const confirmBend = () => {
  if (!selectedEdge.value) return;
  confirmBendSignal.value = Date.now();
  commandHistory.value.push(`[系统] 执行折弯: 长度${bendParams.value.length}, 角度${bendParams.value.angle}°`);
  selectedEdge.value = null; 
}

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
    offset: (Number(mirrorState.value.offset) || 0) / 2 
  };
  commandHistory.value.push(`[系统] 执行镜像, 基准:${mirrorState.value.dimMode === 'outer' ? '外径' : '内径'}, 间距/直径:${mirrorState.value.offset}mm`);
}

const cornerState = ref({ count: 0, gap: 0.1 });
watch(() => cornerState.value.gap, (newGap) => {
  if (cornerState.value.count === 2 && activeTool.value === 'corner') {
    updateTrigger.value = { 
      type: 'corner_param_change', 
      gap: Number(calcMath(String(newGap), cornerState.value.gap)) 
    };
  }
});
const executeCorner = () => {
  updateTrigger.value = { type: 'corner_cmd', action: 'execute', gap: Number(cornerState.value.gap) };
  commandHistory.value.push(`[系统] 边角处理完成，预留接缝间隙：${cornerState.value.gap}mm`);
}

const handleWeldUpdated = (data) => {
  if (data.count !== undefined) cornerState.value.count = data.count; 
  if (data.step) weldState.value.step = data.step;
  if (data.edgeLength) uiState.value.weldParams.width = Number(data.edgeLength.toFixed(1));
}

const onWeldParamChange = () => {
  updateTrigger.value = { type: 'weld_cmd', action: 'preview', params: uiState.value.weldParams };
}

const executeWeld = () => {
  updateTrigger.value = { type: 'weld_cmd', action: 'execute' };
  weldState.value.step = 'select';
  commandHistory.value.push(`[系统] 焊接新板生成成功`);
}

// 工业级干涉检查
const isAutoCheck = ref(false);

const handleCheckInterference = () => {
  if (toolHubInstance.value) {
    isAutoCheck.value = !isAutoCheck.value; // 切换开关状态
    toolHubInstance.value.autoCheckInterference = isAutoCheck.value; // 同步给底层

    if (!isAutoCheck.value) {
      toolHubInstance.value.clearInterference();
      handleSystemLog('[系统] 已关闭实时干涉检查，红光预警已清除。');
    } else {
      const result = toolHubInstance.value.checkInterference();
      if (result && result.hasError) {
        handleSystemLog(`[严重警告] 开启实时检测！当前检测到 ${result.count} 处板材重叠，已标红。`);
      } else {
        handleSystemLog('[系统] 开启实时检测。当前模型 0 干涉，完美可用。');
      }
    }
  }
}

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
  { id: 'select', name: '选择工具 (V)', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' },
  { id: 'rect', name: '绘制矩形 (R)', icon: 'M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z' },
  { id: 'weld', name: '添加焊板 (W)', icon: 'M4 7h16 M12 7v13 M9 20h6' },
  { id: 'bend', name: '添加折弯 (B)', icon: 'M6 4v10a4 4 0 004 4h10' },
  { id: 'mirror', name: '特征镜像 (M)', icon: 'M12 3v18 M7 9l-3 3 3 3 M17 9l3 3-3 3' },
  { id: 'corner', name: '边角处理 (C)', icon: 'M4 4h10l6 6v10H4z M14 4v6h6' }
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
      
      <div class="flex items-center gap-3">
        <button @click="handleCheckInterference" 
                class="px-4 py-2 text-sm font-bold rounded shadow transition-all active:scale-95 flex items-center gap-2 border"
                :class="isAutoCheck ? 'bg-red-600 text-white border-red-500 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : 'bg-[#2c313a] text-gray-300 border-[#3b4453] hover:bg-[#3b4453]'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          干涉检查
        </button>
        <input type="file" ref="fileInput" accept=".json,.smcad" class="hidden" @change="handleImport">
        <button @click="triggerImport" class="px-4 py-2 bg-[#2c313a] hover:bg-[#3b4453] text-gray-300 text-sm font-bold rounded shadow transition-all active:scale-95">导 入 模 板</button>
        <button @click="handleExport" class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg transition-all active:scale-95">保 存 模 板</button>
      </div>
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

    <FloatPanel title="特征管理器 (TREE)" :initialX="20" :initialY="80" :initialWidth="260">
      <FeatureTree 
        :objects="featureList" 
        :selectedIds="selectedIds"
        @select="handleTreeSelect"
        @toggle-visible="handleTreeVisible"
        @toggle-lock="handleTreeLock"
        class="h-full min-h-[300px]" 
      />
    </FloatPanel>

    <FloatPanel title="工具箱" :initialX="300" :initialY="80" :initialWidth="80">
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
            
            <template v-if="!selectedData.isMultiple">
              <div class="text-xs text-gray-500 uppercase mb-2">尺寸参数 (Dimensions)</div>
              <div v-for="p in ['width', 'height', 'thickness']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
                <span class="text-gray-400">{{ p === 'width' ? '宽度 W' : p === 'height' ? '长度 L' : '厚度 T' }}</span>
                <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
                  <input :value="selectedData[p]" 
                         @focus="$event.target.select()"
                         @change="e => { selectedData[p] = calcMath(e.target.value, selectedData[p]); onPropertyChange(); }" 
                         type="text" 
                         class="w-24 bg-transparent text-right text-gray-300 py-1.5 outline-none font-bold">
                  <span class="text-xs text-gray-600 ml-2">mm</span>
                </div>
              </div>
            </template>

            <div class="text-xs text-gray-500 uppercase mb-2 mt-4 pt-4 border-t border-[#3b4453]">空间位置 (World Position)</div>
            <div v-for="p in ['x', 'y', 'z']" :key="p" class="flex justify-between items-center text-sm mb-1.5">
              <span class="capitalize font-bold" 
                    :class="p === 'x' ? 'text-red-500' : p === 'y' ? 'text-green-500' : 'text-blue-500'">
                {{ p.toUpperCase() }} 轴
              </span>
              <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-blue-500/50 px-2 transition-all">
                <input :value="selectedData[p]" 
                       @focus="$event.target.select()"
                       @change="e => { selectedData[p] = calcMath(e.target.value, selectedData[p]); onPropertyChange(); }" 
                       type="text" 
                       :class="['w-24 bg-transparent text-right py-1.5 outline-none font-bold', 
                                p === 'x' ? 'text-red-400' : p === 'y' ? 'text-green-400' : 'text-blue-400']">
                <span class="text-xs text-gray-600 ml-2">mm</span>
              </div>
            </div>

          </div>
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
                <input :value="bendParams.length" @focus="$event.target.select()" @change="e => { bendParams.length = calcMath(e.target.value, bendParams.length); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
              </div>
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">沿边长度 (W)</span>
                <input :value="bendParams.width" @focus="$event.target.select()" @change="e => { bendParams.width = calcMath(e.target.value, bendParams.width); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
              </div>
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-400">折弯角度 (A)</span>
                <input :value="bendParams.angle" @focus="$event.target.select()" @change="e => { bendParams.angle = calcMath(e.target.value, bendParams.angle); onBendParamChange(); }" type="text" class="w-24 bg-[#2c313a] text-right text-yellow-400 px-2 py-1 rounded outline-none border border-transparent focus:border-yellow-500 font-bold">
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
                  <input :value="uiState.weldParams.height" @focus="$event.target.select()" @change="e => { uiState.weldParams.height = calcMath(e.target.value, uiState.weldParams.height); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
               </div>
               <div class="flex justify-between items-center text-sm mb-1.5">
                <span class="text-gray-400">焊接角度 (Deg)</span>
                <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-orange-500/50 px-2 transition-all">
                    <input :value="uiState.weldParams.angle" @focus="$event.target.select()" @change="e => { uiState.weldParams.angle = calcMath(e.target.value, uiState.weldParams.angle); onWeldParamChange(); }" type="text" class="w-20 bg-transparent text-right text-orange-400 py-1 outline-none font-bold">
                    <span class="text-[10px] text-gray-600 ml-1">°</span>
                </div>
              </div>
               <div class="flex justify-between items-center text-sm mb-1.5">
                  <span class="text-gray-400">沿边长度 (W)</span>
                  <input :value="uiState.weldParams.width" @focus="$event.target.select()" @change="e => { uiState.weldParams.width = calcMath(e.target.value, uiState.weldParams.width); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
               </div>
               <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-400">材料厚度 (T)</span>
                  <input :value="uiState.weldParams.thickness" @focus="$event.target.select()" @change="e => { uiState.weldParams.thickness = calcMath(e.target.value, uiState.weldParams.thickness); onWeldParamChange(); }" type="text" class="w-20 bg-[#2c313a] text-right text-orange-400 py-1 px-2 rounded outline-none font-bold">
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
                <input :value="mirrorState.offset" @focus="$event.target.select()" @change="e => { mirrorState.offset = calcMath(e.target.value, mirrorState.offset); }" type="text" class="w-full bg-transparent text-right text-purple-400 py-1.5 outline-none font-bold">
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

        <div v-else-if="activeTool === 'corner'" class="animate-in fade-in duration-200">
          <div class="flex items-center gap-3 text-rose-500 mb-5 bg-rose-500/10 p-3 rounded border border-rose-500/20">
            <span class="w-3 h-3 bg-rose-500 rounded-full animate-pulse"></span>
            <span class="text-sm font-bold tracking-wider uppercase">边角处理 (CORNER)</span>
          </div>

          <div class="space-y-4">
            <div class="p-3 rounded border transition-all bg-[#181a1f] border-[#3b4453]">
              <div class="text-sm font-bold flex justify-between">
                <span class="text-gray-400">请选择需拼角的干涉特征</span>
                <span :class="cornerState.count === 2 ? 'text-green-400' : 'text-gray-300'" class="text-xs bg-[#2c313a] px-2 py-0.5 rounded">
                  已选: {{ cornerState.count }} / 2
                </span>
              </div>
            </div>

            <div class="bg-[#181a1f] p-3 rounded border border-[#3b4453]">
              <div class="text-xs text-gray-500 mb-2">接缝间隙 (Gap Tolerance)</div>
              <div class="flex items-center bg-[#2c313a] rounded border border-transparent focus-within:border-rose-500/50 px-2 transition-all">
                <input :value="cornerState.gap" @focus="$event.target.select()" @change="e => { cornerState.gap = calcMath(e.target.value, cornerState.gap); }" type="text" class="w-full bg-transparent text-right text-rose-400 py-1.5 outline-none font-bold">
                <span class="text-xs text-gray-600 ml-2">mm</span>
              </div>
            </div>

            <button @click="executeCorner"
                    :disabled="cornerState.count !== 2"
                    :class="[cornerState.count !== 2 ? 'opacity-30 cursor-not-allowed bg-gray-700' : 'bg-rose-600 hover:bg-rose-500 active:scale-95']"
                    class="w-full mt-4 py-3 text-white text-sm font-bold rounded shadow-lg transition-all flex items-center justify-center gap-2">
              执行 45° 切角 (Slice)
            </button>
          </div>
        </div>

        <div v-else-if="activeTool === 'rect'" class="animate-in fade-in duration-200">
          <div class="flex items-center gap-3 text-[#3b82f6] mb-4 bg-[#3b82f6]/10 p-3 rounded border border-[#3b82f6]/20">
            <span class="w-3 h-3 bg-[#3b82f6] rounded-full animate-pulse"></span>
            <span class="text-sm font-bold uppercase tracking-wider">绘制特征 (DRAW RECT)</span>
          </div>

          <div class="space-y-4 bg-[#181a1f] p-4 rounded border border-[#3b4453]">
            <div class="text-xs text-gray-500 mb-2 uppercase">基准面朝向 (Drawing Plane)</div>
            <div class="flex gap-2 mb-5">
              <button @click="rectParams.plane = 'XZ'; onRectParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', rectParams.plane === 'XZ' ? 'bg-blue-600 text-white' : 'bg-[#2c313a] text-gray-400 hover:bg-gray-600']">顶视 (XZ)</button>
              <button @click="rectParams.plane = 'XY'; onRectParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', rectParams.plane === 'XY' ? 'bg-blue-600 text-white' : 'bg-[#2c313a] text-gray-400 hover:bg-gray-600']">正视 (XY)</button>
              <button @click="rectParams.plane = 'YZ'; onRectParamChange()" :class="['flex-1 py-1.5 rounded text-xs font-bold transition-all', rectParams.plane === 'YZ' ? 'bg-blue-600 text-white' : 'bg-[#2c313a] text-gray-400 hover:bg-gray-600']">侧视 (YZ)</button>
            </div>

            <div class="text-xs text-gray-500 mb-2 pt-4 border-t border-[#3b4453] uppercase">锁定尺寸 (Fixed Dim)</div>
            <div class="flex justify-between items-center text-sm mb-1.5">
              <span class="text-gray-400">固定宽度 (W)</span>
              <input v-model="rectParams.width" @focus="$event.target.select()" @change="onRectParamChange" type="text" placeholder="留空则跟随鼠标" class="w-24 bg-[#2c313a] text-right text-blue-400 py-1.5 px-2 rounded outline-none font-bold border border-transparent focus:border-blue-500/50 transition-all placeholder:text-[10px]">
            </div>
            <div class="flex justify-between items-center text-sm mb-4">
              <span class="text-gray-400">固定高度 (H)</span>
              <input v-model="rectParams.height" @focus="$event.target.select()" @change="onRectParamChange" type="text" placeholder="留空则跟随鼠标" class="w-24 bg-[#2c313a] text-right text-blue-400 py-1.5 px-2 rounded outline-none font-bold border border-transparent focus:border-blue-500/50 transition-all placeholder:text-[10px]">
            </div>

            <div class="flex justify-between items-center text-sm pt-4 border-t border-[#3b4453]">
              <span class="text-gray-400">材料厚度 (T)</span>
              <div class="flex items-center">
                <input :value="globalThickness" @focus="$event.target.select()" @change="e => { globalThickness = calcMath(e.target.value, globalThickness); }" type="text" class="w-16 bg-[#2c313a] border border-transparent focus:border-blue-500/50 rounded text-right text-blue-400 text-sm py-1 font-bold outline-none transition-all">
                <span class="text-xs text-gray-600 ml-2 font-mono">mm</span>
              </div>
            </div>
          </div>
          
          <button @click="startRectPreview"
                  class="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            生成放置块 (PLACE)
          </button>
          
          <div class="mt-4 p-4 rounded bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/60 leading-relaxed">
            操作提示：<br>
            1. 在视图中 <span class="text-blue-400 font-bold">拖拽左键</span> 绘制<br>
            2. 或输入上方锁死尺寸后点击 <span class="text-blue-400 font-bold">生成放置块</span> 连续放置。<br>
            3. 操作中随时按 <span class="text-red-400 font-bold">Esc键</span> 即可取消并清除屏幕。
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