/**
 * Model Downloader Script
 * Downloads ONNX models from HuggingFace for Hey Buddy wake word detection
 * 
 * Models needed:
 * - hey-buddy.onnx (wake word detection model)
 * - silero-vad.onnx (voice activity detection)
 * - speech-embedding.onnx (audio embeddings)
 * - mel-spectrogram.onnx (mel spectrogram conversion)
 */

import { pipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import https from 'https';

const MODELS_DIR = './public/models';
const PRETRAINED_DIR = './public/pretrained';

// Ensure directories exist
[MODELS_DIR, PRETRAINED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Model URLs from HuggingFace
const MODELS = {
  // Hey Buddy wake word model (from hey-buddy repo or similar)
  // Note: This needs to be trained specifically for "Hey Buddy"
  // For now, we'll use a placeholder - in production, train your own
  // or download from: https://huggingface.co/Xenova/hey-buddy
  
  // Silero VAD - pretrained
  'silero-vad.onnx': {
    url: 'https://huggingface.co/Xenova/silero-vad/resolve/main/model.onnx',
    dest: PRETRAINED_DIR
  },
  
  // Speech Embedding model (for wake word feature extraction)
  'speech-embedding.onnx': {
    url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/model.onnx',
    dest: PRETRAINED_DIR
  },
  
  // Mel Spectrogram - can use Web Audio API instead, but ONNX is faster
  // Placeholder - actual model depends on implementation
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rProgress: ${percent}%`);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`\n✅ Downloaded: ${path.basename(destPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function downloadModels() {
  console.log('🤖 Downloading AI models for Voice Agent...\n');
  
  for (const [filename, { url, dest }] of Object.entries(MODELS)) {
    const destPath = path.join(dest, filename);
    
    if (fs.existsSync(destPath)) {
      console.log(`⏭️  ${filename} already exists, skipping`);
      continue;
    }
    
    console.log(`\n📥 Downloading ${filename}...`);
    try {
      await downloadFile(url, destPath);
    } catch (err) {
      console.error(`❌ Failed to download ${filename}:`, err.message);
      console.log('   This model may require manual download or training');
    }
  }
  
  console.log('\n✨ Model download complete!');
  console.log('\nNote: Hey Buddy wake word model (hey-buddy.onnx) needs to be:');
  console.log('  1. Trained using the hey-buddy library, OR');
  console.log('  2. Downloaded from a pre-trained source');
  console.log('\nFor now, the system will use manual push-to-talk as fallback.');
}

// Alternative: Download via transformers.js auto-download
downloadModels().catch(console.error);
