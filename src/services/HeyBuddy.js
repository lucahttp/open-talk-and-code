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
        this.vad = new SileroVAD(
            vadModelPath,
            targetSampleRate,
            options.positiveVadThreshold,
            options.negativeVadThreshold,
            options.negativeVadCount
        );
        this.vad.test(this.debug);

        this.spectrogram = new MelSpectrogram(spectrogramModelPath);
        this.spectrogram.test(this.debug);
        this.spectrogramMelBins = spectrogramMelBins;

        this.embedding = new SpeechEmbedding(
            embeddingModelPath,
            embeddingDim,
            embeddingWindowSize,
            embeddingWindowStride
        );
        this.embedding.test(this.debug);
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
            this.wakeWords[modelName].test(this.debug);
        }

        // Initialize state
        this.recording = false;
        this.paused = false;
        this.audioBuffer = null;
        this.frameIntervalEma = 0;
        this.frameIntervalEmaWeight = 0.1;
        this.frameTimeEma = 0;
        this.frameTimeEmaWeight = 0.1;

        this.speechStartCallbacks = [];
        this.speechEndCallbacks = [];
        this.recordingCallbacks = [];
        this.processedCallbacks = [];
        this.detectedCallbacks = [];

        // Initialize batcher
        this.batcher = new AudioBatcher(
            batchSeconds,
            batchIntervalSeconds,
            targetSampleRate
        );
        this.batcher.onBatch((batch) => this.process(batch));
    }

    async start() {
        await this.batcher.initialize();
    }

    stop() {
        this.batcher.destroy();
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    get chunkedWakeWords() {
        return Object.keys(this.wakeWords).reduce((carry, name, i) => {
            const chunkIndex = Math.floor(i / this.wakeWordThreads);
            if (!carry[chunkIndex]) {
                carry[chunkIndex] = [];
            }
            carry[chunkIndex].push(name);
            return carry;
        }, []);
    }

    onDetected(names, callback) {
        this.detectedCallbacks.push({ names, callback });
    }

    onProcessed(callback) {
        this.processedCallbacks.push(callback);
    }

    onSpeechStart(callback) {
        this.speechStartCallbacks.push(callback);
    }

    onSpeechEnd(callback) {
        this.speechEndCallbacks.push(callback);
    }

    onRecording(callback) {
        this.recordingCallbacks.push(callback);
    }

    speechStart() {
        if (this.debug) {
            console.log("Speech start");
        }
        for (let callback of this.speechStartCallbacks) {
            callback();
        }
    }

    speechEnd() {
        if (this.debug) {
            console.log("Speech end");
        }
        for (let callback of this.speechEndCallbacks) {
            callback();
        }
        if (this.recording) {
            this.dispatchRecording();
            this.recording = false;
        }
    }

    dispatchRecording() {
        if (this.audioBuffer === null) {
            console.error("No recording to dispatch");
            return;
        }
        if (this.debug) {
            const recordingLength = this.audioBuffer.length;
            const recordedDuration = recordingLength / this.batcher.targetSampleRate;
            console.log(
                `Dispatching recording with ${recordingLength} frames (${recordedDuration} s)`
            );
        }
        for (let callback of this.recordingCallbacks) {
            callback(this.audioBuffer);
        }
        this.audioBuffer = null;
    }

    wakeWordDetected(name) {
        const now = Date.now();
        if (
            this.wakeWordTimes[name] &&
            now - this.wakeWordTimes[name] < this.wakeWordInterval * 1000
        ) {
            return;
        }
        if (this.debug) {
            console.log("Wake word detected:", name);
        }
        this.recording = true;
        this.wakeWordTimes[name] = now;

        for (let { names, callback } of this.detectedCallbacks) {
            if ((Array.isArray(names) && names.includes(name)) || names === name) {
                callback();
            }
        }
    }

    processed(data) {
        for (let callback of this.processedCallbacks) {
            callback(data);
        }
    }

    async checkWakeWordSubset(wakeWordNames) {
        return await Promise.all(
            wakeWordNames.map((name) =>
                this.wakeWords[name].checkWakeWordCalled(this.embeddingBuffer)
            )
        );
    }

    async checkWakeWords() {
        const returnMap = {};
        for (let nameChunk of this.chunkedWakeWords) {
            const wakeWordsCalled = await this.checkWakeWordSubset(nameChunk);
            for (let i = 0; i < nameChunk.length; i++) {
                const name = nameChunk[i];
                const wordCalled = wakeWordsCalled[i];
                returnMap[name] = wordCalled;
            }
        }
        for (let name in returnMap) {
            if (returnMap[name].detected) {
                this.wakeWordDetected(name);
            }
        }
        return returnMap;
    }

    async process(audio) {
        // Skip processing when paused
        if (this.paused) {
            return;
        }

        this.frameStart = new Date().getTime();

        if (this.frameEnd !== undefined && this.frameEnd !== null) {
            this.frameInterval = this.frameStart - this.frameEnd;
        } else {
            this.frameInterval = 0;
        }
        if (this.frameIntervalEma === 0) {
            this.frameIntervalEma = this.frameInterval;
        } else {
            this.frameIntervalEma =
                this.frameIntervalEma * (1 - this.frameIntervalEmaWeight) +
                this.frameInterval * this.frameIntervalEmaWeight;
        }

        const lastBatch = audio.subarray(
            audio.length - this.batcher.batchIntervalSamples
        );

        const spectrograms = await this.spectrogram.run(audio);
        const embedding = await this.embedding.getEmbeddingFromMelSpectrogramOutput(
            spectrograms
        );
        const numFramesPerEmbedding = embedding.dims[0];
        const maxEmbeddings = this.wakeWordEmbeddingFrames / numFramesPerEmbedding;

        this.embeddingBufferArray.push(embedding);
        if (this.embeddingBufferArray.length > maxEmbeddings)
            this.embeddingBufferArray.shift();

        this.embeddingBuffer = await embeddingBufferArrayToEmbedding(
            this.embeddingBufferArray,
            numFramesPerEmbedding,
            this.embeddingDim
        );
        const { isSpeaking, speechProbability, justStoppedSpeaking, justStartedSpeaking } =
            await this.vad.hasSpeechAudio(lastBatch);

        if (justStartedSpeaking) this.speechStart();
        if (justStoppedSpeaking) this.speechEnd();

        if (
            isSpeaking &&
            this.embeddingBuffer.dims[0] === this.wakeWordEmbeddingFrames
        ) {
            const wakeWordsCalled = await this.checkWakeWords();
            this.processed({
                listening: true,
                recording: this.recording,
                speech: { probability: speechProbability, active: isSpeaking },
                wakeWords: wakeWordsCalled,
            });
        } else {
            this.processed({
                listening: false,
                recording: this.recording,
                speech: { probability: speechProbability, active: isSpeaking },
                wakeWords: Object.entries(this.wakeWords).reduce((carry, [name]) => {
                    carry[name] = {
                        probability: 0.0,
                        active: false,
                    };
                    return carry;
                }, {}),
            });
        }

        if (this.recording) {
            if (this.audioBuffer === null) {
                this.audioBuffer = new Float32Array(audio.length);
                this.audioBuffer.set(audio);
            } else {
                const concatenated = new Float32Array(
                    this.audioBuffer.length + lastBatch.length
                );
                concatenated.set(this.audioBuffer);
                concatenated.set(lastBatch, this.audioBuffer.length);
                this.audioBuffer = concatenated;
            }
        }

        this.frameEnd = new Date().getTime();
        this.frameTime = this.frameEnd - this.frameStart;
        if (this.frameTimeEma === 0) {
            this.frameTimeEma = this.frameTime;
        } else {
            this.frameTimeEma =
                this.frameTimeEma * (1 - this.frameTimeEmaWeight) +
                this.frameTime * this.frameTimeEmaWeight;
        }
    }
}
