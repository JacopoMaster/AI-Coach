import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";

export default function SpiralTimer() {
  const [totalSeconds, setTotalSeconds] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editMin, setEditMin] = useState("01");
  const [editSec, setEditSec] = useState("00");
  const intervalRef = useRef(null);

  const PRESETS = [
    { label: "30s", seconds: 30 },
    { label: "1m", seconds: 60 },
    { label: "2m", seconds: 120 },
    { label: "3m", seconds: 180 },
  ];

  // Tick loop with sub-second resolution for smooth spiral animation
  useEffect(() => {
    if (!isRunning) return;
    const startTime = performance.now();
    const startRemaining = remaining;

    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const next = Math.max(0, startRemaining - elapsed);
      setRemaining(next);
      if (next <= 0) {
        setIsRunning(false);
        return;
      }
      intervalRef.current = requestAnimationFrame(tick);
    };
    intervalRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(intervalRef.current);
  }, [isRunning]);

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const isFinished = remaining <= 0 && totalSeconds > 0;

  // Build an Archimedean spiral as an SVG path.
  // r = a + b*theta, growing from center outward.
  const spiralPath = useMemo(() => {
    const cx = 150;
    const cy = 150;
    const turns = 5;
    const maxRadius = 115;
    const steps = 600;
    const totalTheta = turns * 2 * Math.PI;
    const b = maxRadius / totalTheta;

    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const theta = t * totalTheta;
      const r = b * theta;
      // Rotate so the spiral "opens" upward, classic Gurren Lagann feel
      const angle = theta - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  }, []);

  const pathRef = useRef(null);
  const [pathLength, setPathLength] = useState(0);
  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [spiralPath]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleStartPause = () => {
    if (isFinished) return;
    setIsRunning((r) => !r);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemaining(totalSeconds);
  };

  const openEditor = () => {
    if (isRunning) return;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    setEditMin(String(mins).padStart(2, "0"));
    setEditSec(String(secs).padStart(2, "0"));
    setIsEditing(true);
  };

  const applyEdit = () => {
    const m = Math.max(0, Math.min(99, parseInt(editMin, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt(editSec, 10) || 0));
    const total = m * 60 + s;
    if (total > 0) {
      setTotalSeconds(total);
      setRemaining(total);
    }
    setIsEditing(false);
  };

  const sanitize = (val, max) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 2);
    if (cleaned === "") return "";
    const n = Math.min(max, parseInt(cleaned, 10));
    return String(n).padStart(2, "0");
  };

  const applyPreset = (seconds) => {
    if (isRunning) return;
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setIsEditing(false);
  };

  const dashOffset = pathLength * (1 - progress);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#05070a] p-6 font-mono select-none">
      {/* Backdrop grid + scanlines */}
      <div className="fixed inset-0 pointer-events-none opacity-40"
           style={{
             backgroundImage:
               "linear-gradient(rgba(34,197,94,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.06) 1px, transparent 1px)",
             backgroundSize: "40px 40px",
           }} />
      <div className="fixed inset-0 pointer-events-none opacity-[0.04]"
           style={{
             backgroundImage:
               "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
           }} />

      <div className="relative w-full max-w-md flex flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] text-emerald-400/70 uppercase mb-1">
            Spiral Power Core
          </div>
          <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
        </div>

        {/* Spiral canvas */}
        <div className="relative">
          {/* Outer glow ring */}
          <div className={`absolute inset-0 rounded-full blur-3xl transition-opacity duration-700 ${
            isRunning ? "opacity-60" : "opacity-30"
          }`}
            style={{ background: "radial-gradient(circle, #10b981 0%, transparent 60%)" }}
          />

          <svg
            viewBox="0 0 300 300"
            className="relative w-[300px] h-[300px] sm:w-[340px] sm:h-[340px]"
          >
            <defs>
              <radialGradient id="spiralGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#a7f3d0" />
                <stop offset="40%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#047857" />
              </radialGradient>
              <filter id="spiralGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer decorative ring */}
            <circle cx="150" cy="150" r="140" fill="none"
                    stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1" />
            <circle cx="150" cy="150" r="132" fill="none"
                    stroke="rgba(16, 185, 129, 0.35)" strokeWidth="1" strokeDasharray="2 6" />
            <circle cx="150" cy="150" r="122" fill="none"
                    stroke="rgba(16, 185, 129, 0.1)" strokeWidth="1" />

            {/* Faded background spiral (full path, dim) */}
            <path
              d={spiralPath}
              fill="none"
              stroke="rgba(16, 185, 129, 0.08)"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Hidden ref path for length measurement */}
            <path ref={pathRef} d={spiralPath} fill="none" stroke="none" />

            {/* Active spiral - shrinks from outside in as time elapses */}
            {pathLength > 0 && (
              <path
                d={spiralPath}
                fill="none"
                stroke="url(#spiralGrad)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={pathLength}
                strokeDashoffset={dashOffset}
                filter="url(#spiralGlow)"
                style={{ transition: isRunning ? "none" : "stroke-dashoffset 0.4s ease-out" }}
              />
            )}

            {/* Center core */}
            <circle cx="150" cy="150" r="3" fill="#a7f3d0" filter="url(#strongGlow)" />

            {/* Rotating accent marks (cosmetic, only when running) */}
            {isRunning && (
              <g style={{ transformOrigin: "150px 150px", animation: "spin 8s linear infinite" }}>
                <circle cx="150" cy="20" r="2" fill="#10b981" filter="url(#strongGlow)" />
                <circle cx="150" cy="280" r="2" fill="#10b981" filter="url(#strongGlow)" />
              </g>
            )}
          </svg>
        </div>

        {/* Time display */}
        <div className="flex flex-col items-center gap-1">
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.div
                key="editor"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={editMin}
                  onChange={(e) => setEditMin(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={() => setEditMin(sanitize(editMin, 99) || "00")}
                  className="w-20 bg-transparent border-b-2 border-emerald-500/60 text-emerald-200 text-5xl text-center font-mono tracking-tight focus:outline-none focus:border-emerald-400 caret-emerald-400"
                  autoFocus
                />
                <span className="text-emerald-400 text-5xl font-mono">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editSec}
                  onChange={(e) => setEditSec(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  onBlur={() => setEditSec(sanitize(editSec, 59) || "00")}
                  onKeyDown={(e) => e.key === "Enter" && applyEdit()}
                  className="w-20 bg-transparent border-b-2 border-emerald-500/60 text-emerald-200 text-5xl text-center font-mono tracking-tight focus:outline-none focus:border-emerald-400 caret-emerald-400"
                />
                <button
                  onClick={applyEdit}
                  className="ml-2 px-3 py-1 text-[10px] tracking-[0.3em] uppercase text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/10 transition rounded"
                >
                  Set
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={openEditor}
                disabled={isRunning}
                className={`text-6xl sm:text-7xl font-mono tracking-tight tabular-nums transition ${
                  isFinished
                    ? "text-emerald-100"
                    : "text-emerald-200"
                } ${!isRunning && "hover:text-emerald-100 cursor-pointer"}`}
                style={{
                  textShadow: isFinished
                    ? "0 0 30px rgba(16,185,129,0.9)"
                    : "0 0 20px rgba(16,185,129,0.4)",
                }}
              >
                {formatTime(remaining)}
              </motion.button>
            )}
          </AnimatePresence>

          <div className="text-[10px] tracking-[0.3em] text-emerald-500/50 uppercase">
            {isEditing
              ? "Enter time \u00b7 press set"
              : isRunning
              ? "Recovering spiral energy"
              : isFinished
              ? "Energy fully restored"
              : "Tap time to edit"}
          </div>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-2">
          {PRESETS.map((preset) => {
            const isActive = totalSeconds === preset.seconds && !isEditing;
            return (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.seconds)}
                disabled={isRunning}
                className={`px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase font-mono transition rounded border disabled:opacity-30 disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-emerald-500/15 border-emerald-400/70 text-emerald-200"
                    : "border-emerald-500/30 text-emerald-400/70 hover:border-emerald-400/60 hover:text-emerald-200 hover:bg-emerald-500/5"
                }`}
                style={isActive ? { boxShadow: "0 0 12px rgba(16,185,129,0.25)" } : undefined}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="group relative w-12 h-12 flex items-center justify-center border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10 transition rounded-full"
            aria-label="Reset"
          >
            <RotateCcw className="w-4 h-4 group-hover:-rotate-45 transition-transform" />
          </button>

          <button
            onClick={handleStartPause}
            disabled={isFinished || isEditing}
            className="group relative w-16 h-16 flex items-center justify-center bg-emerald-500 text-black hover:bg-emerald-400 disabled:bg-emerald-900 disabled:text-emerald-700 disabled:cursor-not-allowed transition rounded-full"
            style={{
              boxShadow: !isFinished && !isEditing
                ? "0 0 30px rgba(16,185,129,0.5), inset 0 0 20px rgba(255,255,255,0.2)"
                : "none",
            }}
            aria-label={isRunning ? "Pause" : "Start"}
          >
            {isRunning ? (
              <Pause className="w-6 h-6" fill="currentColor" />
            ) : (
              <Play className="w-6 h-6 translate-x-0.5" fill="currentColor" />
            )}
          </button>

          <div className="w-12 h-12" />
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-[9px] tracking-[0.3em] text-emerald-500/60 uppercase mb-2">
            <span>Energy</span>
            <span>{Math.round((1 - progress) * 100)}%</span>
          </div>
          <div className="h-1 bg-emerald-950 overflow-hidden rounded-full">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-200 transition-all"
              style={{
                width: `${(1 - progress) * 100}%`,
                boxShadow: "0 0 10px rgba(16,185,129,0.8)",
                transition: isRunning ? "none" : "width 0.4s ease-out",
              }}
            />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }" }} />
    </div>
  );
}
