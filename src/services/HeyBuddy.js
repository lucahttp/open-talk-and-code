/** @module hey-buddy */
import { ONNX } from "./onnx";
import { AudioBatcher } from "./AudioBatcher";
import { SileroVAD, SpeechEmbedding, MelSpectrogram, WakeWord } from "./models";

/**
 * Combines an array of embedding buffers into a single embedding tensor.
 */
async function embeddingBufferArrayToEmbedding(
    embeddingBufferArray,
    numFramesPerEmbedding,
    embeddingDim
) {
    const combinedEmptyData = new Float32Array(
        numFramesPerEmbedding * embeddingBufferArray.length * embeddingDim
    );

    const embeddingBuffer = await ONNX.createTensor("float32", combinedEmptyData, [
        numFramesPerEmbedding * embeddingBufferArray.length,
        embeddingDim,
    ]);

    for (let i = 0; i < embeddingBufferArray.length; i++) {
        const embedding = embeddingBufferArray[i];
        embeddingBuffer.data.set(
            embedding.data,
            i * numFramesPerEmbedding * embeddingDim
        );
    }
    return embeddingBuffer;
}

/**
 * HeyBuddy class for running wake word detection.
 */
export class HeyBuddy {
    constructor(options = {}) {
        this.debug = options.debug || false;
        options.positiveVadThreshold = options.positiveVadThreshold || 0.65;
        options.negativeVadThreshold = options.negativeVadThreshold || 0.4;
        options.negativeVadCount = options.negativeVadCount || 8;
        this.wakeWordThreads = options.wakeWordThreads || 4;
        this.wakeWordThreshold = options.wakeWordThreshold || 0.5;
        this.wakeWordInterval = options.wakeWordInterval || 2.0;

        const modelPath = options.modelPath || "/models/hey-buddy.onnx";
        const modelArray = Array.isArray(modelPath) ? modelPath : [modelPath];
        const vadModelPath = options.vadModelPath || "/pretrained/silero-vad.onnx";
        const embeddingModelPath =
            options.embeddingModelPath || "/pretrained/speech-embedding.onnx";
        const spectrogramModelPath =
            options.spectrogramModelPath || "/pretrained/mel-spectrogram.onnx";
        const batchSeconds = options.batchSeconds || 1.08;
        const batchIntervalSeconds = options.batchIntervalSeconds || 0.12;
        const targetSampleRate = options.targetSampleRate || 16000;
        const spectrogramMelBins = options.spectrogramMelBins || 32;
        const embeddingDim = options.embeddingDim || 96;
        const embeddingWindowSize = options.embeddingWindowSize || 76;
        const embeddingWindowStride = options.embeddingWindowStride || 8;
        const wakeWordEmbeddingFrames = options.wakeWordEmbeddingFrames || 16;

        // Initialize shared models
        this.vad = new SileroVAD(vadModelPath, targetSampleRate, options.positiveVadThreshold, options.negativeVadThreshold, options.negativeVadCount);
        this.spectrogram = new MelSpectrogram(spectrogramModelPath);
        this.spectrogramMelBins = spectrogramMelBins;
        this.embedding = new SpeechEmbedding(embeddingModelPath, embeddingDim, embeddingWindowSize, embeddingWindowStride);
        this.embeddingDim = embeddingDim;
        this.embeddingWindowSize = embeddingWindowSize;
        this.embeddingWindowStride = embeddingWindowStride;
        this.embeddingBuffer = null;
        this.embeddingBufferArray = [];

        // Initialize wake word models
        this.wakeWords = {};
        this.wakeWordTimes = {};
        this.wakeWordEmbeddingFrames = wakeWordEmbeddingFrames;
        for (let model of modelArray) {
            let modelName = model.split("/").pop().split(".")[0];
            this.wakeWords[modelName] = new WakeWord(model, this.wakeWordThreshold);
        }

        // Initialize state
        this.recording = false;
        this.paused = false;
        this.isProcessingBatch = false;
        this.audioBuffer = null;
        this.frameTimeEma = 0;
        this.frameTimeEmaWeight = 0.1;

        this.speechStartCallbacks = [];
        this.speechEndCallbacks = [];
        this.recordingCallbacks = [];
        this.processedCallbacks = [];
        this.detectedCallbacks = [];

        // Initialize batcher
        this.batcher = new AudioBatcher(batchSeconds, batchIntervalSeconds, targetSampleRate);
        this.batcher.onBatch((batch) => this.process(batch));
    }

    async waitUntilReady() {
        const models = [this.vad, this.spectrogram, this.embedding, ...Object.values(this.wakeWords)];
        await Promise.all(models.map(m => m.waitUntilLoaded()));
        return true;
    }

    async start() {
        await this.waitUntilReady();
        await this.batcher.initialize();
    }

    stop() {
        this.batcher.destroy();
    }

    pause() { this.paused = true; }
    resume() { this.paused = false; }

    onDetected(names, callback) { this.detectedCallbacks.push({ names, callback }); }
    onProcessed(callback) { this.processedCallbacks.push(callback); }
    onSpeechStart(callback) { this.speechStartCallbacks.push(callback); }
    onSpeechEnd(callback) { this.speechEndCallbacks.push(callback); }
    onRecording(callback) { this.recordingCallbacks.push(callback); }

    speechStart() {
        if (this.debug) console.log("Speech start");
        for (let callback of this.speechStartCallbacks) callback();
    }

    startRecording() {
        this.recording = true;
        this.audioBuffer = null;
    }

    stopRecording() {
        this.recording = false;
        this.audioBuffer = null;
    }

    speechEnd() {
        if (this.debug) console.log("Speech end");
        for (let callback of this.speechEndCallbacks) callback();
        if (this.recording) this.dispatchRecording();
    }

    dispatchRecording() {
        if (this.audioBuffer === null) return;
        for (let callback of this.recordingCallbacks) callback(this.audioBuffer);
        this.audioBuffer = null;
    }

    wakeWordDetected(name) {
        const now = Date.now();
        if (this.wakeWordTimes[name] && now - this.wakeWordTimes[name] < this.wakeWordInterval * 1000) return;
        if (this.debug) console.log("Wake word detected:", name);
        this.recording = true;
        this.wakeWordTimes[name] = now;
        for (let { names, callback } of this.detectedCallbacks) {
            if ((Array.isArray(names) && names.includes(name)) || names === name) callback();
        }
    }

    processed(data) {
        for (let callback of this.processedCallbacks) callback(data);
    }

    async checkWakeWords() {
        const returnMap = {};
        // Process wake words one by one to avoid session conflicts in WASM
        for (let name in this.wakeWords) {
            const wordCalled = await this.wakeWords[name].checkWakeWordCalled(this.embeddingBuffer);
            returnMap[name] = wordCalled;
            if (wordCalled.detected) this.wakeWordDetected(name);
        }
        return returnMap;
    }

    async process(audio) {
        if (this.paused || this.isProcessingBatch) return;
        this.isProcessingBatch = true;

        try {
            const startTime = Date.now();
            const lastBatch = audio.subarray(audio.length - this.batcher.batchIntervalSamples);

            const spectrograms = await this.spectrogram.run(audio);
            const embedding = await this.embedding.getEmbeddingFromMelSpectrogramOutput(spectrograms);
            
            const numFramesPerEmbedding = embedding.dims[0];
            const maxEmbeddings = this.wakeWordEmbeddingFrames / numFramesPerEmbedding;

            this.embeddingBufferArray.push(embedding);
            if (this.embeddingBufferArray.length > maxEmbeddings) this.embeddingBufferArray.shift();

            this.embeddingBuffer = await embeddingBufferArrayToEmbedding(
                this.embeddingBufferArray,
                numFramesPerEmbedding,
                this.embeddingDim
            );

            const { isSpeaking, speechProbability, justStoppedSpeaking, justStartedSpeaking } =
                await this.vad.hasSpeechAudio(lastBatch);

            if (justStartedSpeaking) this.speechStart();
            if (justStoppedSpeaking) this.speechEnd();

            let wakeWordsCalled = {};
            if (isSpeaking && this.embeddingBuffer.dims[0] === this.wakeWordEmbeddingFrames) {
                wakeWordsCalled = await this.checkWakeWords();
            }

            this.processed({
                listening: isSpeaking,
                recording: this.recording,
                speech: { probability: speechProbability, active: isSpeaking },
                wakeWords: wakeWordsCalled,
            });

            if (this.recording) {
                if (this.audioBuffer === null) {
                    this.audioBuffer = new Float32Array(audio.length);
                    this.audioBuffer.set(audio);
                } else {
                    const concatenated = new Float32Array(this.audioBuffer.length + lastBatch.length);
                    concatenated.set(this.audioBuffer);
                    concatenated.set(lastBatch, this.audioBuffer.length);
                    this.audioBuffer = concatenated;
                }
            }

            const executionTime = Date.now() - startTime;
            if (this.frameTimeEma === 0) this.frameTimeEma = executionTime;
            else this.frameTimeEma = (1.0 - this.frameTimeEmaWeight) * this.frameTimeEma + executionTime * this.frameTimeEmaWeight;

        } catch (err) {
            console.error('[HeyBuddy] Processing error:', err);
        } finally {
            this.isProcessingBatch = false;
        }
    }
}
