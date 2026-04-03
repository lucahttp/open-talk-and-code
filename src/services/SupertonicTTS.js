/** @module supertonic-tts */
import { ONNX } from "./onnx";

// Constants
const AVAILABLE_LANGS = ["en", "ko", "es", "pt", "fr"];

// Text processing utilities
function textToUnicodeValues(text) {
    return Array.from(text).map(char => char.charCodeAt(0));
}

function lengthToMask(lengths, maxLen = null) {
    maxLen = maxLen || Math.max(...lengths);
    const mask = [];
    for (let i = 0; i < lengths.length; i++) {
        const row = [];
        for (let j = 0; j < maxLen; j++) {
            row.push(j < lengths[i] ? 1.0 : 0.0);
        }
        mask.push([row]);
    }
    return mask;
}

function getTextMask(textIdsLengths) {
    return lengthToMask(textIdsLengths);
}

function preprocessText(text, lang = null) {
    text = text.normalize('NFKD');
    // Remove emojis
    text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu, '');

    const replacements = {
        "–": "-", "‑": "-", "—": "-", "_": " ",
        "\u201C": '"', "\u201D": '"', "\u2018": "'", "\u2019": "'",
        "´": "'", "`": "'", "[": " ", "]": " ", "|": " ", "/": " ", "#": " ", "→": " ", "←": " ",
    };

    for (const [k, v] of Object.entries(replacements)) { text = text.replaceAll(k, v); }
    text = text.replace(/[♥☆♡©\\]/g, "");

    const exprReplacements = { "@": " at ", "e.g.,": "for example,", "i.e.,": "that is," };
    for (const [k, v] of Object.entries(exprReplacements)) { text = text.replaceAll(k, v); }

    text = text.replace(/ ,/g, ",").replace(/ \./g, ".").replace(/ !/g, "!").replace(/ \?/g, "?")
        .replace(/ ;/g, ";").replace(/ :/g, ":").replace(/ '/g, "'");

    while (text.includes('""')) { text = text.replace(/""/g, '"'); }
    while (text.includes("''")) { text = text.replace(/''/g, "'"); }

    text = text.replace(/\s+/g, " ").trim();
    if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text) && text.length > 0) { text += "."; }

    if (lang !== null) {
        text = `<${lang}>` + text + `</${lang}>`;
    } else {
        text = `<na>` + text + `</na>`;
    }

    return text;
}

class UnicodeProcessor {
    constructor(indexer) {
        this.indexer = indexer;
    }

    call(textList, lang = null) {
        const processedTexts = textList.map(t => preprocessText(t, lang));
        const textIdsLengths = processedTexts.map(t => t.length);
        const maxLen = Math.max(...textIdsLengths);

        const textIds = [];
        const unsupportedChars = new Set();

        for (let i = 0; i < processedTexts.length; i++) {
            const row = new Array(maxLen).fill(0);
            const unicodeVals = textToUnicodeValues(processedTexts[i]);
            for (let j = 0; j < unicodeVals.length; j++) {
                const indexValue = this.indexer[unicodeVals[j]];
                if (indexValue === undefined || indexValue === null || indexValue === -1) {
                    unsupportedChars.add(processedTexts[i][j]);
                    row[j] = 0;
                } else {
                    row[j] = indexValue;
                }
            }
            textIds.push(row);
        }

        const textMask = getTextMask(textIdsLengths);
        return { textIds, textMask, unsupportedChars: Array.from(unsupportedChars) };
    }
}

function getLatentMask(wavLengths, cfgs) {
    const baseChunkSize = cfgs.ae.base_chunk_size;
    const chunkCompressFactor = cfgs.ttl.chunk_compress_factor;
    const latentSize = baseChunkSize * chunkCompressFactor;
    const latentLengths = wavLengths.map(len => Math.floor((len + latentSize - 1) / latentSize));
    return lengthToMask(latentLengths);
}

function sampleNoisyLatent(duration, cfgs) {
    const sampleRate = cfgs.ae.sample_rate;
    const baseChunkSize = cfgs.ae.base_chunk_size;
    const chunkCompressFactor = cfgs.ttl.chunk_compress_factor;
    const ldim = cfgs.ttl.latent_dim;

    const wavLenMax = Math.max(...duration.map(d => d[0][0])) * sampleRate;
    const wavLengths = duration.map(d => Math.floor(d[0][0] * sampleRate));
    const chunkSize = baseChunkSize * chunkCompressFactor;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDim = ldim * chunkCompressFactor;

    const noisyLatent = [];
    for (let b = 0; b < duration.length; b++) {
        const batch = [];
        for (let d = 0; d < latentDim; d++) {
            const row = [];
            for (let t = 0; t < latentLen; t++) {
                const u1 = Math.random();
                const u2 = Math.random();
                const randNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                row.push(randNormal);
            }
            batch.push(row);
        }
        noisyLatent.push(batch);
    }

    const latentMask = getLatentMask(wavLengths, cfgs);
    for (let b = 0; b < noisyLatent.length; b++) {
        for (let d = 0; d < noisyLatent[b].length; d++) {
            for (let t = 0; t < noisyLatent[b][d].length; t++) {
                noisyLatent[b][d][t] *= latentMask[b][0][t];
            }
        }
    }
    return { noisyLatent, latentMask };
}

/**
 * SupertonicTTS - Text-to-Speech engine using ONNX Runtime
 * Follows the same pattern as HeyBuddy.js - uses global window.ort from CDN
 */
export class SupertonicTTS {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.basePath = options.basePath || '/supertonic';
        this.onnxPath = options.onnxPath || `${this.basePath}/onnx`;
        this.voiceStylesPath = options.voiceStylesPath || `${this.basePath}/voice_styles`;

        // State
        this.config = null;
        this.processor = null;
        this.sessions = null;
        this.modelsLoaded = false;
        this.currentVoice = options.defaultVoice || 'M3';
        this.voiceEmbeddings = {};

        // Voice map - files are named simply as {voiceId}.json
        this.voiceMap = {
            'M1': 'M1.json',
            'M2': 'M2.json',
            'M3': 'M3.json',
            'M4': 'M4.json',
            'M5': 'M5.json',
            'F1': 'F1.json',
            'F2': 'F2.json',
            'F3': 'F3.json',
            'F4': 'F4.json',
            'F5': 'F5.json',
        };

        // Callbacks
        this.onProgressCallbacks = [];
        this.onReadyCallbacks = [];
        this.onErrorCallbacks = [];
    }

    log(...args) {
        if (this.debug) {
            console.log("[SupertonicTTS]", ...args);
        }
    }

    onProgress(callback) {
        this.onProgressCallbacks.push(callback);
    }

    onReady(callback) {
        this.onReadyCallbacks.push(callback);
    }

    onError(callback) {
        this.onErrorCallbacks.push(callback);
    }

    emitProgress(message, percent = null) {
        this.log(message);
        for (const cb of this.onProgressCallbacks) {
            cb({ message, percent });
        }
    }

    emitReady() {
        this.log("Ready");
        for (const cb of this.onReadyCallbacks) {
            cb();
        }
    }

    emitError(error) {
        console.error("[SupertonicTTS] Error:", error);
        for (const cb of this.onErrorCallbacks) {
            cb(error);
        }
    }

    /**
     * Initialize the TTS engine - loads configs and models
     */
    async initialize() {
        if (this.modelsLoaded) {
            this.emitReady();
            return;
        }

        try {
            // Wait for ONNX Runtime to be available (loaded via CDN in index.html)
            this.emitProgress("Waiting for ONNX Runtime...", 5);
            await ONNX.waitForInitialization();
            this.log("ONNX Runtime initialized");

            // Load config
            this.emitProgress("Loading TTS config...", 10);
            const configResp = await fetch(`${this.basePath}/tts.json`);
            if (!configResp.ok) throw new Error(`Failed to load tts.json: ${configResp.statusText}`);
            this.config = await configResp.json();
            this.log("Config loaded:", this.config);

            // Load unicode indexer
            this.emitProgress("Loading text processor...", 15);
            const indexerResp = await fetch(`${this.basePath}/unicode_indexer.json`);
            if (!indexerResp.ok) throw new Error(`Failed to load unicode_indexer.json: ${indexerResp.statusText}`);
            const indexerData = await indexerResp.json();
            this.processor = new UnicodeProcessor(indexerData);
            this.log("Text processor loaded");

            // Load ONNX models - uses global window.ort via ONNX wrapper
            const sessionOptions = {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            };

            this.emitProgress("Loading duration predictor...", 25);
            const dp = await ONNX.createInferenceSession(`${this.onnxPath}/duration_predictor.onnx`, sessionOptions);

            this.emitProgress("Loading text encoder...", 45);
            const textEnc = await ONNX.createInferenceSession(`${this.onnxPath}/text_encoder.onnx`, sessionOptions);

            this.emitProgress("Loading vector estimator...", 65);
            const vectorEst = await ONNX.createInferenceSession(`${this.onnxPath}/vector_estimator.onnx`, sessionOptions);

            this.emitProgress("Loading vocoder...", 85);
            const vocoder = await ONNX.createInferenceSession(`${this.onnxPath}/vocoder.onnx`, sessionOptions);

            this.sessions = { dp, textEnc, vectorEst, vocoder };
            this.log("Models loaded");

            // Load default voice embedding
            this.emitProgress("Loading voice embeddings...", 95);
            await this.loadVoiceEmbedding(this.currentVoice);

            this.modelsLoaded = true;
            this.emitProgress("Ready", 100);
            this.emitReady();

        } catch (error) {
            this.emitError(error.message);
            throw error;
        }
    }

    async loadVoiceEmbedding(voiceId) {
        if (this.voiceEmbeddings[voiceId]) {
            return this.voiceEmbeddings[voiceId];
        }

        const filename = this.voiceMap[voiceId];
        if (!filename) throw new Error(`Unknown voice: ${voiceId}`);

        const resp = await fetch(`${this.voiceStylesPath}/${filename}`);
        if (!resp.ok) throw new Error(`Failed to load voice: ${voiceId}`);
        const data = await resp.json();

        const embeddings = {
            styleTtl: await ONNX.createTensor(
                data.style_ttl.type || 'float32',
                Float32Array.from(data.style_ttl.data.flat(Infinity)),
                data.style_ttl.dims
            ),
            styleDp: await ONNX.createTensor(
                data.style_dp.type || 'float32',
                Float32Array.from(data.style_dp.data.flat(Infinity)),
                data.style_dp.dims
            )
        };

        this.voiceEmbeddings[voiceId] = embeddings;
        return embeddings;
    }

    /**
     * Generate speech from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Voice to use (default: current voice)
     * @returns {Promise<{audio: Float32Array, sampleRate: number}>}
     */
    async generate(text, voiceId = null) {
        if (!this.modelsLoaded) {
            await this.initialize();
        }

        voiceId = voiceId || this.currentVoice;
        const embeddings = await this.loadVoiceEmbedding(voiceId);

        // Clean text - remove <think> tags and their content, plus any stray tags
        let cleanText = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')  // Full think blocks
            .replace(/<\/?think>/gi, '')                 // Stray opening or closing tags
            .trim();

        if (!cleanText) {
            throw new Error("No text to synthesize");
        }

        this.log("Generating speech for:", cleanText.substring(0, 50) + "...");

        // Process text
        const { textIds, textMask } = this.processor.call([cleanText], 'en');
        const bsz = 1;
        const textIdsShape = [bsz, textIds[0].length];
        const textMaskShape = [bsz, 1, textMask[0][0].length];

        // Create tensors using ONNX wrapper - note: text_ids needs int64
        const textIdsTensor = await ONNX.createTensor(
            'int64',
            BigInt64Array.from(textIds.flat().map(x => BigInt(x))),
            textIdsShape
        );
        const textMaskTensor = await ONNX.createTensor('float32', Float32Array.from(textMask.flat(Infinity)), textMaskShape);

        // Duration prediction
        const dpOut = await this.sessions.dp.run({
            text_ids: textIdsTensor,
            style_dp: embeddings.styleDp,
            text_mask: textMaskTensor
        });

        const durOnnx = Array.from(dpOut.duration.data);
        const durReshaped = [[[durOnnx[0]]]];

        // Text encoding
        const textEncOut = await this.sessions.textEnc.run({
            text_ids: textIdsTensor,
            style_ttl: embeddings.styleTtl,
            text_mask: textMaskTensor
        });

        // Sample noisy latent
        const { noisyLatent, latentMask } = sampleNoisyLatent(durReshaped, this.config);
        const latentDim = noisyLatent[0].length;
        const latentLen = noisyLatent[0][0].length;
        const latentShape = [bsz, latentDim, latentLen];
        const latentMaskShape = [bsz, 1, latentMask[0][0].length];

        const latentSize = bsz * latentDim * latentLen;
        const latentBuffer = new Float32Array(latentSize);
        let idx = 0;
        for (let d = 0; d < latentDim; d++) {
            for (let t = 0; t < latentLen; t++) {
                latentBuffer[idx++] = noisyLatent[0][d][t];
            }
        }

        // Denoising loop
        const totalStep = 10;
        const scalarShape = [bsz];
        const totalStepTensor = await ONNX.createTensor('float32', Float32Array.from([totalStep]), scalarShape);
        const latentMaskTensor = await ONNX.createTensor('float32', Float32Array.from(latentMask.flat(Infinity)), latentMaskShape);

        for (let step = 0; step < totalStep; step++) {
            const currentStepTensor = await ONNX.createTensor('float32', Float32Array.from([step]), scalarShape);
            const noisyLatentTensor = await ONNX.createTensor('float32', latentBuffer, latentShape);

            const out = await this.sessions.vectorEst.run({
                noisy_latent: noisyLatentTensor,
                text_emb: textEncOut.text_emb,
                style_ttl: embeddings.styleTtl,
                text_mask: textMaskTensor,
                latent_mask: latentMaskTensor,
                total_step: totalStepTensor,
                current_step: currentStepTensor
            });
            latentBuffer.set(out.denoised_latent.data);
        }

        // Vocoder
        const vocoderLatentTensor = await ONNX.createTensor('float32', latentBuffer, latentShape);
        const vocoderOut = await this.sessions.vocoder.run({
            latent: vocoderLatentTensor
        });

        const wavBatch = vocoderOut.wav_tts.data;
        const sampleRate = this.config.ae.sample_rate;
        const wavLen = Math.floor(sampleRate * durOnnx[0]);

        this.log("Generated", wavLen, "samples at", sampleRate, "Hz");

        return {
            audio: wavBatch.slice(0, wavLen),
            sampleRate
        };
    }

    /**
     * Test the TTS engine
     */
    async test() {
        this.log("Testing TTS engine...");
        try {
            await this.initialize();
            this.log("TTS engine test passed");
            return true;
        } catch (error) {
            this.log("TTS engine test failed:", error);
            return false;
        }
    }

    /**
     * Split text into chunks for streaming generation
     * @param {string} text - Text to split
     * @param {number} maxLen - Maximum chunk length (default 250)
     * @returns {string[]} Array of text chunks
     */
    chunkText(text, maxLen = 250) {
        // Split by paragraph (two or more newlines)
        const paragraphs = text.trim().split(/\n\s*\n+/).filter(p => p.trim());

        const chunks = [];

        for (let paragraph of paragraphs) {
            paragraph = paragraph.trim();
            if (!paragraph) continue;

            // Split by sentence boundaries (., !, ? followed by space)
            // Exclude common abbreviations
            const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|etc\.|e\.g\.|i\.e\.)(?<=[.!?])\s+/);

            let currentChunk = "";

            for (let sentence of sentences) {
                if (currentChunk.length + sentence.length + 1 <= maxLen) {
                    currentChunk += (currentChunk ? " " : "") + sentence;
                } else {
                    if (currentChunk) {
                        chunks.push(currentChunk.trim());
                    }
                    currentChunk = sentence;
                }
            }

            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
        }

        // Handle case where no chunks were created (single short text)
        if (chunks.length === 0 && text.trim()) {
            chunks.push(text.trim());
        }

        return chunks;
    }

    /**
     * Generate speech with streaming - calls onChunkReady for each chunk
     * @param {string} text - Full text to synthesize
     * @param {string} voiceId - Voice to use
     * @param {Function} onChunkReady - Callback (audio, sampleRate, chunkIndex, totalChunks, chunkDuration)
     * @returns {Promise<{totalDuration: number, chunks: number}>}
     */
    async generateStreaming(text, voiceId = null, onChunkReady) {
        if (!this.modelsLoaded) {
            await this.initialize();
        }

        // Clean text first
        let cleanText = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .trim();

        if (!cleanText) {
            throw new Error("No text to synthesize");
        }

        const chunks = this.chunkText(cleanText);
        this.log(`Streaming generation: ${chunks.length} chunks`);

        let totalDuration = 0;
        const silenceDuration = 0.3; // 300ms silence between chunks

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            this.log(`Generating chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 40)}..."`);

            try {
                const { audio, sampleRate } = await this.generate(chunk, voiceId);
                const chunkDuration = audio.length / sampleRate;
                totalDuration += chunkDuration;

                if (onChunkReady) {
                    onChunkReady(audio, sampleRate, i, chunks.length, chunkDuration);
                }

                // Add silence duration for all but last chunk
                if (i < chunks.length - 1) {
                    totalDuration += silenceDuration;
                }
            } catch (error) {
                this.log(`Chunk ${i + 1} failed:`, error.message);
                // Continue with next chunk instead of failing entirely
            }
        }

        return { totalDuration, chunks: chunks.length };
    }
}
