export const ActivityStatus = ({ activity }) => {
  if (!activity) return null;
  
  const getIcon = () => {
    switch (activity.type) {
      case 'thinking': return '🧠';
      case 'generating': return '✨';
      case 'processing': return '⚙️';
      case 'tool': return '🔧';
      case 'command': return '⌨️';
      case 'sending': return '📤';
      default: return '⏳';
    }
  };
  
  return (
    <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 rounded">
      <span>{getIcon()}</span>
      <span className="font-mono">{activity.message}</span>
      <span className="inline-flex">
        <span className="animate-bounce">.</span>
        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
      </span>
    </div>
  );
};
