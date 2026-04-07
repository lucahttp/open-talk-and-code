/** @module models/wake-word */
import { ONNX } from "../onnx";
import { ONNXModel } from "./base";

/**
 * Wake Word detection model
 */
export class WakeWord extends ONNXModel {
    constructor(
        modelPath,
        threshold = 0.5,
        power = 0,
        webnn = 1,
        webgpu = 2,
        webgl = 3,
        wasm = 4
    ) {
        super(modelPath, power, webnn, webgpu, webgl, wasm);
        this.threshold = threshold;
    }

    async execute(embeddings) {
        const input = {};
        if (embeddings.dims.length === 3) {
            input.input = embeddings;
        } else {
            input.input = await ONNX.createTensor(
                "float32",
                embeddings.data,
                [1, embeddings.dims[0], embeddings.dims[1]]
            );
        }
        
        // Use global runSession for locking
        const output = await ONNX.runSession(this.modelPath, input);
        return output.output.data[0] * 1;
    }

    async checkWakeWordCalled(embeddings) {
        const probability = await this.run(embeddings);
        return {
            probability,
            detected: probability >= this.threshold,
        };
    }
}
