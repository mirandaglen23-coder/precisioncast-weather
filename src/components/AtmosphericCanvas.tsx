import React, { useEffect, useRef } from "react";

interface AtmosphericCanvasProps {
  weatherCode?: number;
  isDay?: boolean | number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  enabled?: boolean;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  length?: number;
  size?: number;
  opacity: number;
  angle?: number;
  vx?: number;
  vy?: number;
  twinkleSpeed?: number;
  phase?: number;
}

export const AtmosphericCanvas: React.FC<AtmosphericCanvasProps> = ({
  weatherCode = 0,
  isDay = true,
  precipitationMm = 0,
  windSpeedKmh = 10,
  enabled = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isDaytime = typeof isDay === "boolean" ? isDay : isDay === 1;

  // Determine weather category
  const isRain = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode) || precipitationMm > 0.05;
  const isSnow = [71, 73, 75, 77, 85, 86].includes(weatherCode);
  const isThunder = [95, 96, 99].includes(weatherCode);
  const isFog = [45, 48].includes(weatherCode);
  const isClearNight = !isDaytime && (weatherCode <= 2) && !isRain && !isSnow;
  const isClearDay = isDaytime && (weatherCode <= 2) && !isRain && !isSnow;

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles: Particle[] = [];
    const particleCount = isRain || isThunder ? 110 : isSnow ? 70 : isClearNight ? 120 : isClearDay ? 40 : 25;

    // Wind drift influence
    const windAngle = ((windSpeedKmh / 50) * Math.PI) / 8; // subtle slant

    for (let i = 0; i < particleCount; i++) {
      if (isRain || isThunder) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          speed: 14 + Math.random() * 12,
          length: 15 + Math.random() * 20,
          opacity: 0.15 + Math.random() * 0.45,
          angle: windAngle,
        });
      } else if (isSnow) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          speed: 1.2 + Math.random() * 2.2,
          size: 1.5 + Math.random() * 3.5,
          opacity: 0.2 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2,
        });
      } else if (isClearNight) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          speed: 0,
          size: 0.8 + Math.random() * 2.0,
          opacity: 0.2 + Math.random() * 0.8,
          twinkleSpeed: 0.02 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2,
        });
      } else {
        // Floating solar motes / haze
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.3 - Math.random() * 0.5,
          speed: 0.5,
          size: 1.0 + Math.random() * 2.5,
          opacity: 0.1 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    let lightningTimer = 0;
    let lightningFlash = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Handle subtle thunderstorm flash
      if (isThunder) {
        lightningTimer++;
        if (lightningTimer > 280 && Math.random() < 0.03) {
          lightningFlash = 0.25;
          lightningTimer = 0;
        }
        if (lightningFlash > 0) {
          ctx.fillStyle = `rgba(186, 230, 253, ${lightningFlash})`;
          ctx.fillRect(0, 0, width, height);
          lightningFlash *= 0.88;
        }
      }

      particles.forEach((p) => {
        if (isRain || isThunder) {
          ctx.strokeStyle = `rgba(186, 230, 253, ${p.opacity})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          const dx = Math.sin(p.angle || 0) * (p.length || 18);
          const dy = Math.cos(p.angle || 0) * (p.length || 18);
          ctx.lineTo(p.x + dx, p.y + dy);
          ctx.stroke();

          p.x += Math.sin(p.angle || 0) * p.speed;
          p.y += Math.cos(p.angle || 0) * p.speed;

          if (p.y > height) {
            p.y = -20;
            p.x = Math.random() * width;
          }
          if (p.x > width) p.x = 0;
          if (p.x < 0) p.x = width;
        } else if (isSnow) {
          p.phase = (p.phase || 0) + 0.02;
          const drift = Math.sin(p.phase) * 0.8;
          ctx.fillStyle = `rgba(241, 245, 249, ${p.opacity})`;
          ctx.beginPath();
          ctx.arc(p.x + drift, p.y, p.size || 2, 0, Math.PI * 2);
          ctx.fill();

          p.y += p.speed;
          p.x += (windSpeedKmh / 40) * 0.5;

          if (p.y > height) {
            p.y = -10;
            p.x = Math.random() * width;
          }
          if (p.x > width) p.x = 0;
        } else if (isClearNight) {
          p.phase = (p.phase || 0) + (p.twinkleSpeed || 0.02);
          const curOpacity = (p.opacity || 0.5) * (0.6 + 0.4 * Math.sin(p.phase));
          ctx.fillStyle = `rgba(255, 255, 255, ${curOpacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size || 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Floating solar motes
          p.phase = (p.phase || 0) + 0.02;
          p.x += p.vx || 0;
          p.y += p.vy || 0;
          const curOpacity = (p.opacity || 0.2) * (0.7 + 0.3 * Math.sin(p.phase));

          ctx.fillStyle = isClearDay ? `rgba(253, 224, 71, ${curOpacity})` : `rgba(203, 213, 225, ${curOpacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size || 1.5, 0, Math.PI * 2);
          ctx.fill();

          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
        }
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enabled, weatherCode, isDaytime, precipitationMm, windSpeedKmh, isRain, isSnow, isThunder, isClearNight, isClearDay]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      style={{ mixBlendMode: "screen" }}
    />
  );
};
