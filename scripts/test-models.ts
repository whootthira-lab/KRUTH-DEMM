import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Load env vars
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.error(e);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const modelsToTest = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307'
];

async function main() {
  console.log("Testing Claude models with key:", process.env.ANTHROPIC_API_KEY ? "EXISTS" : "MISSING");
  
  for (const model of modelsToTest) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      console.log(`✅ SUCCESS with model: ${model}`);
      console.log(`   Response: ${response.content[0].type === 'text' ? (response.content[0] as any).text : ''}`);
      break; // Stop at first successful model
    } catch (e: any) {
      console.log(`❌ FAILED with model: ${model}. Error: ${e.message}`);
    }
  }
}

main().catch(console.error);
