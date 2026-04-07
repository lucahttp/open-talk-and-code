/** @module models/mel-spectrogram */
import { ONNX } from "../onnx";
import { ONNXModel } from "./base";

/**
 * Mel spectrogram model
 * @extends ONNXModel
 */
export class MelSpectrogram extends ONNXModel {
    constructor(
        modelPath = "/pretrained/mel-spectrogram.onnx",
        power = 0,
        webnn = 1,
        webgpu = 2,
        webgl = 3,
        wasm = 4
    ) {
        super(modelPath, power, webnn, webgpu, webgl, wasm);
    }

    async execute(input) {
        const inputTensor = await ONNX.createTensor("float32", input, [
            1,
            input.length,
        ]);
        
        // Use the global runSession to ensure locking
        const output = await ONNX.runSession(this.modelPath, { input: inputTensor });
        const outputData = output.output.data;
        
        const scaledData = new Float32Array(outputData.length);
        for (let i = 0; i < outputData.length; i++) {
            scaledData[i] = outputData[i] / 10.0 + 2.0;
        }

        return await ONNX.createTensor(
            "float32",
            scaledData,
            output.output.dims
        );
    }
}
