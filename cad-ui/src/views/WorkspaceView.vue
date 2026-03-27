<script setup>
import { ref, reactive } from 'vue'
import UserProfileModal from '../components/UserProfileModal.vue'
import CreateTemplate from '../components/CreateTemplate.vue' // 引入我们刚写的建立模板组件

// 控制当前显示哪个界面的变量 (默认显示六宫格主面板)
const activeView = ref('dashboard') 

// 用户个人信息数据
const userInfo = reactive({
  name: 'Hongrui Admin',
  email: 'ceo@hongrui.com',
  department: '管理层',
  phone: ''
})

// 控制个人设置弹窗的显隐
const showProfileModal = ref(false)

// 模拟终端日志
const logs = ref([
  '> 欢迎使用智能模型展开插件...',
  '> 成功连接至 AutoCAD 进程 (PID: 14208)...',
  '> 用户鉴权成功，权限级别: Admin',
  '> 等待操作指令...'
])

const addLog = (msg) => {
  logs.value.push(`> ${msg}`)
  if (logs.value.length > 5) logs.value.shift()
}

// 模块点击事件模拟 (加入了真实切换逻辑)
const navigateTo = (moduleName) => {
  addLog(`正在加载模块: [${moduleName}] ...`)
  if (moduleName === '建立模板') {
    // 切换到建立模板界面
    activeView.value = 'createTemplate'
  } else {
    alert(`${moduleName} 模块正在开发中...`)
  }
}
</script>

<template>
  <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;" 
       class="w-full h-screen bg-[#212830] flex flex-col overflow-hidden text-gray-200">
    
    <header class="bg-[#222933] px-5 py-4 flex justify-between items-center shadow-md border-b border-[#3b4453] shrink-0">
      <div class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" 
           @click="showProfileModal = true"
           title="点击修改个人信息">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] border border-[#3b4453]">
          {{ userInfo.name.charAt(0) }}
        </div>
        <div class="flex flex-col">
          <span class="text-sm font-black text-white tracking-wide">{{ userInfo.name }}</span>
          <span class="text-[10px] text-gray-400 font-mono">{{ userInfo.email }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2 bg-[#212830] px-3 py-1.5 rounded-full border border-[#3b4453] cursor-help" title="AutoCAD 底层通信正常">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
        <span class="text-[10px] font-bold text-green-400 tracking-wider">CAD LINKED</span>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto p-5 space-y-6 flex flex-col justify-center relative">
      
      <div v-if="activeView === 'dashboard'" class="w-full h-full flex flex-col justify-center space-y-6 animate-fade-in-up">
        <div class="text-center mb-2">
          <h3 class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-1">System Modules</h3>
          <div class="h-1 w-10 bg-blue-500 rounded-full mx-auto"></div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <button @click="navigateTo('模板生成')" class="group relative flex flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 rounded-2xl shadow-[0_4px_15px_rgba(37,99,235,0.3)] transition-all active:scale-[0.96] border border-blue-400/30 overflow-hidden">
            <div class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <svg class="w-8 h-8 text-white mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            <span class="text-sm font-bold text-white tracking-widest">模板生成</span>
            <span class="text-[9px] text-blue-200 mt-1 opacity-80">一键调用生成3D</span>
          </button>

          <button @click="navigateTo('建立模板')" class="group flex flex-col items-center justify-center p-6 bg-[#222933] hover:bg-[#2a323d] rounded-2xl border-2 border-[#3b4453] hover:border-gray-400 transition-all active:scale-[0.96]">
            <svg class="w-8 h-8 text-gray-400 group-hover:text-white mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            <span class="text-sm font-bold text-gray-200 tracking-widest">建立模板</span>
          </button>

          <button @click="navigateTo('修改模板')" class="group flex flex-col items-center justify-center p-6 bg-[#222933] hover:bg-[#2a323d] rounded-2xl border-2 border-[#3b4453] hover:border-gray-400 transition-all active:scale-[0.96]">
            <svg class="w-8 h-8 text-gray-400 group-hover:text-white mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            <span class="text-sm font-bold text-gray-200 tracking-widest">修改模板</span>
          </button>

          <button @click="navigateTo('模板库')" class="group flex flex-col items-center justify-center p-6 bg-[#222933] hover:bg-[#2a323d] rounded-2xl border-2 border-[#3b4453] hover:border-gray-400 transition-all active:scale-[0.96]">
            <svg class="w-8 h-8 text-gray-400 group-hover:text-white mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            <span class="text-sm font-bold text-gray-200 tracking-widest">模板库</span>
          </button>

          <button @click="navigateTo('任务记录')" class="group flex flex-col items-center justify-center p-6 bg-[#222933] hover:bg-[#2a323d] rounded-2xl border-2 border-[#3b4453] hover:border-gray-400 transition-all active:scale-[0.96]">
            <svg class="w-8 h-8 text-gray-400 group-hover:text-white mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span class="text-sm font-bold text-gray-200 tracking-widest">任务记录</span>
          </button>

          <button @click="navigateTo('BOM报价')" class="group flex flex-col items-center justify-center p-6 bg-[#222933] hover:bg-[#2a323d] rounded-2xl border-2 border-[#3b4453] hover:border-gray-400 transition-all active:scale-[0.96]">
            <svg class="w-8 h-8 text-gray-400 group-hover:text-white mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <span class="text-sm font-bold text-gray-200 tracking-widest">BOM报价</span>
          </button>
        </div>
      </div>

      <CreateTemplate 
        v-else-if="activeView === 'createTemplate'" 
        @back="activeView = 'dashboard'" 
        @add-log="addLog" 
      />

    </main>

    <footer class="bg-[#212830] p-4 shrink-0 border-t border-[#3b4453] text-green-400 font-mono text-[10px] leading-relaxed shadow-[inset_0_4px_6px_rgba(0,0,0,0.2)]">
      <div v-for="(log, index) in logs" :key="index" class="opacity-80 hover:opacity-100 transition-opacity">
        {{ log }}
      </div>
      <div class="animate-pulse">_</div>
    </footer>

    <UserProfileModal 
      :show="showProfileModal" 
      :user-info="userInfo" 
      @close="showProfileModal = false"
      @save="(newData) => Object.assign(userInfo, newData)" 
    />

  </div>
</template>

<style scoped>
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>