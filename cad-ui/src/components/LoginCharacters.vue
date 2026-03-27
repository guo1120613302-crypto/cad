<script setup>
import { reactive, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  focusType: { type: String, default: '' },
  isError: { type: Boolean, default: false }
})

const state = reactive({
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
  centerX: window.innerWidth / 2,
  centerY: window.innerHeight / 2
})

const onMouseMove = (e) => {
  state.mouseX = e.clientX
  state.mouseY = e.clientY
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', () => {
    state.centerX = window.innerWidth / 2
    state.centerY = window.innerHeight / 2
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
})

const eye = computed(() => {
  let targetX = state.mouseX
  let targetY = state.mouseY

  if (props.focusType === 'username') {
    targetX = state.centerX
    targetY = state.centerY + 400 
  } else if (props.focusType === 'password') {
    targetX = state.centerX + 500
    targetY = state.centerY - 500 
  }

  const dx = targetX - state.centerX
  const dy = targetY - state.centerY
  const angle = Math.atan2(dy, dx)
  const r = Math.min(3, Math.sqrt(dx * dx + dy * dy) / 50)

  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r
  }
})
</script>

<template>
  <div class="w-full h-44 relative mb-2 flex justify-center items-end pointer-events-none">
    
    <svg width="200" height="150" viewBox="0 0 200 150" class="overflow-visible">
      
      <defs>
        <clipPath id="baseline-clip">
          <rect x="-20" y="-50" width="240" height="200" />
        </clipPath>
      </defs>

      <g clip-path="url(#baseline-clip)">
        
        <g class="character char-purple" 
           style="transform-origin: 67px 150px;"
           :class="{ 'p-look-down': focusType === 'username', 'p-look-away': focusType === 'password' }">
          <g :class="{ 'shake-1': isError }">
            <rect x="40" y="20" width="55" height="130" fill="#6034FF" />
            <path d="M 55 50 Q 62 55 69 50" fill="none" stroke="#1A1A1A" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="52" cy="38" r="4.5" fill="white" />
            <circle :cx="52 + eye.x" :cy="38 + eye.y" r="2.5" fill="#1A1A1A" />
            <circle cx="72" cy="35" r="4.5" fill="white" />
            <circle :cx="72 + eye.x" :cy="35 + eye.y" r="2.5" fill="#1A1A1A" />
          </g>
        </g>

        <g class="character char-black" 
           style="transform-origin: 120px 150px;"
           :class="{ 'b-duck-down': focusType === 'username', 'b-hide-deep': focusType === 'password' }">
          <g :class="{ 'shake-2': isError }">
            <rect x="100" y="75" width="40" height="75" fill="#202125" />
            <circle cx="112" cy="90" r="4.5" fill="white" />
            <circle :cx="112 + eye.x" :cy="90 + eye.y" r="2.5" fill="#1A1A1A" />
            <circle cx="126" cy="92" r="4.5" fill="white" />
            <circle :cx="126 + eye.x" :cy="92 + eye.y" r="2.5" fill="#1A1A1A" />
          </g>
        </g>

        <g class="character char-yellow" 
           style="transform-origin: 165px 150px;"
           :class="{ 'y-lean-forward': focusType === 'username', 'y-turn-around': focusType === 'password' }">
          <g :class="{ 'shake-3': isError }">
            <path d="M 140 150 L 140 100 A 25 25 0 0 1 190 100 L 190 150 Z" fill="#E8BD19" />
            <line x1="140" y1="125" x2="158" y2="125" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round" />
            <circle v-if="focusType !== 'password'" :cx="172 + eye.x" :cy="110 + eye.y" r="3" fill="#1A1A1A" />
          </g>
        </g>

        <g class="character char-orange" 
           style="transform-origin: 65px 150px;"
           :class="{ 'o-squish-down': focusType === 'username', 'o-flat-close-eyes': focusType === 'password' }">
          <g :class="{ 'shake-4': isError }">
            <path d="M 0 150 A 65 65 0 0 1 130 150 Z" fill="#F77234" />
            
            <g v-if="focusType !== 'password'">
              <path d="M 45 125 Q 52 133 60 125" fill="none" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round" />
              <circle :cx="40 + eye.x" :cy="115 + eye.y" r="3.5" fill="#1A1A1A" />
              <circle :cx="65 + eye.x" :cy="115 + eye.y" r="3.5" fill="#1A1A1A" />
            </g>
            
            <g v-else>
              <path d="M 47 128 Q 52 130 57 128" fill="none" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round" />
              <path d="M 33 115 Q 38 110 43 115" fill="none" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round" />
              <path d="M 60 115 Q 65 110 70 115" fill="none" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round" />
            </g>
          </g>
        </g>

      </g>
    </svg>
  </div>
</template>

<style scoped>
/* 核心躯干的平滑过渡 */
.character {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.char-purple { transition-delay: 0s; }
.char-black  { transition-delay: 0.04s; }
.char-orange { transition-delay: 0.08s; }
.char-yellow { transition-delay: 0.12s; }

/* === 账号聚焦 === */
.p-look-down  { transform: scaleY(0.95) translateY(5px); }
.b-duck-down  { transform: scaleY(0.95) translateY(5px); }
.y-lean-forward { transform: translateX(-5px) rotate(-3deg); }
.o-squish-down  { transform: scaleX(1.02) scaleY(0.95); }

/* === 密码聚焦：收敛形变幅度，变得更温和、更自然 === */
/* 紫色：微微下沉并向后躲避 */
.p-look-away { transform: scaleY(0.9) translateY(10px) translateX(-5px); }
/* 黑色：半蹲，刚好露出眼睛偷看 */
.b-hide-deep { transform: translateY(28px) translateX(-3px); } 
/* 黄色：转过去 */
.y-turn-around { transform: scaleX(-1) translateX(-15px); } 
/* 橙色：轻轻闭眼并轻微缩放，不再压成大饼 */
.o-flat-close-eyes { transform: scaleX(1.05) scaleY(0.9) translateY(5px); }

/* === 相互独立的随机颤抖动画 === */
@keyframes shake-x {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* 不同的动画时长和延迟，制造出错乱、不受控制的恐慌感 */
.shake-1 { animation: shake-x 0.3s ease-in-out 2 0s; }
.shake-2 { animation: shake-x 0.22s ease-in-out 2 0.05s; }
.shake-3 { animation: shake-x 0.4s ease-in-out 2 0.02s; }
.shake-4 { animation: shake-x 0.35s ease-in-out 2 0.1s; }
</style>