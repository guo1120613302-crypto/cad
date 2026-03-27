<template>
    <div class="flex flex-col h-full bg-[#1e2227] select-none font-mono relative">
      
      <div class="p-2 border-b border-[#111215] flex gap-2 items-center">
        <input type="text" placeholder="搜索特征..." class="flex-1 bg-[#111215] text-[10px] text-gray-400 p-1.5 rounded outline-none border border-[#2c313a] focus:border-blue-500/50">
        <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded" title="特征总数">{{ objects.length }}</span>
      </div>
  
      <div class="flex-1 overflow-y-auto custom-scrollbar p-1 pb-12">
        <template v-for="item in objects" :key="item.uuid">
          
          <div v-if="item.isGroup" class="mb-1">
            <div @click="handleNodeClick(item, $event)" 
                 @dblclick="handleRename(item)"
                 :class="['flex items-center gap-1.5 px-2 py-1.5 rounded text-gray-300 border cursor-pointer transition-colors', 
                          activeNodeId === item.uuid ? 'bg-blue-600/30 border-blue-500' : 'bg-[#2c313a]/40 border-[#3b4453]/50 hover:bg-white/5']">
              
              <button @click.stop="toggleCollapse(item.uuid)" class="p-0.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white">
                <svg :class="['w-3.5 h-3.5 transition-transform duration-200', collapsedGroups.has(item.uuid) ? '-rotate-90' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
              </button>
  
              <svg class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              
              <input v-if="editingNodeId === item.uuid" v-model="editName" v-focus @blur="commitRename(item)" @keyup.enter="commitRename(item)" @keyup.esc="cancelRename" @click.stop class="flex-1 bg-[#111215] text-[11px] text-white px-1.5 py-0.5 rounded outline-none border border-blue-500 w-full">
              <span v-else class="flex-1 text-[11px] font-bold tracking-wider truncate" title="双击重命名">{{ item.name || getAutoName(item) }}</span>
            </div>
            
            <div v-show="!collapsedGroups.has(item.uuid)" class="ml-4 mt-0.5 border-l border-[#3b4453]/50 pl-1">
              <div v-for="child in item.children" :key="child.uuid" 
                   @click="handleNodeClick(child, $event)"
                   @dblclick="handleRename(child)"
                   :class="['flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 cursor-pointer transition-colors', 
                            selectedIds.includes(child.uuid) ? 'bg-blue-600/30 border-l-2 border-blue-500' : 'hover:bg-white/5 border-l-2 border-transparent']">
                <div class="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <svg v-if="child.userData.type === 'bend_flange'" class="w-3 h-3 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M3 10h4v11m14-11h-4v11"></path></svg>
                  <svg v-else-if="child.userData.type === 'weld_plate'" class="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  <svg v-else class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M4 4h16v16H4z"></path></svg>
                </div>
                <input v-if="editingNodeId === child.uuid" v-model="editName" v-focus @blur="commitRename(child)" @keyup.enter="commitRename(child)" @keyup.esc="cancelRename" @click.stop class="flex-1 bg-[#111215] text-[11px] text-white px-1.5 py-0.5 rounded outline-none border border-blue-500 w-full">
                <span v-else class="flex-1 text-[11px] truncate transition-colors" :class="[child.visible ? 'text-gray-300' : 'text-gray-600 line-through']" title="双击重命名">{{ child.name || getAutoName(child) }}</span>
              </div>
            </div>
          </div>
  
          <div v-else
               @click="handleNodeClick(item, $event)"
               @dblclick="handleRename(item)"
               :class="['flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 cursor-pointer transition-colors', 
                        selectedIds.includes(item.uuid) ? 'bg-blue-600/30 border-l-2 border-blue-500' : 'hover:bg-white/5 border-l-2 border-transparent']">
            <div class="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <svg v-if="item.userData.type === 'bend_flange'" class="w-3 h-3 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M3 10h4v11m14-11h-4v11"></path></svg>
              <svg v-else-if="item.userData.type === 'weld_plate'" class="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              <svg v-else class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M4 4h16v16H4z"></path></svg>
            </div>
            <input v-if="editingNodeId === item.uuid" v-model="editName" v-focus @blur="commitRename(item)" @keyup.enter="commitRename(item)" @keyup.esc="cancelRename" @click.stop class="flex-1 bg-[#111215] text-[11px] text-white px-1.5 py-0.5 rounded outline-none border border-blue-500 w-full">
            <span v-else class="flex-1 text-[11px] truncate transition-colors" :class="[item.visible ? 'text-gray-300' : 'text-gray-600 line-through']" title="双击重命名">{{ item.name || getAutoName(item) }}</span>
          </div>
  
        </template>
      </div>
  
      <div class="absolute bottom-0 left-0 right-0 p-2 border-t border-[#111215] bg-[#21252b] flex justify-end gap-2 z-10">
        <button @click="handleGroup" class="px-3 py-1.5 bg-[#2c313a] hover:bg-blue-600 text-xs font-bold text-gray-300 hover:text-white rounded border border-[#3b4453] transition-colors shadow-lg">
          新建编组
        </button>
        <button @click="handleDeleteSelected" class="px-3 py-1.5 bg-[#2c313a] hover:bg-red-600 text-xs font-bold text-gray-300 hover:text-white rounded border border-[#3b4453] transition-colors shadow-lg">
          删 除
        </button>
      </div>
  
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted, onUnmounted } from 'vue'
  
  const props = defineProps({
    objects: Array,
    selectedIds: Array
  })
  
  const activeNodeId = ref(null)
  const lastSelectedUuid = ref(null)
  
  const editingNodeId = ref(null)
  const editName = ref('')
  const vFocus = { mounted: (el) => el.focus() }
  
  // 【新增】：用 Set 结构记录已被折叠的组 UUID
  const collapsedGroups = ref(new Set())
  
  // 【新增】：折叠状态切换方法
  const toggleCollapse = (uuid) => {
    if (collapsedGroups.value.has(uuid)) {
      collapsedGroups.value.delete(uuid)
    } else {
      collapsedGroups.value.add(uuid)
    }
  }
  
  const getAutoName = (item) => {
    if (item.name) return item.name;
    if (item.isGroup) return `钣金组件_${item.uuid.substring(0, 4).toUpperCase()}`
    
    const type = item.userData?.type
    const id = item.uuid.substring(0, 4).toUpperCase()
    
    if (type === 'bend_flange') return `折弯板材_${id}`
    if (type === 'weld_plate') return `焊接板材_${id}`
    return `基础板材_${id}`
  }
  
  const getFlatParts = () => {
    const parts = []
    props.objects.forEach(obj => {
      if (!obj.isGroup) parts.push(obj)
      // 连选时，只计算“未被折叠”的组里面的子项，如果折叠了就不参与跨级连选
      if (obj.isGroup && obj.children && !collapsedGroups.value.has(obj.uuid)) {
        obj.children.forEach(child => parts.push(child))
      }
    })
    return parts
  }
  
  const handleNodeClick = (item, event) => {
    if (editingNodeId.value === item.uuid) return;
    
    activeNodeId.value = item.uuid;
  
    if (item.isGroup) {
      window.toolHub?.tools?.select?.deselectAll();
      return;
    }
  
    const selectTool = window.toolHub?.tools?.select;
    const targetMesh = window.toolHub?.stage?.scene?.getObjectByProperty('uuid', item.uuid);
    if (!selectTool || !targetMesh) return;
  
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;
  
    if (isShift && lastSelectedUuid.value) {
      const flatParts = getFlatParts();
      const startIdx = flatParts.findIndex(o => o.uuid === lastSelectedUuid.value);
      const endIdx = flatParts.findIndex(o => o.uuid === item.uuid);
  
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
  
        if (!isCtrl) selectTool.deselectAll(); 
  
        for (let i = min; i <= max; i++) {
          const mesh = window.toolHub.stage.scene.getObjectByProperty('uuid', flatParts[i].uuid);
          if (mesh && !selectTool.selectedObjects.includes(mesh)) {
            selectTool.selectMesh(mesh, true); 
          }
        }
      }
    } else if (isCtrl) {
      if (props.selectedIds.includes(item.uuid)) {
        selectTool.deselectMesh(targetMesh);
      } else {
        selectTool.selectMesh(targetMesh, true); 
      }
    } else {
      selectTool.deselectAll();
      selectTool.selectMesh(targetMesh, false);
    }
  
    lastSelectedUuid.value = item.uuid;
  }
  
  const handleRename = (item) => {
    editingNodeId.value = item.uuid;
    editName.value = item.name || getAutoName(item);
  }
  
  const commitRename = (item) => {
    if (editingNodeId.value === item.uuid) {
      const newName = editName.value.trim();
      if (newName !== '' && newName !== item.name) {
        window.toolHub?.renameFeature(item.uuid, newName);
      }
      editingNodeId.value = null; 
    }
  }
  
  const cancelRename = () => { editingNodeId.value = null; }
  
  const handleDeleteSelected = () => {
    const toDelete = new Set();
    if (activeNodeId.value) toDelete.add(activeNodeId.value);
    props.selectedIds.forEach(id => toDelete.add(id));
  
    if (toDelete.size === 0) {
      alert('请先选中要删除的图层或编组！');
      return;
    }
  
    if (confirm(`确定要删除选中的图层/编组吗？\n(注: 删除编组会将组内所有图层一并删除)`)) {
      toDelete.forEach(id => window.toolHub?.deleteFeature(id));
      activeNodeId.value = null; 
    }
  }
  
  const handleGroup = () => {
    const toGroup = new Set(props.selectedIds);
    if (activeNodeId.value && !toGroup.has(activeNodeId.value)) {
      const node = props.objects.find(o => o.uuid === activeNodeId.value) || 
                   props.objects.flatMap(o => o.children || []).find(c => c.uuid === activeNodeId.value);
      if (node && !node.isGroup) toGroup.add(activeNodeId.value);
    }
  
    if (toGroup.size < 2) {
      alert('请按住 Ctrl 或 Shift 键，至少选中两个独立的图层后再新建编组！')
      return
    }
    window.toolHub?.groupFeatures(Array.from(toGroup));
  }
  
  const handleKeyDown = (e) => {
    if (editingNodeId.value !== null) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (props.selectedIds.length > 0 || activeNodeId.value) {
        handleDeleteSelected();
      }
    }
  }
  
  onMounted(() => window.addEventListener('keydown', handleKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))
  </script>
  
  <style scoped>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #2c313a; border-radius: 2px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3b4453; }
  </style>