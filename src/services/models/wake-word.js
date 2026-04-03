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

    async test(debug = false) {
        const embeddings = await ONNX.createTensor(
            "float32",
            new Float32Array(16 * 96).fill(0),
            [1, 16, 96]
        );
        const output = await this.run(embeddings);
        if (0.0 <= output && output <= 1.0) {
            if (debug) {
                console.log(`Wake Word model OK, executed in ${this.duration} ms`);
            }
        } else {
            throw new Error(
                `Wake Word model test failed - expected 0 <= x <= 1, got ${output}`
            );
        }
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
        const output = await this.session.run(input);
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
