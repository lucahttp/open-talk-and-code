/**
 * Grace Period Bar Component
 * 
 * UI sutil: línea fina abajo que se vacía de 5s a 0s
 * Estilo Telltale Games - tipo "tiempo para decidir"
 * Color: #00ff00 con opacidad variable
 * 
 * Props: seconds (0-5), isActive
 */

export function GracePeriodBar({ seconds, isActive }) {
  if (!isActive) return null;
  
  const percentage = (seconds / 5) * 100;
  
  return (
    <div className="fixed bottom-0 left-0 right-0 h-[3px] bg-terminal/10 z-50">
      <div 
        className="h-full bg-terminal transition-all duration-100 ease-linear"
        style={{ 
          width: `${percentage}%`,
          opacity: seconds > 0 ? 0.8 : 0,
          boxShadow: seconds > 0 ? '0 0 10px #00ff00' : 'none'
        }}
      />
    </div>
  );
}
