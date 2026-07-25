"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Atmospheric rain — a Three.js particle layer drawn OVER the map. Mood effect
 * (not geo-registered): drops fall in front of the camera so tilting/panning
 * the map underneath still feels immersive.
 *
 * Realism comes from cheap tricks rather than expensive shading:
 *   • three depth layers — near drops are longer/brighter/faster, far drops are
 *     short, dim and slow, which reads as real depth-of-field;
 *   • per-drop length + speed jitter so the curtain isn't a uniform grid;
 *   • slight wind shear that varies with height;
 *   • additive blending + fog so drops fade into the distance.
 * Capped, throttled by intensity, and paused when the tab is hidden.
 */
const MAX_DROPS = 2200;
const SPREAD_X = 150;
const SPREAD_Y = 140;

interface Layer {
  count: number;
  z: [number, number];
  len: [number, number];
  speed: [number, number];
  opacity: number;
  width: number;
}

// near → far
const LAYERS: Layer[] = [
  { count: 400, z: [-40, -90], len: [9, 16], speed: [3.0, 4.2], opacity: 0.55, width: 2 },
  { count: 800, z: [-90, -180], len: [5, 9], speed: [2.2, 3.2], opacity: 0.38, width: 1.4 },
  { count: 1000, z: [-180, -320], len: [2.5, 5], speed: [1.5, 2.4], opacity: 0.24, width: 1 },
];

export default function RainOverlay({
  active,
  intensity,
}: {
  active: boolean;
  intensity: number; // 0–1 from live rainfall
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const intensityRef = useRef(intensity);
  activeRef.current = active;
  intensityRef.current = intensity;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1220, 140, 340);

    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -100);

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // One LineSegments mesh per depth layer.
    const built = LAYERS.map((L) => {
      const positions = new Float32Array(L.count * 2 * 3);
      const speeds = new Float32Array(L.count);
      const lens = new Float32Array(L.count);
      for (let i = 0; i < L.count; i++) {
        const x = rnd(-SPREAD_X, SPREAD_X);
        const y = rnd(-SPREAD_Y, SPREAD_Y);
        const z = rnd(L.z[0], L.z[1]);
        const len = rnd(L.len[0], L.len[1]);
        const o = i * 6;
        positions[o] = x;
        positions[o + 1] = y;
        positions[o + 2] = z;
        positions[o + 3] = x;
        positions[o + 4] = y - len;
        positions[o + 5] = z;
        speeds[i] = rnd(L.speed[0], L.speed[1]);
        lens[i] = len;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0xd6e9ff,
        transparent: true,
        opacity: L.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        linewidth: L.width,
      });
      const mesh = new THREE.LineSegments(geometry, material);
      scene.add(mesh);
      return { L, geometry, material, mesh, speeds, lens };
    });

    const clock = new THREE.Clock();
    let raf: number | null = null;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const inten = intensityRef.current;
      if (!activeRef.current || inten <= 0) {
        renderer.clear();
        return;
      }
      const dt = reduced ? 0 : Math.min(clock.getDelta(), 0.05) * 60;
      const gust = 1 + 0.25 * Math.sin(performance.now() / 2600);

      for (const b of built) {
        const visible = Math.max(24, Math.floor(inten * b.L.count));
        b.geometry.setDrawRange(0, visible * 2);
        b.material.opacity = b.L.opacity * (0.55 + inten * 0.65);

        const pos = b.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < visible; i++) {
          const o = i * 6;
          const fall = (1.6 + inten * 3.4) * b.speeds[i] * dt;
          arr[o + 1] -= fall;
          arr[o + 4] -= fall;
          // Wind shear: stronger drift higher up, gusting over time.
          const shear = (0.18 + inten * 0.5) * gust * dt * (1 + (arr[o + 1] + SPREAD_Y) / (SPREAD_Y * 3));
          arr[o] += shear;
          arr[o + 3] += shear;

          if (arr[o + 1] < -SPREAD_Y) {
            const nx = rnd(-SPREAD_X, SPREAD_X);
            const ny = SPREAD_Y + rnd(0, 50);
            arr[o] = nx;
            arr[o + 1] = ny;
            arr[o + 3] = nx;
            arr[o + 4] = ny - b.lens[i];
          } else if (arr[o] > SPREAD_X) {
            arr[o] -= SPREAD_X * 2;
            arr[o + 3] -= SPREAD_X * 2;
          }
        }
        pos.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };
    frame();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const onVis = () => {
      if (document.hidden) {
        if (raf != null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf == null) {
        clock.getDelta();
        frame();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      for (const b of built) {
        b.geometry.dispose();
        b.material.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-700"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
}
