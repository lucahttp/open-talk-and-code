/** @module models/speech-embedding */
import { ONNX } from "../onnx";
import { ONNXModel } from "./base";

/**
 * Speech Embedding model
 * Get embeddings from a mel spectrogram
 * @extends ONNXModel
 */
export class SpeechEmbedding extends ONNXModel {
    constructor(
        modelPath = "/pretrained/speech-embedding.onnx",
        embeddingDim = 96,
        windowSize = 76,
        windowStride = 8,
        power = 0,
        webnn = 1,
        webgpu = 2,
        webgl = 3,
        wasm = 4
    ) {
        super(modelPath, power, webnn, webgpu, webgl, wasm);
        this.embeddingDim = embeddingDim;
        this.windowSize = windowSize;
        this.windowStride = windowStride;
    }

    async getEmbeddingFromMelSpectrogramOutput(melSpectogramOutput) {
        const spectogramBuffer = await ONNX.createTensor(
            "float32",
            melSpectogramOutput.data,
            melSpectogramOutput.dims.slice(2)
        );
        return this.run(spectogramBuffer);
    }

    async execute(spectrograms) {
        const [numFrames, melBins] = spectrograms.dims;
        if (numFrames < this.windowSize) {
            throw new Error(
                `Audio is too short to process - require ${this.windowSize} samples, got ${numFrames}`
            );
        }

        const numTruncatedFrames = numFrames - ((numFrames - this.windowSize) % this.windowStride);
        const numBatches = (numTruncatedFrames - this.windowSize) / this.windowStride + 1;

        const stackedData = new Float32Array(numBatches * this.windowSize * melBins);
        for (let i = 0; i < numBatches; i++) {
            const start = i * this.windowStride;
            const sourceOffset = start * melBins;
            const length = this.windowSize * melBins;
            stackedData.set(spectrograms.data.subarray(sourceOffset, sourceOffset + length), i * length);
        }

        const stackedWindowTensor = await ONNX.createTensor(
            "float32",
            stackedData,
            [numBatches, this.windowSize, melBins, 1]
        );

        // Use global runSession for locking
        const output = await ONNX.runSession(this.modelPath, { input_1: stackedWindowTensor });
        const outputData = output.conv2d_19.data;

        const embeddings = await ONNX.createTensor(
            "float32",
            new Float32Array(numBatches * this.embeddingDim),
            [numBatches, this.embeddingDim]
        );
        embeddings.data.set(outputData);

        return embeddings;
    }
}
