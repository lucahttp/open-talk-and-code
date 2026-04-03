/**
 * FunctionGemma Intent Classification Service
 * Uses Google's FunctionGemma 270M to classify voice commands
 */

import { pipeline } from '@huggingface/transformers'

// Native OpenCode commands that can be executed directly
const NATIVE_COMMANDS = [
  '/compact',
  '/new',
  '/search',
  '/find',
  '/glob',
  '/bash',
  '/models',
  '/agents',
  '/theme',
  '/help',
  '/interrupt',
  '/stop'
]

// Command patterns for classification
const COMMAND_PATTERNS = {
  '/compact': ['compact', 'compactar', 'compress', 'resumir', 'resumen'],
  '/new': ['new', 'nuevo', 'nueva', 'create', 'crear', 'start fresh'],
  '/search': ['search', 'buscar', 'find', 'look for', 'busca'],
  '/find': ['find file', 'buscar archivo', 'find', 'glob', 'where is'],
  '/bash': ['run', 'execute', 'ejecutar', 'bash', 'command', 'terminal', 'shell'],
  '/models': ['models', 'modelos', 'which model', 'change model'],
  '/agents': ['agents', 'agentes', 'switch agent', 'cambiar agente'],
  '/theme': ['theme', 'tema', 'color', 'dark mode', 'light mode'],
  '/help': ['help', 'ayuda', 'what can you do', 'commands'],
  '/interrupt': ['stop', 'pause', 'interrupt', 'cancel', 'detener', 'quiet', 'silence']
}

class FunctionGemmaIntent {
  constructor() {
    this.classifier = null
    this.model = 'Xenova/functiongemma-270m-it' // or similar small model
    this.isLoading = false
    this.loadingPromise = null
  }

  async load() {
    if (this.classifier) return this.classifier
    if (this.isLoading) return this.loadingPromise

    this.isLoading = true
    console.log('Loading FunctionGemma model...')

    this.loadingPromise = pipeline(
      'text-classification',
      this.model,
      {
        dtype: 'fp16',
        device: 'webgpu'
      }
    ).then(classifier => {
      this.classifier = classifier
      this.isLoading = false
      console.log('✅ FunctionGemma loaded')
      return classifier
    }).catch(err => {
      this.isLoading = false
      console.error('❌ Failed to load FunctionGemma:', err)
      // Fallback to regex-based classification
      return null
    })

    return this.loadingPromise
  }

  // Simple regex-based fallback classification
  classifyWithRegex(text) {
    const lower = text.toLowerCase()
    
    for (const [command, patterns] of Object.entries(COMMAND_PATTERNS)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern.toLowerCase())) {
          return {
            type: 'command',
            action: command,
            confidence: 0.7,
            params: this.extractParams(command, text)
          }
        }
      }
    }
    
    // Default: treat as LLM query
    return {
      type: 'query',
      action: 'llm:query',
      confidence: 0.5,
      params: { text }
    }
  }

  extractParams(command, text) {
    const lower = text.toLowerCase()
    
    switch (command) {
      case '/search':
        // Extract search query after "search for" or "buscar"
        const searchMatch = text.match(/(?:search for?|buscar)\s+(.+)/i)
        return { query: searchMatch?.[1] || text }
        
      case '/find':
        // Extract file pattern
        const findMatch = text.match(/(?:find|buscar archivo|glob)\s+(.+)/i)
        return { pattern: findMatch?.[1] || '*' }
        
      case '/bash':
        // Extract command
        const bashMatch = text.match(/(?:run|execute|ejecutar|bash)\s+(.+)/i)
        return { command: bashMatch?.[1] || text }
        
      case '/theme':
        // Detect theme preference
        if (lower.includes('dark') || lower.includes('oscuro')) {
          return { theme: 'dark' }
        } else if (lower.includes('light') || lower.includes('claro')) {
          return { theme: 'light' }
        }
        return {}
        
      default:
        return {}
    }
  }

  async classify(text) {
    // Try to use the model if available
    if (this.classifier) {
      try {
        const result = await this.classifier(text)
        const label = result[0]?.label
        const confidence = result[0]?.score

        // Map model output to command
        if (confidence > 0.6 && NATIVE_COMMANDS.includes(label)) {
          return {
            type: 'command',
            action: label,
            confidence,
            params: this.extractParams(label, text)
          }
        }
      } catch (err) {
        console.error('Model classification failed, using fallback:', err)
      }
    }
    
    // Fallback to regex
    return this.classifyWithRegex(text)
  }

  isReady() {
    return !!this.classifier
  }
}

// Singleton
const intentClassifier = new FunctionGemmaIntent()

export default intentClassifier
export { FunctionGemmaIntent }
