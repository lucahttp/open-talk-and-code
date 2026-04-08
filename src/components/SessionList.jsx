export const SessionList = ({ sessions, selectedId, onSelect, onCreate, loading }) => (
  <div className="border border-gray-600 p-2 mb-4 bg-black">
    <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600">
      ┌─ SESSIONS ─────────────────────────────┐
    </div>
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {loading ? (
        <div className="text-xs text-gray-500 italic">
          Loading...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-xs text-gray-500 italic">
          No sessions found
        </div>
      ) : (
        sessions.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left text-xs p-1 border ${
              selectedId === s.id 
                ? 'border-terminal bg-terminal/10 text-terminal' 
                : 'border-gray-600 text-gray-400 hover:border-terminal hover:text-terminal'
            }`}
          >
            {selectedId === s.id ? '▶' : ' '} {s.title || s.id}
          </button>
        ))
      )}
    </div>
    <button
      onClick={onCreate}
      disabled={loading}
      className="w-full mt-2 text-xs border border-terminal text-terminal p-1 
                 hover:bg-terminal hover:text-black transition-colors disabled:opacity-50"
    >
      + NEW SESSION
    </button>
  </div>
)
