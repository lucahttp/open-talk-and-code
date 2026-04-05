/**
 * Quick Listen Bar Component
 * 
 * UI sutil: barra horizontal estilo "barra de vida de juego retro"
 * Se vacía de 15s a 0s
 * Color: #00ff00 → #00aa00 gradual
 * Muestra número pequeño al lado
 * 
 * Props: secondsRemaining (15-0), isActive
 */

export function QuickListenBar({ secondsRemaining, isActive }) {
  if (!isActive) return null;
  
  const percentage = (secondsRemaining / 15) * 100;
  
  // Color gradient: bright green to darker green
  const getColor = () => {
    if (percentage > 66) return '#00ff00';
    if (percentage > 33) return '#00cc00';
    return '#009900';
  };
  
  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-2 z-50">
      <span className="text-terminal text-xs font-mono opacity-70">
        {secondsRemaining}s
      </span>
      <div className="w-48 h-[3px] bg-terminal/20 rounded-sm overflow-hidden">
        <div 
          className="h-full rounded-sm transition-all duration-200 ease-linear"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: getColor(),
            boxShadow: `0 0 8px ${getColor()}`
          }}
        />
      </div>
    </div>
  );
}
