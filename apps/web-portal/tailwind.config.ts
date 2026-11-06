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
        bead: { b: '#dc2626', p: '#2563eb', t: '#16a34a' },
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
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slideInRight 0.65s cubic-bezier(0.16, 1, 0.3, 1) both',
        'banner-in': 'bannerFadeIn 1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'card-in': 'cardFadeSlideDown 0.65s cubic-bezier(0.16, 1, 0.3, 1) both',
        'entrance-down': 'entranceSlideDown 0.85s cubic-bezier(0.16, 1, 0.3, 1) both',
        'exit-menu': 'exitMenu 0.4s cubic-bezier(0.4, 0, 0.2, 1) both',
        'exit-card': 'exitCard 0.4s cubic-bezier(0.4, 0, 0.2, 1) both',
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
      },
    },
  },
  plugins: [],
};

export default config;
