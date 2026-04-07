/** @module onnx */
import { sleep } from "./helpers";
import { MutexLock } from "./mutex";

let initialized = false;
let Tensor, InferenceSession;
const sessionMutex = new MutexLock();

// Global cache for sessions and their individual locks
const sessionCache = new Map();
const sessionLocks = new Map();

/**
 * Wrapper for ONNX Runtime Web API.
 */
export class ONNX {
    /**
     * Initialize ONNX Runtime from global ort object
     */
    static initialize() {
        if (!initialized && typeof window !== "undefined" && typeof window.ort !== "undefined") {
            const ort = window.ort;
            // Configure WASM paths
            ort.env.wasm.wasmPaths = '/wasm/';
            // Force single thread for maximum stability in real-time audio
            ort.env.wasm.numThreads = 1;
            // Disable proxy to avoid worker overhead for small models
            ort.env.wasm.proxy = false;
            
            Tensor = ort.Tensor;
            InferenceSession = ort.InferenceSession;
            initialized = true;
            console.log('[ONNX] Runtime initialized (Single-thread WASM mode)');
        }
    }

    /**
     * Wait for the ONNX Runtime Web API to be initialized.
     */
    static async waitForInitialization() {
        let attempts = 0;
        while (!initialized && attempts < 100) {
            ONNX.initialize();
            if (initialized) break;
            await sleep(50);
            attempts++;
        }
        if (!initialized) {
            throw new Error('ONNX Runtime failed to initialize');
        }
    }

    /**
     * Create a new tensor.
     */
    static async createTensor(dtype, data, dims) {
        await ONNX.waitForInitialization();
        return new Tensor(dtype, data, dims);
    }

    /**
     * Create or get a cached inference session.
     */
    static async createInferenceSession(modelPath, options = {}) {
        await ONNX.waitForInitialization();
        
        // Return cached session if exists
        if (sessionCache.has(modelPath)) {
            return sessionCache.get(modelPath);
        }

        const release = await sessionMutex.acquire();
        try {
            if (sessionCache.has(modelPath)) return sessionCache.get(modelPath);

            console.log(`[ONNX] Loading session: ${modelPath}`);
            const session = await InferenceSession.create(modelPath, {
                ...options,
                executionProviders: ['wasm'], // Stick to WASM
                graphOptimizationLevel: 'all'
            });
            
            sessionCache.set(modelPath, session);
            sessionLocks.set(modelPath, new MutexLock());
            return session;
        } catch (err) {
            console.error(`[ONNX] Error loading ${modelPath}:`, err);
            throw err;
        } finally {
            release();
        }
    }

    /**
     * Run a session with a per-session lock to prevent concurrency errors.
     */
    static async runSession(modelPath, inputs) {
        const session = sessionCache.get(modelPath);
        if (!session) throw new Error(`Session not found for ${modelPath}`);
        
        const lock = sessionLocks.get(modelPath);
        const release = await lock.acquire();
        try {
            return await session.run(inputs);
        } finally {
            release();
        }
    }
}

// Initialize immediately if possible
if (typeof window !== "undefined") {
    ONNX.initialize();
}
