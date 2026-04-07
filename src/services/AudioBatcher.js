/** @module audio */

// Minified worklet code
// Audio Worklet code for resampling and batching
const workletCode = `
class HeyBuddyProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.targetSampleRate = options.processorOptions.targetSampleRate;
        this.inputFrameSize = Math.round(sampleRate / 50); // 20ms at source sample rate
        this.targetFrameSize = Math.round(this.targetSampleRate / 50); // 20ms at target sample rate
        this.inputBuffer = new Float32Array(this.inputFrameSize);
        this.inputBufferSize = 0;
        this.outputBuffer = new Float32Array(this.targetFrameSize);
    }

    async flush() {
        const ratio = sampleRate / this.targetSampleRate;
        this.outputBuffer.fill(0);
        
        // Simple linear interpolation for resampling
        for (let i = 0; i < this.targetFrameSize; i++) {
            const pos = i * ratio;
            const left = Math.floor(pos);
            const right = Math.min(left + 1, this.inputFrameSize - 1);
            const weight = pos - left;
            this.outputBuffer[i] = this.inputBuffer[left] * (1 - weight) + this.inputBuffer[right] * weight;
        }
        
        this.port.postMessage(this.outputBuffer);
    }

    pushAudio(data) {
        let offset = 0;
        while (offset < data.length) {
            const remaining = data.length - offset;
            const space = this.inputFrameSize - this.inputBufferSize;
            const toCopy = Math.min(remaining, space);
            
            this.inputBuffer.set(data.subarray(offset, offset + toCopy), this.inputBufferSize);
            this.inputBufferSize += toCopy;
            offset += toCopy;
            
            if (this.inputBufferSize >= this.inputFrameSize) {
                this.flush();
                this.inputBufferSize = 0;
            }
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0 && input[0].length > 0) {
            this.pushAudio(input[0]);
        }
        return true;
    }
}

registerProcessor("hey-buddy", HeyBuddyProcessor);
`;

const workletBlob = new Blob([workletCode], { type: "application/javascript" });
const workletUrl = URL.createObjectURL(workletBlob);

/**
 * A class that batches audio samples and calls a callback with the batch.
 */
export class AudioBatcher {
    constructor(
        batchSeconds = 2.0,
        batchIntervalSeconds = 0.05,
        targetSampleRate = 16000
    ) {
        this.initialized = false;
        this.callbacks = [];
        this.batchSeconds = batchSeconds;
        this.batchIntervalSeconds = batchIntervalSeconds;
        this.batchIntervalCount = 0;
        this.targetSampleRate = targetSampleRate;
        this.buffer = new Float32Array(this.batchSamples);
        this.buffer.fill(0);
        this.stream = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.workerNode = null;
    }

    get batchSamples() {
        return Math.floor(this.batchSeconds * this.targetSampleRate);
    }

    get batchIntervalSamples() {
        return Math.floor(this.batchIntervalSeconds * this.targetSampleRate);
    }

    clearBuffer() {
        this.buffer.fill(0);
    }

    push(data) {
        const dataLength = data.length;
        this.buffer.set(this.buffer.subarray(dataLength));
        this.buffer.set(data, this.buffer.length - dataLength);
        this.batchIntervalCount += dataLength;
        if (this.batchIntervalCount >= this.batchIntervalSamples) {
            this.callbacks.forEach((callback) => callback(this.buffer));
            this.batchIntervalCount = 0;
        }
    }

    onBatch(callback) {
        this.callbacks.push(callback);
    }

    offBatch(callback) {
        this.callbacks = this.callbacks.filter((c) => c !== callback);
    }

    async initialize() {
        if (this.initialized) {
            return;
        }
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true,
            },
        });
        this.audioContext = new AudioContext();
        this.sourceNode = new MediaStreamAudioSourceNode(this.audioContext, {
            mediaStream: this.stream,
        });
        this.workerNode = await AudioNode.create(
            this.audioContext,
            this.targetSampleRate
        );
        this.sourceNode.connect(this.workerNode.worker);
        this.workerNode.worker.port.onmessage = (event) => {
            this.push(event.data);
        };
        this.clearBuffer();
        this.initialized = true;
    }

    destroy() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.initialized = false;
    }
}

/**
 * A class that wraps an AudioWorkletNode.
 */
export class AudioNode {
    constructor(context, worker) {
        this.context = context;
        this.worker = worker;
    }

    static async create(context, targetSampleRate) {
        await context.audioWorklet.addModule(workletUrl);
        const workletOptions = {
            processorOptions: {
                targetSampleRate: targetSampleRate,
            },
        };
        const worker = new AudioWorkletNode(context, "hey-buddy", workletOptions);
        return new AudioNode(context, worker);
    }
}
