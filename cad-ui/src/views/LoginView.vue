<script setup>
import { ref } from 'vue'
import LoginCharacters from '../components/LoginCharacters.vue'
import usersDB from '../mock/users.json'

const emit = defineEmits(['login-success'])

const currentFocus = ref('')
const isError = ref(false)

// 表单数据绑定
const account = ref('') 
const password = ref('')
const confirmPassword = ref('') 

// 状态控制：是否处于注册界面
const isRegistering = ref(false)

const triggerError = () => {
  isError.value = true
  setTimeout(() => isError.value = false, 600)
}

// 登录逻辑
const handleLogin = () => {
  const userMatch = usersDB.users.find(
    (u) => u.email === account.value && u.password === password.value
  )

  if (userMatch) {
    emit('login-success')
  } else {
    triggerError()
    password.value = '' 
  }
}

// 注册逻辑 (基于内存 Mock)
const handleRegister = () => {
  if (!account.value || !password.value) {
    triggerError()
    return
  }
  if (password.value !== confirmPassword.value) {
    triggerError()
    confirmPassword.value = ''
    return
  }
  if (usersDB.users.some(u => u.email === account.value)) {
    alert('该账号已被注册！') 
    triggerError()
    return
  }

  // 模拟写入数据库 (存入内存)
  usersDB.users.push({
    email: account.value, 
    password: password.value
  })

  alert('注册成功！请使用新账号登录。') 
  password.value = ''
  confirmPassword.value = ''
  isRegistering.value = false 
}
</script>

<template>
  <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;" 
       class="w-full max-w-[480px] bg-white p-12 rounded-[50px] shadow-2xl flex flex-col relative overflow-hidden transition-all duration-300">
    
    <LoginCharacters :focus-type="currentFocus" :is-error="isError" />

    <div class="text-center mb-8 text-[#1a1a1a]">
      <h1 class="text-[26px] font-black text-gray-900 mb-1 italic tracking-wide">
        {{ isRegistering ? 'Create an Account' : 'MODEL EXPANSION ' }}
      </h1>
      <p class="text-gray-400 text-xs tracking-widest font-bold italic">
        CAD Parametric Platform
      </p>
    </div>

    <div class="space-y-6">
      
      <div class="flex flex-col text-gray-900 font-medium">
        <label class="text-[11px] font-bold text-gray-400 ml-4 mb-1 tracking-widest">登录账号</label>
        <input type="text" placeholder="请输入账号" 
               v-model="account"
               @focus="currentFocus = 'username'" @blur="currentFocus = ''"
               class="w-full bg-[#f8f9fb] border-2 border-transparent rounded-2xl px-6 py-4 outline-none focus:border-indigo-100 focus:bg-white transition-all placeholder:text-gray-300">
      </div>

      <div class="flex flex-col text-gray-900 font-medium">
        <label class="text-[11px] font-bold text-gray-400 ml-4 mb-1 tracking-widest">密码</label>
        <input type="password" placeholder="••••••••" 
               v-model="password"
               @focus="currentFocus = 'password'" @blur="currentFocus = ''"
               @keyup.enter="isRegistering ? handleRegister() : handleLogin()"
               class="w-full bg-[#f8f9fb] border-2 border-transparent rounded-2xl px-6 py-4 outline-none focus:border-indigo-100 focus:bg-white transition-all placeholder:text-gray-300">
      </div>

      <div v-if="isRegistering" class="flex flex-col text-gray-900 font-medium animate-fade-in">
        <label class="text-[11px] font-bold text-gray-400 ml-4 mb-1 tracking-widest">确认密码</label>
        <input type="password" placeholder="请再次输入密码" 
               v-model="confirmPassword"
               @focus="currentFocus = 'password'" @blur="currentFocus = ''"
               @keyup.enter="handleRegister"
               class="w-full bg-[#f8f9fb] border-2 border-transparent rounded-2xl px-6 py-4 outline-none focus:border-indigo-100 focus:bg-white transition-all placeholder:text-gray-300">
      </div>

      <div class="pt-2">
        <button v-if="!isRegistering" @click="handleLogin" class="w-full bg-black hover:bg-gray-800 text-white font-bold py-5 rounded-[22px] shadow-xl transition-all active:scale-[0.98] tracking-widest text-lg">
          登 录
        </button>
        <button v-else @click="handleRegister" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-5 rounded-[22px] shadow-xl transition-all active:scale-[0.98] tracking-widest text-lg">
          立 即 注 册
        </button>

        <button v-if="!isRegistering" @click="isRegistering = true" class="w-full bg-white border-2 border-gray-100 hover:bg-gray-50 text-gray-700 font-bold py-4 rounded-2xl flex items-center justify-center transition-all mt-4 tracking-wider text-sm">
          注 册 新 账 号
        </button>
        <button v-else @click="isRegistering = false" class="w-full bg-white border-2 border-gray-100 hover:bg-gray-50 text-gray-700 font-bold py-4 rounded-2xl flex items-center justify-center transition-all mt-4 tracking-wider text-sm">
          返 回 登 录
        </button>
      </div>
    </div>

    <p class="text-center mt-8 text-xs text-gray-400 font-medium tracking-wide">
      系统技术支持：<span class="text-black font-bold cursor-pointer hover:underline">Hongye Tech</span>
    </p>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
</style>