import { pipeline, cos_sim } from '@xenova/transformers';
const TASK_UTTERANCES = [
    "lock my laptop",
    "lock my screen",
    "secure my workstation",
    "open notepad",
    "open browser",
    "kill process",
    "stop task",
    "run a command",
    "execute script",
    "deploy the application",
    "build the project",
    "restart the server",
    "take a screenshot",
    "capture screen",
    "what is my network status",
    "find all files",
    "search for a file",
    "create a file",
    "delete file",
    "check system info",
    "get hardware info",
    "turn off computer",
    "schedule a timer",
    "remind me",
    "do this in background",
    "start dev server",
    "fetch data",
    "download from url"
];
const CHAT_UTTERANCES = [
    "hello",
    "hi there",
    "good morning",
    "good afternoon",
    "how are you",
    "what is your name",
    "who are you",
    "tell me a joke",
    "can we chat",
    "thanks",
    "thank you",
    "awesome",
    "great job",
    "what do you think about AI",
    "I'm feeling good today",
    "can you help me with something",
    "let's talk",
    "what is the meaning of life",
    "goodbye",
    "see you later"
];
export class SemanticRouter {
    static instance;
    extractor = null;
    taskEmbeddings = [];
    chatEmbeddings = [];
    isInitialized = false;
    initPromise = null;
    constructor() { }
    static getInstance() {
        if (!SemanticRouter.instance) {
            SemanticRouter.instance = new SemanticRouter();
        }
        return SemanticRouter.instance;
    }
    async init() {
        if (this.isInitialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = (async () => {
            console.log('[SemanticRouter] Initializing local embedding pipeline (Xenova/all-MiniLM-L6-v2)...');
            const start = Date.now();
            // Allocate pipeline
            this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            // Pre-compute embeddings for all utterances
            const taskOutput = await this.extractor(TASK_UTTERANCES, { pooling: 'mean', normalize: true });
            this.taskEmbeddings = taskOutput.tolist();
            const chatOutput = await this.extractor(CHAT_UTTERANCES, { pooling: 'mean', normalize: true });
            this.chatEmbeddings = chatOutput.tolist();
            this.isInitialized = true;
            console.log(`[SemanticRouter] Initialization complete in ${Date.now() - start}ms.`);
        })();
        return this.initPromise;
    }
    async classifyIntent(input, threshold = 0.80) {
        if (!this.isInitialized) {
            await this.init();
        }
        const start = Date.now();
        // 1. Embed user input
        const inputOutput = await this.extractor(input, { pooling: 'mean', normalize: true });
        const inputEmbedding = inputOutput.tolist()[0];
        // 2. Calculate Maximum Similarity (KNN) against Task route
        let maxTaskScore = 0;
        for (const taskEmb of this.taskEmbeddings) {
            const score = cos_sim(inputEmbedding, taskEmb);
            if (score > maxTaskScore)
                maxTaskScore = score;
        }
        // 3. Calculate Maximum Similarity against Chat route
        let maxChatScore = 0;
        for (const chatEmb of this.chatEmbeddings) {
            const score = cos_sim(inputEmbedding, chatEmb);
            if (score > maxChatScore)
                maxChatScore = score;
        }
        const duration = Date.now() - start;
        const confidence = Math.max(maxTaskScore, maxChatScore);
        const route = maxTaskScore > maxChatScore ? 'task' : 'chat';
        console.log(`[SemanticRouter] Input: "${input}" | Predicted: ${route} | TaskScore: ${maxTaskScore.toFixed(3)} | ChatScore: ${maxChatScore.toFixed(3)} | Duration: ${duration}ms`);
        if (confidence < threshold) {
            // Ambiguous
            return { route: 'chat', confidence }; // LLM fallback logic is handled in caller
        }
        return { route, confidence };
    }
}
