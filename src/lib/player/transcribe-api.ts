import { createServerFn } from "@tanstack/react-start";

function asJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function toLyricLines(text: string) {
  return text
    .split(/\r?\n+/)
    .map((row) => row.replace(/^\d+\s*[:.\-)]\s*/, "").trim())
    .filter((row) => row && !/^\[.*\]$/.test(row));
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((d: { audio?: string; mime?: string; url?: string; artist?: string; title?: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available in this environment." };

    let text = "";
    const audio = data.audio?.trim();
    const url = data.url?.trim();
    if (audio || (url && /^https?:\/\//i.test(url))) {
      const form = new FormData();
      form.append("format", "true");
      form.append("language", "en");
      if (data.title) form.append("keyterm", `${data.artist || ""} ${data.title}`.trim());
      if (audio) {
        const binary = atob(audio);
        const raw = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        if (raw.byteLength > 8_000_000) return { ok: false as const, error: "Clip is too long to transcribe." };
        const mime = data.mime || "audio/webm";
        const name = mime.includes("wav") ? "clip.wav" : mime.includes("mp4") || mime.includes("m4a") ? "clip.m4a" : "clip.webm";
        form.append("file", new Blob([raw], { type: mime }), name);
      } else if (url) {
        form.append("url", url);
      }
      const res = await fetch("https://api.x.ai/v1/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const body = asJson(await res.json().catch(() => ({})));
      if (!res.ok) {
        return { ok: false as const, error: str(body.error) || `Transcription failed (${res.status}).` };
      }
      text = str(body.text);
    }

    if (!text) {
      const artist = str(data.artist);
      const title = str(data.title);
      if (!artist && !title) return { ok: false as const, error: "Nothing to transcribe." };
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 700,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You transcribe and recall song lyrics. Return only the lyrics, one line per line, no commentary, no verse labels unless they appear in the song.",
            },
            {
              role: "user",
              content: `Lyrics for "${title}" by ${artist}. If you are not sure, return the most likely official lyrics.`,
            },
          ],
        }),
      });
      const body = asJson(await res.json().catch(() => ({})));
      if (!res.ok) return { ok: false as const, error: `AI lyrics failed (${res.status}).` };
      const choices = Array.isArray(body.choices) ? body.choices : [];
      text = str(asJson(asJson(choices[0]).message).content);
    }

    const lines = toLyricLines(text);
    if (!lines.length) return { ok: false as const, error: "No lyrics came back." };
    return { ok: true as const, plain: lines.join("\n"), lines };
  });
