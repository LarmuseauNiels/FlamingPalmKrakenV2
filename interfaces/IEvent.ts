export default interface IEvent {
    name: string;
    once: boolean;
    execute(...args: any[]): void;
}