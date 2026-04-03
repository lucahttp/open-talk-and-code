/** @module audio */

// Minified worklet code
const workletName = "hey-buddy";
const workletBlob = new Blob(
    [
        `(()=>{class t extends AudioWorkletProcessor{constructor(t){super(t),this.targetSampleRate=t.processorOptions.targetSampleRate,this.inputBuffer=new Float32Array(this.inputFrameSize),this.inputBufferSize=0,this.outputBuffer=new Float32Array(this.targetFrameSize)}get inputFrameSize(){return Math.round(sampleRate/50)}get targetFrameSize(){return Math.round(this.targetSampleRate/50)}async flush(){const t=sampleRate/this.targetSampleRate;this.outputBuffer.fill(0);for(let e=0;e<this.targetFrameSize;e++){const i=e*t,r=Math.floor(i),s=Math.min(r+1,this.targetFrameSize-1),u=i-r;this.outputBuffer[e]=this.inputBuffer[r]*(1-u)+this.inputBuffer[s]*u}await this.port.postMessage(this.outputBuffer)}pushAudio(t){const e=t.length,i=this.inputFrameSize-this.inputBufferSize;if(e<i)return this.inputBuffer.set(t,this.inputBufferSize),void(this.inputBufferSize+=e);this.inputBuffer.set(t.subarray(0,i),this.inputBufferSize),this.flush(),this.inputBufferSize=0,this.pushAudio(t.subarray(i))}process(t,e,i){return this.pushAudio(t[0][0]),!0}}registerProcessor("${workletName}",t)})();`,
    ],
    { type: "application/javascript" }
);
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
        const worker = new AudioWorkletNode(context, workletName, workletOptions);
        return new AudioNode(context, worker);
    }
}
