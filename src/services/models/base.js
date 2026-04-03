/** @module models/base */
import { sleep } from "../helpers";
import { ONNX } from "../onnx";

/**
 * Base class for ONNX models
 */
export class ONNXModel {
    /**
     * Constructor
     * @param {string} modelPath - Path to the ONNX model
     * @param {number} power - Power preference (0=default, -1=low, 1=high)
     * @param {number} webnn - WebNN priority
     * @param {number} webgpu - WebGPU priority
     * @param {number} webgl - WebGL priority
     * @param {number} wasm - WASM priority
     */
    constructor(
        modelPath,
        power = 0,
        webnn = 1,
        webgpu = 2,
        webgl = 3,
        wasm = 4
    ) {
        this.modelPath = modelPath;
        this.session = null;
        this.duration = 0.0;
        this.ema = 0.1;
        this.lastTime = 0.0;
        this.webnn = webnn;
        this.webgpu = webgpu;
        this.webgl = webgl;
        this.wasm = wasm;
        this.power = power;
        this.load();
    }

    get powerPreference() {
        switch (this.power) {
            case -1:
                return "low-power";
            case 1:
                return "high-performance";
            default:
                return "default";
        }
    }

    get executionProviders() {
        const providerIndexes = [];
        if (Number.isInteger(this.webnn)) {
            providerIndexes.push([
                {
                    name: "webnn",
                    device: "gpu",
                    powerPreference: this.powerPreference,
                },
                this.webnn,
            ]);
        }
        if (Number.isInteger(this.webgpu)) {
            providerIndexes.push(["webgpu", this.webgpu]);
        }
        if (Number.isInteger(this.webgl)) {
            providerIndexes.push(["webgl", this.webgl]);
        }
        if (Number.isInteger(this.wasm)) {
            providerIndexes.push(["wasm", this.wasm]);
        }
        providerIndexes.sort((a, b) => a[1] - b[1]);
        return providerIndexes.map((providerIndex) => providerIndex[0]);
    }

    get sessionOptions() {
        return {
            executionProviders: ["wasm"],
        };
    }

    async load() {
        this.session = await ONNX.createInferenceSession(
            this.modelPath,
            this.sessionOptions
        );
    }

    async waitUntilLoaded() {
        while (this.session === null) {
            await sleep(1);
        }
    }

    async execute(input) {
        throw new Error("Not Implemented");
    }

    async run(input) {
        await this.waitUntilLoaded();
        const currentTime = new Date().getTime();
        const result = await this.execute(input);
        const executionDuration = new Date().getTime() - currentTime;
        if (this.duration === 0.0) {
            this.duration = executionDuration;
        } else {
            this.duration =
                (1.0 - this.ema) * this.duration + this.ema * executionDuration;
        }
        this.lastTime = currentTime;
        return result;
    }
}
