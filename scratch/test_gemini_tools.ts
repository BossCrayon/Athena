import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    try {
        const stream = await ai.models.generateContentStream({
            model: 'gemini-3.6-flash',
            contents: 'Test',
            tools: [{
                functionDeclarations: [{
                    name: 'get_battery_level',
                    description: 'get battery',
                    parameters: {
                        type: 'object',
                        properties: {}
                    }
                }]
            }]
        });
        
        for await (const chunk of stream) {
            console.log(chunk.text);
        }
        console.log("SUCCESS");
    } catch (e: any) {
        console.error("FAILED:");
        console.dir(e, { depth: null });
    }
}
run();
