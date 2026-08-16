import * as dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const response = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: 'hello',
            config: {
                outputDimensionality: 768
            }
        });
        const dims = response.embeddings?.[0]?.values?.length;
        console.log('Success, dimensions:', dims);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}
run();
