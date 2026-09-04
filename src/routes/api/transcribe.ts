import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response("Transcription is not configured.", {
            status: 500,
          });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Expected multipart/form-data.", { status: 400 });
        }

        const file = form.get("audio");
        if (!(file instanceof File) || file.size === 0) {
          return new Response("No audio uploaded.", { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return new Response("Recording is too large to transcribe.", {
            status: 413,
          });
        }
        if (!file.type.startsWith("audio/")) {
          return new Response("Unsupported file type.", { status: 400 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-transcribe");
        upstream.append("file", file, "recording.wav");
        upstream.append("stream", "true");

        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: upstream,
          },
        );

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          return new Response(
            detail || `Transcription failed (${response.status}).`,
            { status: response.status },
          );
        }

        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
