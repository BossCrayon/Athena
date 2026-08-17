type EventHandler = (event: any) => void;

export class EventBus {
    private listeners = new Map<string, Set<EventHandler>>();

    subscribe(eventType: string, handler: EventHandler): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(handler);
    }

    unsubscribe(eventType: string, handler: EventHandler): void {
        const typeListeners = this.listeners.get(eventType);
        if (typeListeners) {
            typeListeners.delete(handler);
        }
    }

    emit(eventType: string, payload: any): void {
        const typeListeners = this.listeners.get(eventType);
        if (typeListeners) {
            for (const handler of typeListeners) {
                try {
                    handler(payload);
                } catch (e) {
                    console.error(`[EventBus] Error in handler for event ${eventType}:`, e);
                }
            }
        }
    }
}
