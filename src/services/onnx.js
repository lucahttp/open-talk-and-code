/** @module onnx */
import { sleep } from "./helpers";

let initialized = false;
let Tensor, InferenceSession;

// Initialize ONNX Runtime from CDN (loaded via script tag in index.html)
if (typeof window !== "undefined" && typeof window.ort !== "undefined") {
    initialized = true;
    Tensor = window.ort.Tensor;
    InferenceSession = window.ort.InferenceSession;
}

/**
 * Wrapper for ONNX Runtime Web API.
 */
export class ONNX {
    /**
     * Initialize ONNX Runtime from global ort object
     */
    static initialize() {
        if (!initialized && typeof window !== "undefined" && typeof window.ort !== "undefined") {
            initialized = true;
            Tensor = window.ort.Tensor;
            InferenceSession = window.ort.InferenceSession;
        }
    }

    /**
     * Wait for the ONNX Runtime Web API to be initialized.
     * @returns {Promise<void>}
     */
    static async waitForInitialization() {
        while (!initialized) {
            ONNX.initialize();
            await sleep(10);
        }
    }

    /**
     * Create a new tensor.
     * @param {string} dtype The data type of the tensor.
     * @param {Array<number>} data The data of the tensor.
     * @param {Array<number>} dims The dimensions of the tensor.
     * @returns {Promise<Tensor>} A promise that resolves to a new tensor.
     */
    static async createTensor(dtype, data, dims) {
        await ONNX.waitForInitialization();
        return new Tensor(dtype, data, dims);
    }

    /**
     * Create a new inference session.
     * @param {ArrayBuffer} model The model to load.
     * @param {Object} [options] The options for the inference session.
     * @returns {Promise<InferenceSession>} A promise that resolves to a new inference session.
     */
    static async createInferenceSession(model, options = {}) {
        await ONNX.waitForInitialization();
        return await InferenceSession.create(model, options);
    }
}

// Initialize immediately if possible
ONNX.initialize();
