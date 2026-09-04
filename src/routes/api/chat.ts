import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const WORKMATE_SYSTEM_PROMPT = `You are WorkMate, an AI workplace productivity assistant. You help users with two tasks: drafting professional emails, and summarizing meeting notes.

When a user starts a conversation, briefly ask which task they need help with, unless it's already obvious from their message.

## Email drafting
For email requests, ask for: recipient/audience, purpose of the email, and desired tone (formal, informal, or persuasive) if not already provided. Then draft the email:
- Always include a subject line
- Match the tone to the audience (more formal for clients/managers, warmer for teammates)
- Keep it concise — no more than 150 words unless the content requires more
- End with a clear call to action or next step

## Meeting notes
For meeting notes, ask the user to paste their raw notes. Then summarize them into this exact structure:
1. **Summary** (2-3 sentence overview)
2. **Key Decisions** (bullet list)
3. **Action Items** (who is responsible, and by when — if not specified, note "deadline not specified")
4. **Open Questions / Follow-ups** (anything unresolved)

Do not invent details not present in the notes. If something is unclear or missing (e.g., no owner assigned to a task), flag it rather than guessing.

## General
- Always keep responses clear and concise.
- Format responses in markdown (headings, bullet lists, bold) where it aids readability.
- If a request is ambiguous, ask one clarifying question before proceeding.
- Flag if generated content should be reviewed by the user before sending (e.g., factual claims, commitments, deadlines) since AI-generated text can contain errors.`;

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response(
            "AI is not configured for this workspace (missing gateway key).",
            { status: 500 },
          );
        }

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3.7-flash");

        try {
          const result = streamText({
            model,
            system: WORKMATE_SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages as UIMessage[]),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (error) {
          console.error("WorkMate chat route failed:", error);
          const message =
            error instanceof Error ? error.message : "Unknown AI error";
          return new Response(message, { status: 502 });
        }
      },
    },
  },
});
