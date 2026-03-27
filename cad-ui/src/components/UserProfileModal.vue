<script setup>
import { ref, reactive } from 'vue'

const props = defineProps({
  show: Boolean,
  userInfo: Object
})

const emit = defineEmits(['close', 'save'])

// 深拷贝一份表单数据，避免还没点保存就直接修改了外面的数据
const formData = reactive({ ...props.userInfo })
const isUploading = ref(false)

// 模拟头像上传交互
const handleAvatarClick = () => {
  isUploading.value = true
  setTimeout(() => {
    alert('此处会调用系统文件选择器，先跳过~')
    isUploading.value = false
  }, 500)
}

const handleSave = () => {
  emit('save', { ...formData })
  emit('close')
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-md bg-[#222933] border border-[#3b4453] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
      
      <div class="flex items-center justify-between px-6 py-4 border-b border-[#3b4453] bg-[#212830]/50">
        <h3 class="text-sm font-bold text-white tracking-widest">个 人 设 置</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div class="p-6 space-y-6">
        
        <div class="flex flex-col items-center justify-center">
          <div @click="handleAvatarClick" 
               class="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-3xl shadow-lg border-2 border-[#3b4453] cursor-pointer group overflow-hidden">
            <span class="group-hover:opacity-0 transition-opacity">{{ formData.name.charAt(0) }}</span>
            <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
          </div>
          <span class="mt-2 text-[10px] text-gray-400 font-bold tracking-widest">{{ isUploading ? '正在打开文件...' : '点击更换头像' }}</span>
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 tracking-wider">用户名称</label>
            <input type="text" v-model="formData.name" class="w-full bg-[#212830] border border-[#3b4453] rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-gray-200 text-sm font-bold transition-all">
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 tracking-wider">登录邮箱</label>
            <input type="email" v-model="formData.email" class="w-full bg-[#212830] border border-[#3b4453] rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-gray-200 text-sm font-bold transition-all">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 tracking-wider">所属部门</label>
              <input type="text" v-model="formData.department" placeholder="如：工程部" class="w-full bg-[#212830] border border-[#3b4453] rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-gray-200 text-sm font-bold transition-all">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 tracking-wider">联系电话</label>
              <input type="text" v-model="formData.phone" placeholder="选填" class="w-full bg-[#212830] border border-[#3b4453] rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-gray-200 text-sm font-bold transition-all">
            </div>
          </div>
        </div>

      </div>

      <div class="px-6 py-4 bg-[#212830] border-t border-[#3b4453] flex justify-end gap-3">
        <button @click="emit('close')" class="px-5 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-[#3b4453] transition-all">
          取消
        </button>
        <button @click="handleSave" class="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-[0_2px_10px_rgba(37,99,235,0.3)] transition-all">
          保存修改
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>