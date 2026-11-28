import type { Config } from 'tailwindcss';

// Token lấy từ design system "Cyberpunk Neon Red HUD" (Stitch project 7952075426934119946) — xem
// .claude/designs/WEB-PORTAL.DESIGN.md. Không hardcode hex trong component; dùng các token dưới đây.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bề mặt (Elevation: Floor 0 → 2)
        void: '#050507',
        panel: '#0d0b10',
        module: '#140d12',
        wire: '#33212b',
        // Tín hiệu chính: Neon Crimson
        neon: { DEFAULT: '#ff1e42', soft: '#ff4d6d', deep: '#b91c1c', glow: '#ff0037' },
        // Vàng = tiền / số dư; xanh lá = trạng thái tốt (LIVE, thắng)
        gold: { DEFAULT: '#f59e0b', light: '#fbbf24' },
        ai: { DEFAULT: '#10b981', soft: '#34d399', deep: '#059669' },
        // Chữ phụ / nhãn telemetry
        slate: { hud: '#94a3b8' },
        // Hạt B / P / T trên bảng kết quả
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'neon-sm': '0 0 10px rgba(255, 30, 66, 0.45)',
        'neon-md': '0 0 18px rgba(255, 30, 66, 0.55)',
        'neon-lg': '0 0 28px rgba(255, 30, 66, 0.65)',
        bloom: '0 0 8px rgba(255, 30, 66, 0.8), 0 0 24px rgba(255, 30, 66, 0.4), 0 0 48px rgba(255, 30, 66, 0.2)',
      },
      keyframes: {
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-40px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(50px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        bannerFadeIn: { '0%': { opacity: '0', transform: 'translateY(-24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        cardFadeSlideDown: { '0%': { opacity: '0', transform: 'translateY(-20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        entranceSlideDown: { '0%': { opacity: '0', transform: 'translateY(-60px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        // Hiệu ứng thoát dùng keyframe (không dùng transition): transition không chạy khi vừa gỡ animation `vào`.
        exitMenu: { '0%': { opacity: '1', transform: 'translateX(0)' }, '100%': { opacity: '0', transform: 'translateX(-80px)' } },
        exitCard: { '0%': { opacity: '1', transform: 'translateX(0)' }, '100%': { opacity: '0', transform: 'translateX(80px)' } },
        drawerInRight: { '0%': { opacity: '0.6', transform: 'translateX(100%)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        drawerOutRight: { '0%': { opacity: '1', transform: 'translateX(0)' }, '100%': { opacity: '0.6', transform: 'translateX(100%)' } },
        drawerInTop: { '0%': { opacity: '0.6', transform: 'translateY(-100%)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        drawerOutTop: { '0%': { opacity: '1', transform: 'translateY(0)' }, '100%': { opacity: '0.6', transform: 'translateY(-100%)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeOut: { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        exitHero: { '0%': { opacity: '1', transform: 'translateY(0)' }, '100%': { opacity: '0', transform: 'translateY(-50px)' } },
        notifyShake: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '10%, 30%': { transform: 'scale(1.03) rotate(-1.5deg)' },
          '20%, 40%': { transform: 'scale(1.03) rotate(1.5deg)' },
          '50%': { transform: 'scale(1)' },
        },
        livePulse: { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.8', transform: 'scale(1.04)' } },
        shimmerSweep: { '0%': { left: '-120%' }, '100%': { left: '200%' } },
        arrowLeft: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-4px)' } },
        arrowRight: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(4px)' } },
        ripple: { '0%': { transform: 'scale(0)', opacity: '1' }, '100%': { transform: 'scale(4)', opacity: '0' } },
        radarSpin: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        radarPulse: { '0%, 100%': { opacity: '0.3', transform: 'scale(0.98)' }, '50%': { opacity: '0.8', transform: 'scale(1.02)' } },
        blipFade1: {
          '0%, 15%': { opacity: '0', transform: 'scale(0.5)' },
          '20%': { opacity: '1', transform: 'scale(1.2)' },
          '50%': { opacity: '0.2', transform: 'scale(0.8)' },
          '100%': { opacity: '0' },
        },
        blipFade2: {
          '0%, 50%': { opacity: '0' },
          '55%': { opacity: '1', transform: 'scale(1.3)' },
          '80%': { opacity: '0.3' },
          '100%': { opacity: '0' },
        },
        // Trang chi tiết NỔ HŨ (Stitch "Dự đoán Nổ Hũ")
        gaugePulse: {
          '0%, 100%': { filter: 'drop-shadow(0 0 7px rgba(0,255,102,0.75)) drop-shadow(0 0 14px rgba(0,255,170,0.3))', opacity: '0.95' },
          '50%': { filter: 'drop-shadow(0 0 16px rgba(0,255,102,1)) drop-shadow(0 0 28px rgba(0,255,200,0.65))', opacity: '1' },
        },
        counterPulse: {
          '0%, 100%': { textShadow: '0 0 12px rgba(255,255,255,0.7), 0 0 25px rgba(0,255,102,0.4)' },
          '50%': { textShadow: '0 0 20px rgba(255,255,255,0.95), 0 0 40px rgba(0,255,102,0.75)' },
        },
        endpointPing: { '0%': { transform: 'scale(1)', opacity: '0.9' }, '100%': { transform: 'scale(3.2)', opacity: '0' } },
        barGrow: { '0%': { transform: 'scaleY(0)', opacity: '0.1' }, '70%': { transform: 'scaleY(1.05)' }, '100%': { transform: 'scaleY(1)', opacity: '1' } },
        luckyRowIn: { '0%': { opacity: '0', transform: 'translateX(32px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        luckyBtnClick: {
          '0%, 70%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '78%': { transform: 'scale(0.92)', filter: 'brightness(1.3) drop-shadow(0 0 35px rgba(251,191,36,0.9))' },
          '85%': { transform: 'scale(1.04)', filter: 'brightness(1.1)' },
          '92%': { transform: 'scale(0.99)' },
        },
        luckyShockwave: { '0%, 75%': { transform: 'scale(1)', opacity: '0' }, '78%': { transform: 'scale(1)', opacity: '0.9' }, '100%': { transform: 'scale(1.45)', opacity: '0' } },
        nudgeLeft: { '0%, 100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(-16px)' } },
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slideInRight 0.65s cubic-bezier(0.16, 1, 0.3, 1) both',
        'banner-in': 'bannerFadeIn 1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'card-in': 'cardFadeSlideDown 0.65s cubic-bezier(0.16, 1, 0.3, 1) both',
        'entrance-down': 'entranceSlideDown 0.85s cubic-bezier(0.16, 1, 0.3, 1) both',
        'exit-menu': 'exitMenu 0.4s cubic-bezier(0.4, 0, 0.2, 1) both',
        'exit-card': 'exitCard 0.4s cubic-bezier(0.4, 0, 0.2, 1) both',
        'drawer-in-right': 'drawerInRight 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'drawer-out-right': 'drawerOutRight 0.24s cubic-bezier(0.4, 0, 1, 1) both',
        'drawer-in-top': 'drawerInTop 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'drawer-out-top': 'drawerOutTop 0.24s cubic-bezier(0.4, 0, 1, 1) both',
        'fade-in': 'fadeIn 0.24s ease-out both',
        'fade-out': 'fadeOut 0.24s ease-in both',
        'exit-hero': 'exitHero 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
        'notify-shake': 'notifyShake 4s ease-in-out infinite',
        'live-pulse': 'livePulse 1.8s infinite',
        'shimmer-sweep': 'shimmerSweep 1.2s ease-in-out infinite',
        'arrow-left': 'arrowLeft 0.8s ease-in-out infinite alternate',
        'arrow-right': 'arrowRight 0.8s ease-in-out infinite alternate',
        'btn-ripple': 'ripple 0.6s linear forwards',
        'radar-spin': 'radarSpin 2.2s linear infinite',
        'radar-pulse': 'radarPulse 3s ease-in-out infinite',
        'blip-1': 'blipFade1 2.2s ease-out infinite',
        'blip-2': 'blipFade2 2.2s ease-out infinite',
        'gauge-pulse': 'gaugePulse 2.8s ease-in-out infinite',
        'counter-pulse': 'counterPulse 2.8s ease-in-out infinite',
        'endpoint-ping': 'endpointPing 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
        'bar-grow': 'barGrow 0.85s cubic-bezier(0.16, 1, 0.3, 1) both',
        'lucky-row-in': 'luckyRowIn 0.5s ease-out both',
        'lucky-btn-click': 'luckyBtnClick 2.6s ease-in-out infinite',
        'lucky-shockwave': 'luckyShockwave 2.6s cubic-bezier(0.1, 0.8, 0.3, 1) infinite',
        'nudge-left': 'nudgeLeft 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
