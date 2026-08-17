import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
    });
    
    try {
        const response = await client.chat.completions.create({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 1000
        });
        
        console.log(response.choices[0].message.content);
        console.log("SUCCESS");
    } catch (e: any) {
        console.error("FAILED:", e.message);
    }
}
run();
