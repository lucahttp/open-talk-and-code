/**
 * Transcription Web Worker using Whisper WebGPU
 * Based on xenova/whisper-web experimental-webgpu branch
 */
import { pipeline, WhisperTextStreamer } from "@huggingface/transformers";

// Singleton pipeline factory
class TranscriptionPipeline {
    static task = "automatic-speech-recognition";
    static model = "onnx-community/whisper-base";
    static instance = null;

    static async getInstance(progressCallback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                dtype: {
                    encoder_model: "fp32",
                    decoder_model_merged: "q4",
                },
                device: "webgpu",
                progress_callback: progressCallback,
            });
        }
        return this.instance;
    }
}

// Handle messages from main thread
self.addEventListener("message", async (event) => {
    const { audio, language, task: subtask } = event.data;

    try {
        // Load transcriber with progress reporting
        const transcriber = await TranscriptionPipeline.getInstance((data) => {
            self.postMessage(data);
        });

        const time_precision =
            transcriber.processor.feature_extractor.config.chunk_length /
            transcriber.model.config.max_source_positions;

        const chunks = [];
        let chunk_count = 0;
        let start_time = null;
        let num_tokens = 0;
        let tps = 0;

        const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
            time_precision,
            on_chunk_start: (x) => {
                const offset = 25 * chunk_count; // chunk_length_s - stride_length_s
                chunks.push({
                    text: "",
                    timestamp: [offset + x, null],
                    finalised: false,
                    offset,
                });
            },
            token_callback_function: () => {
                start_time = start_time ?? performance.now();
                if (num_tokens++ > 0) {
                    tps = (num_tokens / (performance.now() - start_time)) * 1000;
                }
            },
            callback_function: (x) => {
                if (chunks.length === 0) return;
                chunks.at(-1).text += x;

                self.postMessage({
                    status: "update",
                    data: { text: chunks.map((c) => c.text).join(""), chunks, tps },
                });
            },
            on_chunk_end: (x) => {
                const current = chunks.at(-1);
                current.timestamp[1] = x + current.offset;
                current.finalised = true;
            },
            on_finalize: () => {
                start_time = null;
                num_tokens = 0;
                ++chunk_count;
            },
        });

        // Run transcription
        const output = await transcriber(audio, {
            top_k: 0,
            do_sample: false,
            chunk_length_s: 30,
            stride_length_s: 5,
            language: language || null,
            task: subtask || "transcribe",
            return_timestamps: true,
            force_full_sequences: false,
            streamer,
        });

        // Send complete result
        self.postMessage({
            status: "complete",
            data: {
                text: output.text,
                chunks: output.chunks || chunks,
                tps,
            },
        });
    } catch (error) {
        console.error("Transcription error:", error);
        self.postMessage({
            status: "error",
            data: { message: error.message },
        });
    }
});
