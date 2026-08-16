import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let interaction = await ai.interactions.create({
        model: 'gemini-3.6-flash',
        input: 'Get system info',
        tools: [{
            type: 'function',
            name: 'get_system_info',
            description: 'Gets system info',
        }]
    });

    console.log(interaction.outputs);
    
    if (interaction.outputs[0].type === 'function_call') {
        const call = interaction.outputs[0];
        console.log("Calling continue with function_result...");
        
        try {
            interaction = await ai.interactions.create({
                model: 'gemini-3.6-flash',
                previous_interaction_id: interaction.id,
                input: [
                    {
                        type: 'function_result',
                        name: call.name,
                        call_id: call.id,
                        result: {
                            success: true,
                            output: "Windows 11"
                        }
                    }
                ],
                tools: [{
                    type: 'function',
                    name: 'get_system_info',
                    description: 'Gets system info',
                }]
            });
            console.log("Success!", interaction.outputs);
        } catch (err) {
            console.error("Error from continue:", err);
        }
    }
}

run();
