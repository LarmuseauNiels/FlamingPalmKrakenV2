import {OpenAI} from 'openai';
import {jsonify} from "./ApiFunctions/Helpers";

export class Assistant {
    private openai: any;
    private assistant: any;
    private thread: any;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.setupAssistant();
    }

    private async setupAssistant() {
        this.assistant = await this.openai.beta.assistants.create({
            name: "Kraken",
            instructions: "You are a helpful assistant. In the form of a discord bot in the gaming clan FlamingPalm. You help members with questions about the clan and finding info about the upcoming events.\n" +
                "About FlamingPalm:\n" +
                "The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. We are an active community involved in a variety of games and warmly welcome new members to join us.\n" +
                "Rules:\n" +
                "Our community thrives on mutual respect and a positive environment. To maintain this atmosphere, we have a few essential rules:\n" +
                "Respect is Key: Treat all members with respect. Bullying, harassment, and hate speech are strictly prohibited.\n" +
                "    No Spam: Avoid spamming in any channel.\n" +
                "    No Recruitment: Do not recruit for other clans or communities within our Discord.\n" +
                "    NSFW Content: NSFW content is not allowed.\n" +
                "    No Extreme Toxicity: Maintain a friendly and welcoming demeanor.\n" +
                "Failure to comply with these rules can result in post removal, warnings, or even a ban.\n" +
                "Roles:\n" +
                "We offer several game-specific roles that can be self-assigned by anyone using the channels & roles option. By assigning these roles, you gain access to the necessary text channels and receive game event notifications.\n" +
                "Channels & Roles \n" +
                "Events\n" +
                "We organize a variety of events on a weekly or biweekly basis. You can find information about these events in the Discord Events tab or on our website's calendar.\n" +
                "Raids\n" +
                "Anyone can create a new raid using /create-raid !\n" +
                "Once enough people have signed up using /raid the kraken bot will message the participants to help find a time and date to schedule the raid!\n" +
                "Points & Achievements\n" +
                "Members of our community have the opportunity to earn Achievements through various activities, with a primary focus on participating in events and recruiting new members. These Achievements grant fpg points. The accumulated points can be redeemed for rewards on our website (flamingpalm.com).",
            tools: [
                {
                    type: "function",
                    function: {
                        name: "getEvents",
                        description: "Get the events for the week"
                    },
                }
            ],
            model: "gpt-4o-mini",
        });
    }

    public async ask(question: string) {

        this.thread = await this.openai.beta.threads.create();
        let message = this.openai.beta.threads.messages.create(this.thread.id, {
            role: "user",
            content: question,
        });
        return await this.createAndPollRun();
    }



    // Method to create and poll a run
    async createAndPollRun() {
        try {
            let run = await this.openai.beta.threads.runs.createAndPoll(this.thread.id, {
                assistant_id: this.assistant.id,
            });
            return this.handleRunStatus(run);
        } catch (error) {
            console.error("Error creating and polling run:", error);
        }
    }

    // Method to handle the run status
    async handleRunStatus(run) {
        switch (run.status) {
            case "completed":
                return await this.handleCompletedRun();
            case "requires_action":
                return await this.handleRequiresAction(run);
            default:
                console.error("Run did not complete successfully:", run);
        }
    }

    // Method to handle a completed run
    async handleCompletedRun() {
        try {
            let messages = await this.openai.beta.threads.messages.list(this.thread.id);
            return messages.data;
        } catch (error) {
            console.error("Error fetching messages:", error);
        }
    }

    // Method to handle runs that require action
    async handleRequiresAction(run) {
        // Check if there are tools that require outputs
        if (
            run.required_action &&
            run.required_action.submit_tool_outputs &&
            run.required_action.submit_tool_outputs.tool_calls
        ) {
            const toolOutputs = this.collectToolOutputs(run.required_action.submit_tool_outputs.tool_calls);
            console.log("Tool outputs collected:", toolOutputs);
            // Submit all tool outputs if any are collected
            if (toolOutputs.length > 0) {
                try {
                    run = await this.submitToolOutputs(run, toolOutputs);
                    console.log("Tool outputs submitted successfully.");
                } catch (error) {
                    console.error("Error submitting tool outputs:", error);
                }
            } else {
                console.log("No tool outputs to submit.");
            }

            // Recheck status after submitting tool outputs
            return this.handleRunStatus(run);
        }
    }

    // Helper method to collect tool outputs based on tool function names
     collectToolOutputs(toolCalls) {
        console.log(toolCalls);
        return toolCalls.map((tool) => {
            switch (tool.function.name) {
                case "getEvents":
                    return {
                        tool_call_id: tool.id,
                        output: this.getEventsString(), // Example temperature output
                    };
                default:
                    return null; // Return null if no matching tool found
            }
        }).filter(output => output !== null); // Filter out null values
    }

     getEventsString(): string {
        let string = "";
        for (let e of globalThis.client.events){
            console.log(e[0]);
            let event = globalThis.client.events.get(e[0]);
            console.log(event);
            string += `Event: ${event.name} - Date: ${new Date(event.scheduledStartTimestamp).toString()} - Description: ${event.description} \n`;
        }
        console.log(string);
        return string;
    }

    // Helper method to submit tool outputs and poll for updates
    async submitToolOutputs(run, toolOutputs) {
        return await this.openai.beta.threads.runs.submitToolOutputsAndPoll(
            this.thread.id,
            run.id,
            { tool_outputs: toolOutputs },
        );
    }


}