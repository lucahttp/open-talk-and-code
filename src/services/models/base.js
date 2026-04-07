/** @module models/base */
import { sleep } from "../helpers";
import { ONNX } from "../onnx";

/**
 * Base class for ONNX models
 */
export class ONNXModel {
    constructor(
        modelPath,
        power = 0,
        webnn = 4,
        webgpu = 3,
        webgl = 2,
        wasm = 1
    ) {
        this.modelPath = modelPath;
        this.session = null;
        this.error = null;
        this.duration = 0.0;
        this.ema = 0.1;
        this.lastTime = 0.0;
        this.load();
    }

    async load() {
        try {
            // This will now return a cached session if available
            this.session = await ONNX.createInferenceSession(this.modelPath);
        } catch (err) {
            this.error = err;
        }
    }

    async waitUntilLoaded() {
        while (this.session === null && this.error === null) {
            await sleep(50);
        }
        if (this.error) {
            throw new Error(`Failed to load model ${this.modelPath}: ${this.error.message}`);
        }
    }

    async execute(input) {
        throw new Error("Not Implemented");
    }

    async run(input) {
        await this.waitUntilLoaded();
        const currentTime = new Date().getTime();
        try {
            // Using the global runSession to ensure per-model locking
            const result = await this.execute(input);
            const executionDuration = new Date().getTime() - currentTime;
            
            if (this.duration === 0.0) {
                this.duration = executionDuration;
            } else {
                this.duration = (1.0 - this.ema) * this.duration + this.ema * executionDuration;
            }
            this.lastTime = currentTime;
            return result;
        } catch (err) {
            console.error(`[ONNXModel] Error in ${this.modelPath}:`, err);
            throw err;
        }
    }
}
