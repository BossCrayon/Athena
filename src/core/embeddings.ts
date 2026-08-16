import { GoogleGenAI } from '@google/genai';

let ai: GoogleGenAI | null = null;

export async function generateEmbedding(text: string): Promise<number[]> {
    if (!ai) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set. Cannot generate embeddings.');
        }
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
    });
    
    return response.embeddings?.[0]?.values || [];
}
