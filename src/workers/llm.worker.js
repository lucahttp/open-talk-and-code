/**
 * LLM Web Worker using Qwen3 WebGPU
 * Based on transformers.js qwen3-webgpu example
 * Supports chat history and streaming responses
 */
import {
    AutoTokenizer,
    AutoModelForCausalLM,
    TextStreamer,
    InterruptableStoppingCriteria,
} from "@huggingface/transformers";

/**
 * Singleton pipeline factory for Qwen3
 */
class TextGenerationPipeline {
    static model_id = "onnx-community/Qwen3-0.6B-ONNX";
    static tokenizer = null;
    static model = null;

    static async getInstance(progressCallback = null) {
        this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
            progress_callback: progressCallback,
        });

        this.model ??= AutoModelForCausalLM.from_pretrained(this.model_id, {
            dtype: "q4f16",
            device: "webgpu",
            progress_callback: progressCallback,
        });

        return Promise.all([this.tokenizer, this.model]);
    }
}

const stoppingCriteria = new InterruptableStoppingCriteria();
let pastKeyValuesCache = null;

/**
 * Generate response for chat messages
 */
async function generate({ messages }) {
    const [tokenizer, model] = await TextGenerationPipeline.getInstance();

    // Apply chat template to messages
    const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true,
    });

    const [START_THINKING_TOKEN_ID, END_THINKING_TOKEN_ID] = tokenizer.encode(
        "<think></think>",
        { add_special_tokens: false },
    );

    let state = "answering";
    let startTime = null;
    let numTokens = 0;
    let tps = 0;

    const tokenCallback = (tokens) => {
        startTime ??= performance.now();
        if (numTokens++ > 0) {
            tps = (numTokens / (performance.now() - startTime)) * 1000;
        }

        // Check for state transitions
        switch (Number(tokens[0])) {
            case START_THINKING_TOKEN_ID:
                state = "thinking";
                break;
            case END_THINKING_TOKEN_ID:
                state = "answering";
                break;
        }
    };

    const callback = (output) => {
        self.postMessage({
            status: "update",
            output,
            tps,
            numTokens,
            state,
        });
    };

    const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: callback,
        token_callback_function: tokenCallback,
    });

    // Signal generation start
    self.postMessage({ status: "start" });

    try {
        const { past_key_values, sequences } = await model.generate({
            ...inputs,
            past_key_values: pastKeyValuesCache,
            do_sample: true,
            top_k: 20,
            temperature: 0.7,
            max_new_tokens: 2048, // Increased for reasoning
            streamer,
            stopping_criteria: stoppingCriteria,
            return_dict_in_generate: true,
        });

        // Cache for next turn
        // pastKeyValuesCache = past_key_values; // DISABLED: Causes context corruption with full history inputs

        const decoded = tokenizer.batch_decode(sequences, {
            skip_special_tokens: true,
        });

        // DEBUG: Log inputs and full response
        console.log("================= LLM DEBUG (Worker) =================");
        console.log("INPUT MESSAGES:", JSON.stringify(messages, null, 2));
        console.log("FULL RESPONSE:", decoded[0]);
        console.log("======================================================");

        // Send complete result - note: we don't need 'state' here as it's the final blob
        self.postMessage({
            status: "complete",
            output: decoded[0],
            tps,
            numTokens,
        });
    } catch (error) {
        self.postMessage({
            status: "error",
            data: { message: error.message },
        });
    }
}

/**
 * Check WebGPU support
 */
async function check() {
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU is not supported (no adapter found)");
        }
    } catch (e) {
        self.postMessage({
            status: "error",
            data: { message: e.toString() },
        });
    }
}

/**
 * Load model and warm up
 */
async function load() {
    self.postMessage({
        status: "loading",
        data: "Loading Qwen3 model...",
    });

    const [tokenizer, model] = await TextGenerationPipeline.getInstance((x) => {
        self.postMessage(x);
    });

    self.postMessage({
        status: "loading",
        data: "Compiling shaders...",
    });

    // Warm up with dummy input
    const inputs = tokenizer("a");
    await model.generate({ ...inputs, max_new_tokens: 1 });

    self.postMessage({ status: "ready" });
}

// Handle messages from main thread
self.addEventListener("message", async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case "check":
            check();
            break;

        case "load":
            load();
            break;

        case "generate":
            stoppingCriteria.reset();
            generate(data);
            break;

        case "interrupt":
            stoppingCriteria.interrupt();
            break;

        case "reset":
            pastKeyValuesCache = null;
            stoppingCriteria.reset();
            break;
    }
});
