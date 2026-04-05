/**
 * Speaking Glow Border Component
 * 
 * UI sutil: borde exterior con glow pulsante verde
 * Se activa durante SPEAKING y QUICK_LISTEN
 * Estilo: box-shadow pulsante suave
 * 
 * Props: isActive
 */

import { useEffect, useState } from 'react';

export function SpeakingGlowBorder({ isActive }) {
  const [opacity, setOpacity] = useState(0.3);
  
  useEffect(() => {
    if (!isActive) return;
    
    // Pulsating animation
    const interval = setInterval(() => {
      setOpacity(prev => {
        if (prev >= 0.6) return 0.3;
        return prev + 0.05;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [isActive]);
  
  if (!isActive) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-40"
      style={{
        boxShadow: `inset 0 0 ${30 + opacity * 20}px rgba(0, 255, 0, ${opacity})`,
        transition: 'box-shadow 0.1s ease-out'
      }}
    />
  );
}
