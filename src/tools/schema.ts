export interface ToolParameter {
    name: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    required: boolean;
}

export interface ToolSchema {
    name: string;
    description: string;
    parameters: ToolParameter[];
}