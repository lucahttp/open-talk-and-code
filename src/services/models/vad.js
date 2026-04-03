/** @module models/vad */
import { ONNX } from "../onnx";
import { ONNXModel } from "./base";

/**
 * Silero VAD model for voice activity detection
 */
export class SileroVAD extends ONNXModel {
    constructor(
        modelPath = "/pretrained/silero-vad.onnx",
        sampleRate = 16000,
        speechVadThreshold = 0.65,
        silenceVadThreshold = 0.4,
        silentFramesCount = 10,
        power = 0,
        webnn = 1,
        webgpu = 2,
        webgl = 3,
        wasm = 4
    ) {
        super(modelPath, power, webnn, webgpu, webgl, wasm);
        this.sampleRate = sampleRate || 16000;
        this.speechVadThreshold = speechVadThreshold;
        this.silenceVadThreshold = silenceVadThreshold;
        this.silentFramesCount = silentFramesCount;
        this.silentFrames = 0;
        this.isSpeaking = false;
    }

    async test(debug = false) {
        const result = await this.run(new Float32Array(16000).fill(0));
        if (!isNaN(result) && 0.0 <= result && result <= 1.0) {
            if (debug) {
                console.log(`VAD model OK, executed in ${this.duration} ms`);
            }
        } else {
            throw new Error(`VAD model failed - got ${result}`);
        }
    }

    async execute(input) {
        if (
            this.h === undefined ||
            this.c === undefined ||
            this.sr === undefined
        ) {
            this.sr = await ONNX.createTensor("int64", [this.sampleRate], [1]);
            this.h = await ONNX.createTensor(
                "float32",
                new Array(128).fill(0),
                [2, 1, 64]
            );
            this.c = await ONNX.createTensor(
                "float32",
                new Array(128).fill(0),
                [2, 1, 64]
            );
        }
        const inputTensor = await ONNX.createTensor("float32", input, [
            1,
            input.length,
        ]);
        const output = await this.session.run({
            input: inputTensor,
            h: this.h,
            c: this.c,
            sr: this.sr,
        });
        this.c = output.cn;
        this.h = output.hn;
        return output.output.data[0];
    }

    async hasSpeechAudio(audio) {
        const speechProbability = await this.run(audio);
        const hasSpeech = speechProbability > this.speechVadThreshold;
        const hasSilence = speechProbability < this.silenceVadThreshold;
        let justStoppedSpeaking = false;
        let justStartedSpeaking = false;

        if (!hasSpeech) {
            if (hasSilence) {
                this.silentFrames += 1;
                if (
                    this.isSpeaking &&
                    this.silentFrames > this.silentFramesCount
                ) {
                    this.isSpeaking = false;
                    justStoppedSpeaking = true;
                }
            }
        } else {
            this.silentFrames = 0;
            if (!this.isSpeaking) {
                this.isSpeaking = true;
                justStartedSpeaking = true;
            }
        }

        return {
            isSpeaking: this.isSpeaking,
            speechProbability,
            justStoppedSpeaking,
            justStartedSpeaking,
        };
    }
}
