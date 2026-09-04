import { useCallback, useRef, useState } from "react";

type RecorderState = "idle" | "recording" | "transcribing";

const TARGET_RATE = 16000;

function downsample(chunks: Float32Array[], from: number, to: number) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  if (to >= from) return merged;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(merged.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), merged.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j] ?? 0;
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function useVoiceRecorder({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const teardown = useCallback(async () => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const ctx = ctxRef.current;
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") await ctx.close();
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      node.onaudioprocess = (event) => {
        chunksRef.current.push(
          new Float32Array(event.inputBuffer.getChannelData(0)),
        );
      };
      source.connect(node);
      node.connect(ctx.destination);
      streamRef.current = stream;
      ctxRef.current = ctx;
      sourceRef.current = source;
      nodeRef.current = node;
      setState("recording");
    } catch {
      onError("Microphone access is needed to record meeting notes.");
      await teardown();
      setState("idle");
    }
  }, [state, onError, teardown]);

  const cancel = useCallback(async () => {
    chunksRef.current = [];
    await teardown();
    setState("idle");
  }, [teardown]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    const rate = ctxRef.current?.sampleRate ?? TARGET_RATE;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    await teardown();

    const samples = downsample(chunks, rate, TARGET_RATE);
    const blob = encodeWav(samples, TARGET_RATE);
    if (blob.size < 4096) {
      onError("That recording was empty — please try again.");
      setState("idle");
      return;
    }

    setState("transcribing");
    try {
      const body = new FormData();
      body.append("audio", blob, "recording.wav");
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body,
      });
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Transcription failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let transcript = "";
      let done = false;
      while (!done) {
        const { value, done: finished } = await reader.read();
        done = finished;
        buffer += decoder.decode(value ?? new Uint8Array(), {
          stream: !finished,
        });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const event = JSON.parse(payload) as {
              type?: string;
              delta?: string;
              text?: string;
            };
            if (event.type === "transcript.text.delta" && event.delta) {
              transcript += event.delta;
              onTranscript(transcript);
            } else if (event.type === "transcript.text.done" && event.text) {
              transcript = event.text;
              onTranscript(transcript);
            }
          } catch {
            // Ignore malformed SSE frames.
          }
        }
      }

      if (!transcript.trim()) {
        onError("We couldn't hear any speech in that recording.");
      }
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Transcription failed — please try again.",
      );
    } finally {
      setState("idle");
    }
  }, [state, teardown, onTranscript, onError]);

  return { state, start, stop, cancel };
}
