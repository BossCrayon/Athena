const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
async function run() {
  try {
    const int1 = await ai.interactions.create({
      model: 'gemini-3.6-flash',
      input: 'what time is it?',
      tools: [{ type: 'function', name: 'get_time', description: 'Gets time', parameters: { type: 'object', properties: {} } }]
    });
    const callId = int1.steps.find(s => s.type === 'function_call').id;
    console.log('Call ID:', callId);
    const int2 = await ai.interactions.create({
      model: 'gemini-3.6-flash',
      previous_interaction_id: int1.id,
      input: [{ type: 'function_result', name: 'get_time', call_id: callId, result: { time: '12:00' } }]
    });
    console.log(int2.output_text);
  } catch (e) { console.dir(e, {depth: null}); }
}
run();
