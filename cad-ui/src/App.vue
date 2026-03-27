<script setup>
import { ref } from 'vue'
import LoginView from './views/LoginView.vue'
import WorkspaceView from './views/WorkspaceView.vue'

const isLogged = ref(false)
</script>

<template>
  <div :class="isLogged ? 'bg-white' : 'bg-[#212830]'" class="h-screen w-screen flex items-center justify-center transition-colors duration-500">
    
    <div v-if="!isLogged" class="p-4 w-full flex justify-center">
      <LoginView @login-success="isLogged = true" />
    </div>

    <WorkspaceView v-else />

  </div>
</template>