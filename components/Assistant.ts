import { OpenAI } from "openai";

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
      instructions:
        "You are a helpful assistant. In the form of a discord bot in the gaming clan FlamingPalm. You help members with questions about the clan and finding info about the upcoming events.\n" +
        "About FlamingPalm:\n" +
        "The Flaming Palm is a gaming community that specializes in organizing and hosting events to foster unity among our members. We are an active community involved in a variety of games and warmly welcome new members to join us.\n" +
        "Rules:\n" +
        "Our community thrives on mutual respect and a positive environment. To maintain this atmosphere, we have a few essential rules:\n" +
        "Respect is Key: Treat all members with respect. Bullying, harassment, and hate speech are strictly prohibited.\n" +
        "- No Spam: Avoid spamming in any channel.\n" +
        "- No Recruitment: Do not recruit for other clans or communities within our Discord.\n" +
        "- NSFW Content: NSFW content is not allowed.\n" +
        "- No Extreme Toxicity: Maintain a friendly and welcoming demeanor.\n" +
        "Failure to comply with these rules can result in post removal, warnings, or even a ban.\n" +
        "Roles:\n" +
        "We offer several game-specific roles that can be self-assigned by anyone using the channels & roles option. By assigning these roles, you gain access to the necessary text channels and receive game event notifications.\n" +
        "Channels & Roles \n" +
        "Events\n" +
        "We organize a variety of events on a weekly or biweekly basis. You can find information about these events in the Discord Events tab or on our website's calendar.\n" +
        "Raids\n" +
        "Anyone can create a new raid using /create-raid !\n" +
        "Once enough people have signed up using /raids the kraken bot will message the participants to help find a time and date to schedule the raid!\n" +
        "Points & Achievements\n" +
        "Members of our community have the opportunity to earn Achievements through various activities, with a primary focus on participating in events and recruiting new members. These Achievements grant fpg points. The accumulated points can be redeemed for rewards on our website https://flamingpalm.com",
      tools: [
        {
          type: "function",
          function: {
            name: "getEvents",
            description: "Get the events for the week",
          },
        },
        {
          type: "function",
          function: {
            name: "getRaids",
            description: "Get the current available raids to join",
          },
        },
        {
          type: "function",
          function: {
            name: "getStore",
            description: "Get the current available rewards in the store",
          },
        },
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

  async createAndPollRun() {
    try {
      let run = await this.openai.beta.threads.runs.createAndPoll(
        this.thread.id,
        {
          assistant_id: this.assistant.id,
        }
      );
      return this.handleRunStatus(run);
    } catch (error) {
      console.error("Error creating and polling run:", error);
    }
  }

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

  async handleCompletedRun() {
    try {
      let messages = await this.openai.beta.threads.messages.list(
        this.thread.id
      );
      return messages.data;
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  }

  async handleRequiresAction(run) {
    if (
      run.required_action &&
      run.required_action.submit_tool_outputs &&
      run.required_action.submit_tool_outputs.tool_calls
    ) {
      try {
        const toolOutputs = await this.collectToolOutputs(
          run.required_action.submit_tool_outputs.tool_calls
        );
        console.log("Tool outputs collected:", toolOutputs);

        if (toolOutputs.length > 0) {
          run = await this.submitToolOutputs(run, toolOutputs);
          console.log("Tool outputs submitted successfully.");
        } else {
          console.log("No tool outputs to submit.");
        }

        return this.handleRunStatus(run);
      } catch (error) {
        console.error("Error handling requires action:", error);
      }
    }
  }

  // Helper method to collect tool outputs asynchronously
  async collectToolOutputs(toolCalls) {
    console.log(toolCalls);
    // Wait for all asynchronous tool calls to complete
    const toolOutputs = await Promise.all(
      toolCalls.map(async (tool) => {
        switch (tool.function.name) {
          case "getEvents":
            return {
              tool_call_id: tool.id,
              output: await this.getEventsString(),
            };
          case "getRaids":
            return {
              tool_call_id: tool.id,
              output: await this.getRaidsString(),
            };
          case "getStore":
            return {
              tool_call_id: tool.id,
              output: await this.getStoreString(),
            };
          default:
            return null; // Return null if no matching tool found
        }
      })
    );

    return toolOutputs.filter((output) => output !== null);
  }

  async getRaidsString(): Promise<string> {
    const raids = await globalThis.client.prisma.raids.findMany({
      include: { RaidAttendees: true },
      where: { Status: 1 },
    });
    let string = "";
    raids.forEach((raid) => {
      string += `Raid: ${raid.Title} - Attendees: ${raid.RaidAttendees.length}/${raid.MinPlayers} \n`;
    });
    return string;
  }

  async getEventsString(): Promise<string> {
    let string = "";
    for (let e of globalThis.client.events) {
      console.log(e[0]);
      let event = globalThis.client.events.get(e[0]);
      console.log(event);
      string += `Event: ${event.name} - Date: ${new Date(
        event.scheduledStartTimestamp
      ).toString()} - Description: ${event.description} - Link: ${
        event.url
      } \n`;
    }
    console.log(string);
    return string;
  }

  async getStoreString(): Promise<string> {
    let rewards = await global.client.prisma.reward.findMany({
      include: { RewardItem: true },
      orderBy: { Price: "asc" },
    });
    let string = "";
    rewards.forEach((reward) => {
      if (reward.visible) {
        let stock = reward.RewardItem.filter((x) => x.RedeemedBy === "").length;
        if (stock === 0) string += `Reward: ${reward.Title} - Out of stock \n`;
        else if (reward.nonSalePrice && reward.nonSalePrice > 0)
          string += `Reward: ${reward.Title} - Price: ~~${reward.nonSalePrice}~~ **${reward.Price}:palm_tree:** \n`;
        else {
          string += `Reward: ${reward.Title} - Price: **${reward.Price}:palm_tree:** \n`;
        }
      }
    });
    return string;
  }

  async submitToolOutputs(run, toolOutputs) {
    try {
      return await this.openai.beta.threads.runs.submitToolOutputsAndPoll(
        this.thread.id,
        run.id,
        { tool_outputs: toolOutputs }
      );
    } catch (error) {
      console.error("Error submitting tool outputs:", error);
    }
  }
}
