import { useEffect, useRef } from 'react'

const PALETTE = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#577590', '#9b5de5']
const MAX_PARTICLES = 1200

function rand(min, max) {
  return Math.random() * (max - min) + min
}

function spawnBurst(particles, width, height, count, originX, originY) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1)
    const speed = rand(300, 620)
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(4, 9),
      rotation: rand(0, Math.PI * 2),
      vr: rand(-6, 6),
      life: rand(1.15, 1.9),
      ttl: rand(1.15, 1.9),
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      shape: Math.random() > 0.5 ? 'rect' : 'circle'
    })
  }
  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES)
  }
}

export default function ConfettiCanvas({ active }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let rafId = 0
    let burstTimer = 0
    let lastTime = performance.now()
    let mounted = true
    const particles = []
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const launch = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      const w = window.innerWidth
      const h = window.innerHeight
      const burstCount = reduceMotion ? 8 : 10
      const particlesPerBurst = reduceMotion ? 80 : 100
      for (let i = 0; i < burstCount; i += 1) {
        const x = rand(w * 0.14, w * 0.86)
        const y = rand(h * 0.16, h * 0.34)
        spawnBurst(particles, w, h, particlesPerBurst, x, y)
      }
    }

    const tick = (now) => {
      if (!mounted) return
      if (typeof document !== 'undefined' && document.hidden) {
        lastTime = now
        rafId = window.requestAnimationFrame(tick)
        return
      }
      const dt = Math.min((now - lastTime) / 1000, 0.04)
      lastTime = now

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]
        p.vy += 980 * dt
        p.vx *= 0.995
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rotation += p.vr * dt
        p.life -= dt

        if (p.life <= 0 || p.y > window.innerHeight + 40) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.max(0, p.life / p.ttl)
        ctx.fillStyle = p.color

        if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.size * 0.5, -p.size * 0.26, p.size, p.size * 0.52)
        }

        ctx.restore()
      }

      rafId = window.requestAnimationFrame(tick)
    }

    resize()

    if (active) {
      launch()
      if (!reduceMotion) {
        burstTimer = window.setInterval(launch, 3000)
      }
      rafId = window.requestAnimationFrame(tick)
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }

    window.addEventListener('resize', resize)

    return () => {
      mounted = false
      window.removeEventListener('resize', resize)
      if (burstTimer) window.clearInterval(burstTimer)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [active])

  return <canvas className="confetti-canvas" ref={canvasRef} aria-hidden="true" />
}
